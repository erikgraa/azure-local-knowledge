import { createHash } from 'node:crypto';

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Learn / Markdig style heading anchor: lowercase, punctuation (incl. dots) removed, spaces -> hyphens. */
export function headingAnchor(text) {
  return stripMarkdown(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function truncate(s, max) {
  if (s == null) return null;
  const str = String(s).trim();
  if (str.length <= max) return str;
  const cut = str.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/** Markdown/HTML -> readable plain text. Keeps inline code content, drops images/comments. */
export function stripMarkdown(md) {
  if (md == null) return '';
  return String(md)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/`+/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function firstSentence(s, max = 140) {
  const text = collapse(s);
  if (!text) return '';
  const m = text.match(/^(.{20,}?[.!?])(\s|$)/);
  const sentence = m ? m[1] : text;
  return truncate(sentence, max);
}

export function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (v == null) continue;
    const key = typeof v === 'string' ? v : JSON.stringify(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function titleCase(s) {
  return String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
