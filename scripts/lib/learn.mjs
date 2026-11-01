import { canonicalArea } from './areas.mjs';
import { extractErrorCodes, finalizeErrorStrings, inlineErrorSpans } from './errors.mjs';
import { parseTables } from './markdown.mjs';
import { collapse, dedupe, firstSentence, headingAnchor, sha256, stripMarkdown, truncate } from './text.mjs';
import { osVersionFromSolutionVersion, trainFromSolutionVersion, trainKey } from './versions.mjs';

export const LEARN_BASE = 'https://learn.microsoft.com/azure/azure-local';
export const DOCS_REPO = 'MicrosoftDocs/azure-stack-docs';
export const DOCS_DIR = 'azure-local';

const KIND_PRIORITY = { open: 0, carried: 1, expected: 2, fixed: 3 };

export function parseFrontMatter(md) {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(String(md ?? '').replace(/^\uFEFF/, ''));
  const out = { title: null, msDate: null };
  if (!m) return out;
  const title = /^title:\s*(.+)$/m.exec(m[1]);
  if (title) out.title = title[1].trim().replace(/^["']|["']$/g, '');
  const date = /^ms\.date:\s*['"]?(\d{1,2})\/(\d{1,2})\/(\d{4})['"]?/m.exec(m[1]);
  if (date) out.msDate = `${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`;
  return out;
}

function classifyHeading(text) {
  const t = collapse(stripMarkdown(text));
  if (/^fixed issues/i.test(t)) return 'fixed';
  if (/^known issues from previous/i.test(t)) return 'carried';
  if (/^known and expected/i.test(t)) return 'expected';
  if (/^known issues( in this release)?$/i.test(t)) return 'open';
  return null;
}

function pickColumns(header) {
  const find = (re) => header.findIndex((h) => re.test(h));
  return {
    feature: find(/feature|category|component|area/i),
    issue: find(/issue|behavior/i),
    comments: find(/workaround|comments|resolution/i),
    solution: find(/solution version/i),
  };
}

/**
 * Walk a Learn known-issues article and emit one entry per table row:
 * { file, view, train, kind, feature, bugId, issue, comments, solutionVersion, anchor, headingText }
 */
export function parseKnownIssueEntries(md, { file }) {
  const lines = String(md ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const entries = [];
  const ctx = { view: null, train: null, trainAnchor: null, trainHeading: null, kind: null };
  let buf = [];
  let fence = false;

  const flush = () => {
    if (ctx.train && ctx.kind && buf.length) {
      for (const table of parseTables(buf)) {
        const cols = pickColumns(table.header);
        if (cols.issue < 0) continue;
        for (const row of table.rows) {
          const issue = row[cols.issue] ?? '';
          if (!collapse(stripMarkdown(issue))) continue;
          const featureCell = cols.feature >= 0 ? row[cols.feature] ?? '' : '';
          const bug = /<!--\s*(\d{5,})\s*-->/.exec(featureCell) ?? /<!--\s*(\d{5,})\s*-->/.exec(issue);
          entries.push({
            file,
            view: ctx.view,
            train: ctx.train,
            kind: ctx.kind,
            feature: collapse(stripMarkdown(featureCell)) || null,
            bugId: bug ? bug[1] : null,
            issue: issue.replace(/<!--[\s\S]*?-->/g, '').trim(),
            comments: cols.comments >= 0 ? (row[cols.comments] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim() : '',
            solutionVersion: cols.solution >= 0 ? collapse(stripMarkdown(row[cols.solution] ?? '')) || null : null,
            anchor: ctx.trainAnchor,
            headingText: ctx.trainHeading,
          });
        }
      }
    }
    buf = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence) {
      const moniker = /^:::\s*moniker\s+range="([^"]+)"/.exec(line);
      if (moniker) {
        flush();
        const v = /=\s*(azloc-[\w-]+)/.exec(moniker[1]);
        ctx.view = v ? v[1] : null;
        continue;
      }
      if (/^:::\s*moniker-end/.test(line)) {
        flush();
        ctx.view = null;
        continue;
      }
      const h = /^(#{2,3})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        flush();
        const text = h[2];
        const version = /^(?:known )?issues for version\s+(\d{4}(?:\.\d+)?)/i.exec(collapse(stripMarkdown(text)));
        if (version) {
          ctx.train = version[1].replace(/\.0$/, '');
          ctx.trainAnchor = headingAnchor(text);
          ctx.trainHeading = collapse(stripMarkdown(text));
          ctx.kind = null;
        } else {
          ctx.kind = classifyHeading(text);
        }
        continue;
      }
    }
    buf.push(line);
  }
  flush();
  return entries;
}

const normalizeForKey = (s) =>
  stripMarkdown(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 400);

export const knownIssueKey = (e) => (e.bugId ? `bug-${e.bugId}` : `h-${sha256(normalizeForKey(e.issue)).slice(0, 12)}`);

export function learnUrl({ file, view, anchor }) {
  const page = file.replace(/\.md$/i, '');
  const query = view ? `?view=${view}` : '';
  return `${LEARN_BASE}/${page}${query}${anchor ? `#${anchor}` : ''}`;
}

/** './known-issues.md?view=azloc-2610&preserve-view=true' (relative to release-information) -> absolute Learn URL. */
export function resolveLearnLink(link) {
  try {
    const url = new URL(link, `${LEARN_BASE}/release-information-23h2`);
    url.pathname = url.pathname.replace(/\.md$/i, '');
    url.searchParams.delete('preserve-view');
    url.searchParams.delete('tabs');
    return url.href;
  } catch {
    return null;
  }
}

const TSG_LINK = /https?:\/\/github\.com\/Azure\/(?:AzureLocal|AzureStackHCI)-Supportability\/(?:blob|tree)\/[\w.-]+\/(TSG\/[^\s)>#"]+?\.md)/gi;

export function extractTsgPaths(...texts) {
  const out = [];
  for (const t of texts) for (const m of String(t ?? '').matchAll(TSG_LINK)) out.push(decodeURIComponent(m[1]));
  return dedupe(out);
}

export function issueTitle(issueText) {
  const trimmed = collapse(issueText).replace(
    /^(?:in this release(?: and previous releases)?|in previous releases|in some (?:cases|instances)|when)\b[,:]?\s*/i,
    '',
  );
  const t = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return firstSentence(t, 130) || 'Known issue';
}

/**
 * Collapse per-release rows into one record per distinct issue:
 * the same carried-over row shows up in dozens of releases.
 * @param {Array} entries from parseKnownIssueEntries (all files)
 * @param {Record<string,string|null>} fileDates file -> ISO date from front matter
 */
export function consolidateKnownIssues(entries, fileDates = {}) {
  const groups = new Map();
  for (const e of entries) {
    const key = knownIssueKey(e);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const items = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort(
      (a, b) => trainKey(b.train) - trainKey(a.train) || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
    );
    const live = sorted.filter((e) => e.kind !== 'fixed');
    const fixed = sorted.filter((e) => e.kind === 'fixed');
    const primary = live[0] ?? fixed[0];

    const trains = dedupe(live.map((e) => e.train)).sort((a, b) => trainKey(a) - trainKey(b));
    const fixedEntry = [...fixed].sort((a, b) => trainKey(a.train) - trainKey(b.train))[0] ?? null;
    const flags = [];
    let status = live.length && live.every((e) => e.kind === 'expected') ? 'expected' : 'open';
    if (fixedEntry) {
      if (status !== 'expected') status = 'fixed';
      const stale = trains.filter((t) => trainKey(t) > trainKey(fixedEntry.train));
      if (stale.length) {
        flags.push({
          kind: 'listed-after-fix',
          message: `Marked fixed in ${fixedEntry.train} but still listed as known in ${stale.join(', ')}.`,
        });
      }
    }

    const issueText = stripMarkdown(primary.issue);
    const workaround = stripMarkdown(live[0] ? live[0].comments : '') || stripMarkdown(fixedEntry?.comments ?? '');
    const errorStrings = finalizeErrorStrings(inlineErrorSpans(primary.issue));
    const tsgPaths = extractTsgPaths(primary.issue, primary.comments, ...sorted.map((e) => e.comments));
    const sourceText = [
      `Feature: ${primary.feature ?? ''}`,
      `Issue: ${issueText}`,
      `${live.length ? 'Workaround' : 'Resolution'}: ${workaround}`,
    ].join('\n');

    items.push({
      key,
      bugId: primary.bugId,
      feature: primary.feature,
      area: canonicalArea(primary.feature) ?? 'General',
      status,
      title: issueTitle(issueText),
      symptoms: truncate(issueText, 1200) || null,
      mitigation: truncate(workaround, 2500) || null,
      mitigationSummary: truncate(workaround.replace(/\s*\n\s*/g, ' '), 420) || null,
      errorStrings,
      errorCodes: extractErrorCodes(errorStrings, issueText),
      releases: trains,
      introducedIn: trains[0] ?? null,
      fixedIn: fixedEntry?.train ?? null,
      fixedInVersion: fixedEntry?.solutionVersion ?? null,
      url: learnUrl(primary),
      lastUpdated: fileDates[primary.file] ?? null,
      tsgPaths,
      flags,
      sourceText,
      sourceHash: sha256(`${normalizeForKey(primary.issue)}\n${normalizeForKey(primary.comments)}\n${primary.feature ?? ''}`),
      sourceRelease: primary.train,
      file: primary.file,
    });
  }
  return items;
}

/** Parse the 'Release information' tables into per-solution-version rows. */
export function parseReleaseInfo(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const rows = [];
  let supported = null;
  let block = [];
  const flush = () => {
    for (const table of parseTables(block)) {
      const vIdx = table.header.findIndex((h) => /solution version/i.test(h));
      if (vIdx < 0) continue;
      const osIdx = table.header.findIndex((h) => /os build/i.test(h));
      const kiIdx = table.header.findIndex((h) => /known issues/i.test(h));
      for (const row of table.rows) {
        const cell = row[vIdx] ?? '';
        const osBuild = osIdx >= 0 ? /\b\d{5}\.\d+\b/.exec(row[osIdx] ?? '')?.[0] ?? null : null;
        const kiLink = kiIdx >= 0 ? /\]\(([^)]+)\)/.exec(row[kiIdx] ?? '')?.[1] ?? null : null;
        const versions = [];
        for (const part of cell.split(/<br\s*\/?>/i)) {
          // Dates belong to the version that precedes them, even within one fragment
          // ("Availability date: X Supersedes: <older version>").
          for (const m of part.matchAll(/Availability date:\s*(\d{4}-\d{2}-\d{2})|\b(1[0-2]\.\d{4}\.\d+\.\d+)\b/gi)) {
            if (m[2]) versions.push({ version: m[2], date: null });
            else if (versions.length) versions[versions.length - 1].date = m[1];
          }
        }
        versions.forEach((v, i) => {
          const train = trainFromSolutionVersion(v.version);
          if (!train) return;
          rows.push({
            train,
            version: v.version,
            osVersion: osVersionFromSolutionVersion(v.version),
            osBuild: i === 0 ? osBuild : null,
            availabilityDate: v.date,
            supersededBy: i === 0 ? null : versions[0].version,
            supported,
            knownIssuesLink: kiLink,
          });
        });
      }
    }
    block = [];
  };
  for (const line of lines) {
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      if (/^supported versions/i.test(h[2])) supported = true;
      else if (/^older versions/i.test(h[2])) supported = false;
      continue;
    }
    block.push(line);
  }
  flush();
  return rows;
}
