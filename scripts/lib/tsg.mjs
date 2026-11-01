import { canonicalArea } from './areas.mjs';
import { extractErrorCodes, finalizeErrorStrings, inlineErrorSpans, isErrorish, looksLikeCommand } from './errors.mjs';
import { nodesProse, scanMarkdown, sectionWithChildren, toSections } from './markdown.mjs';
import { collapse, dedupe, headingAnchor, slugify, stripMarkdown, titleCase, truncate } from './text.mjs';
import { extractVersions } from './versions.mjs';

export const TSG_REPO = 'Azure/AzureLocal-Supportability';
export const TSG_BRANCH = 'main';

const GENERIC_HEADING =
  /^(symptoms?|issues?|problems?|overview|description|summary|background|details?|errors?:?|causes?|potential causes|root causes?|mitigations?( details)?|resolutions?|workarounds?|solutions?|prerequisites?|scenario|introduction|steps|issue validation)\b/i;
const BOILERPLATE_HEADING = /^(table of contents|contents|revision history|document history|change ?log|toc)\b/i;
const SYMPTOM_HEADING = /^(symptoms?|issue|problem|description|overview|scenario|what('s| is) (happening|the issue)|summary|error description)\b/i;
const MITIGATION_HEADING = /^(mitigations?|resolutions?|workarounds?|fix(es)?|solutions?|remediations?|resolve|how to (fix|resolve|mitigate)|recommended (action|steps))\b/i;
const ERRORISH_HEADING = /(error|exception|message|log|failure|output|alert|event)/i;
const TEXT_LANGS = new Set(['', 'text', 'txt', 'log', 'output', 'console', 'plaintext', 'plain', 'json', 'none']);

export function tsgUrl(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${TSG_REPO}/blob/${TSG_BRANCH}/${encoded}`;
}

export function tsgIdFromPath(path) {
  return `tsg-${slugify(path.replace(/^TSG\//i, '').replace(/\.md$/i, ''))}`;
}

/** { 'TSG/Deployment/x.md': 'Label' } from the README.md index files found alongside the TSGs. */
export function parseReadmeIndex(readmePath, content) {
  const dir = readmePath.split('/').slice(0, -1);
  const map = {};
  for (const m of String(content ?? '').matchAll(/\[([^\]]+)\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
    const target = m[2];
    if (/^https?:/i.test(target)) continue;
    const parts = [...dir];
    for (const seg of decodeURIComponent(target).split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    map[parts.join('/')] = collapse(stripMarkdown(m[1]));
  }
  return map;
}

/** Paths that are never troubleshooting content: indexes, images, contribution templates. */
export function isExcludedTsgPath(path) {
  return (
    /(^|\/)README\.md$/i.test(path) ||
    /(^|\/)(images?|media|assets)\//i.test(path) ||
    /(^|\/)templates?\//i.test(path) ||
    /(^|\/)(contributing|template)[^/]*\.md$/i.test(path)
  );
}

/** Newer TSGs start with `<!-- tsg-metadata {json} -->`; envchecker detector signals are validator names. */
export function parseTsgMetadata(content) {
  const out = { signals: [], raw: null };
  const m = /<!--\s*tsg-metadata\s*([\s\S]*?)-->/.exec(String(content ?? ''));
  if (!m) return out;
  try {
    const json = JSON.parse(m[1]);
    out.raw = json;
    const signal = json?.detector?.signal;
    if (typeof signal === 'string' && json?.detector?.type === 'envchecker') {
      out.signals = signal.split('|').map((s) => s.trim()).filter((s) => /^[\w.-]{4,120}$/.test(s));
    }
  } catch {
    /* malformed metadata is ignored */
  }
  return out;
}

function humanizeFileName(path) {
  const base = path.split('/').pop().replace(/\.md$/i, '');
  return titleCase(base.replace(/^TSG[-_ ]*/i, '')) || base;
}

/** Split 'TSG | 23H2 | 10.2411.3.2 | Missing SPN' into clean title + version metadata. */
export function parseTitle(rawTitle) {
  const raw = collapse(stripMarkdown(rawTitle));
  let parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
  const meta = [];
  const keep = [];
  if (parts.length > 1) {
    parts.forEach((p, idx) => {
      const isMeta =
        (idx === 0 && /^\[?TSG\]?$/i.test(p)) ||
        /^(2[34]H2)$/i.test(p) ||
        /^1[0-2]\.\d{4}\.\d+\.\d+$/.test(p) ||
        /^(\d{4}(\.\d+)?)(\s*(,|and|&)\s*\d{4}(\.\d+)?)*$/.test(p);
      (isMeta ? meta : keep).push(p);
    });
    parts = keep;
  }
  let title = parts.join(': ') || raw;
  title = title.replace(/^\[?TSG\]?\s*[:\-–—]\s*/i, '').trim();
  return { title: title || raw, versionText: meta.length ? meta.join(' | ') : null };
}

function proseOf(sections, index) {
  const tree = sectionWithChildren(sections, index);
  return tree.map((s) => nodesProse(s.nodes)).join('\n');
}

/** Drop image lines, collapse blanks; keep list/numbered structure as lines. */
function cleanProse(raw, maxChars) {
  const lines = String(raw)
    .split('\n')
    .map((l) => stripMarkdown(l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, (m) => m.trim() + ' ')))
    .map((l) => l.trim())
    .filter((l) => l && !/^[|\-:\s]+$/.test(l));
  return truncate(lines.join('\n'), maxChars);
}

function summarize(text, maxChars) {
  if (!text) return null;
  const lines = text.split('\n').slice(0, 6);
  return truncate(lines.join(' '), maxChars);
}

/**
 * Parse one TSG markdown file into a normalized, partial record.
 * Unknown fields stay null / empty - callers merge in dates and cross-links.
 */
export function parseTsg({ path, content, readmeTitle = null }) {
  const nodes = scanMarkdown(String(content ?? '').replace(/<!--[\s\S]*?-->/g, ''));
  const sections = toSections(nodes);

  // The first non-boilerplate H1 is the title, unless a generic section heading (# Symptoms) comes first.
  let titleHeading = null;
  for (const n of nodes) {
    if (n.type !== 'heading' || n.level !== 1) continue;
    const text = n.text.replace(/[:\s]+$/, '');
    if (BOILERPLATE_HEADING.test(text)) continue;
    if (!GENERIC_HEADING.test(text)) titleHeading = n;
    break;
  }
  const h1IsTitle = Boolean(titleHeading);
  const rawTitle = titleHeading ? titleHeading.text : readmeTitle || humanizeFileName(path);
  const { title, versionText } = parseTitle(rawTitle);

  const meta = parseTsgMetadata(content);
  const versionSources = [rawTitle, readmeTitle ?? '', path.split('/').pop().replace(/\.md$/i, '')];
  const versions = extractVersions(versionSources.join(' | '));

  const segments = path.split('/');
  const areaRaw = segments.length > 2 ? segments[1] : null;
  const subarea = segments.length > 3 ? segments.slice(2, -1).join('/') : null;

  // Symptoms
  let symptomsText = null;
  const symIdx = sections.findIndex((s) => s.level > 0 && SYMPTOM_HEADING.test(s.title.replace(/[:\s]+$/, '')));
  if (symIdx >= 0) symptomsText = cleanProse(proseOf(sections, symIdx), 900);
  if (!symptomsText) {
    const titleSection = h1IsTitle ? sections.find((s) => s.level === 1) : sections[0];
    symptomsText = cleanProse(nodesProse((titleSection ?? sections[0]).nodes), 700) || null;
  }

  // Mitigation
  let mitigation = null;
  const mitIdx = sections.findIndex((s) => s.level > 0 && MITIGATION_HEADING.test(s.title.replace(/[:\s]+$/, '')));
  if (mitIdx >= 0) mitigation = cleanProse(proseOf(sections, mitIdx), 2500) || null;

  // Error strings: fenced blocks that aren't commands + prose under error-ish headings.
  const errors = [];
  let pastMitigation = false;
  sections.forEach((s, i) => {
    if (i === mitIdx) pastMitigation = true;
    const titleClean = s.title.replace(/[:\s]+$/, '');
    const errorish = s.level > 0 && ERRORISH_HEADING.test(titleClean) && !MITIGATION_HEADING.test(titleClean);
    const mitigating = MITIGATION_HEADING.test(titleClean);
    if (mitigating || (pastMitigation && !errorish)) return;
    for (const n of s.nodes) {
      if (n.type === 'fence') {
        if (!n.text) continue;
        if (!errorish && !TEXT_LANGS.has(n.lang)) continue;
        if (!n.lang && looksLikeCommand(n.text)) continue;
        if (!errorish && !isErrorish(n.text)) continue;
        errors.push(n.text);
      }
    }
    if (errorish) {
      const paras = nodesProse(s.nodes)
        .split(/\n\s*\n/)
        .map((p) => stripMarkdown(p))
        .filter((p) => p && !looksLikeCommand(p));
      errors.push(...paras.slice(0, 3));
    }
  });
  if (symIdx >= 0) errors.push(...inlineErrorSpans(proseOf(sections, symIdx)));

  const errorStrings = finalizeErrorStrings(errors);
  const errorCodes = dedupe([...meta.signals, ...extractErrorCodes(errorStrings, title, symptomsText)]).slice(0, 14);

  const excerpt = truncate(
    cleanProse(
      nodes
        .filter((n) => n.type === 'text')
        .map((n) => n.text)
        .join('\n'),
      6000,
    ),
    3000,
  );

  return {
    path,
    title,
    versionText,
    areaRaw,
    area: canonicalArea(areaRaw) ?? 'General',
    subarea,
    versions,
    symptoms: symptomsText,
    mitigation,
    mitigationSummary: summarize(mitigation, 420),
    errorStrings,
    errorCodes,
    excerpt: excerpt || null,
    headings: dedupe(nodes.filter((n) => n.type === 'heading').map((n) => stripMarkdown(n.text))).slice(0, 30),
    anchors: nodes.filter((n) => n.type === 'heading').map((n) => headingAnchor(n.text)),
  };
}
