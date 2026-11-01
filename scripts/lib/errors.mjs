import { collapse, dedupe, truncate } from './text.mjs';

const EXCEPTION_RE = /\b(?:[A-Za-z0-9_]+\.)*([A-Z][A-Za-z0-9]{3,}Exception)\b/g;
const HEX_RE = /\b0x[0-9A-Fa-f]{6,8}\b/g;
const EXIT_RE = /\bexit ?code:?\s*(-?\d+)/gi;
const NAMED_ERROR_RE = /\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)*(?:Failed|NotFound|Invalid|Denied|Timeout|Conflict|Unavailable|Mismatch|Expired))\b/g;
const ERRORISH = /(error|exception|fail|exit ?code|0x[0-9a-f]{4,}|cannot|can't|unable|not found|invalid|timed? ?out|denied|unauthori[sz]ed|forbidden|refused|unexpected|missing|not equal|mismatch)/i;
const COMMANDISH = /^\s*(PS [A-Z]:\\.*?>|[A-Z][a-z]+-[A-Z][A-Za-z]+\b|\$\w+\s*=|az\s+\w|\.\\|sudo\s|kubectl\s|cd\s)/;

export const MAX_ERROR_STRINGS = 8;
export const MAX_ERROR_LEN = 600;

export function cleanErrorString(s) {
  const text = collapse(String(s ?? '').replace(/\u00a0/g, ' '));
  if (text.length < 6 || (text.endsWith(':') && text.length < 40)) return null;
  return truncate(text, MAX_ERROR_LEN);
}

export function looksLikeCommand(text) {
  return COMMANDISH.test(String(text ?? '').split('\n')[0] ?? '');
}

export function isErrorish(text) {
  return ERRORISH.test(String(text ?? ''));
}

/** Inline `code spans` from Markdown that read like error messages rather than commands. */
export function inlineErrorSpans(md) {
  const out = [];
  for (const m of String(md ?? '').matchAll(/(?<!`)`([^`\n]{8,400})`(?!`)/g)) {
    const span = m[1].trim();
    if (looksLikeCommand(span)) continue;
    if (isErrorish(span) || (/\s/.test(span) && /[:=]/.test(span))) out.push(span);
  }
  return out;
}

/** Stable error identifiers: exception class names, hex codes, exit codes, named Azure errors. */
export function extractErrorCodes(...texts) {
  const out = [];
  for (const t of texts.flat()) {
    const s = String(t ?? '');
    for (const m of s.matchAll(EXCEPTION_RE)) out.push(m[1]);
    for (const m of s.matchAll(HEX_RE)) out.push(m[0].toUpperCase().replace(/^0X/, '0x'));
    for (const m of s.matchAll(EXIT_RE)) out.push(`exitcode ${m[1]}`);
    for (const m of s.matchAll(NAMED_ERROR_RE)) out.push(m[1]);
  }
  return dedupe(out).slice(0, 12);
}

export function finalizeErrorStrings(list) {
  return dedupe(list.map(cleanErrorString).filter(Boolean)).slice(0, MAX_ERROR_STRINGS);
}
