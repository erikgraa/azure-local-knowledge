export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Escape text for HTML and wrap query terms in <mark>. */
export function highlight(text: string, terms: string[]): string {
  const safe = esc(text);
  const usable = terms.filter((t) => t && !['amp', 'quot'].includes(t));
  if (!usable.length) return safe;
  const re = new RegExp(`(${usable.map((t) => reEscape(esc(t))).join('|')})`, 'gi');
  return safe.replace(re, '<mark>$1</mark>');
}

/** A ~max-char window of `text` centred on the first query term hit (or the start). */
export function snippet(text: string | null | undefined, terms: string[], max = 240): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const lower = t.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < max * 0.6) return t.slice(0, max).trimEnd() + '…';
  const start = Math.max(0, at - Math.floor(max * 0.35));
  return '…' + t.slice(start, start + max).trim() + (start + max < t.length ? '…' : '');
}

/** Of several error strings, the one sharing most query terms (falls back to the first). */
export function bestError(errors: string[], terms: string[]): string | null {
  if (!errors.length) return null;
  if (!terms.length) return errors[0];
  let best = errors[0];
  let bestScore = -1;
  for (const e of errors) {
    const l = e.toLowerCase();
    const score = terms.reduce((n, t) => n + (l.includes(t) ? 1 : 0), 0);
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const TYPE_LABEL: Record<string, string> = {
  tsg: 'Troubleshooting guide',
  'known-issue': 'Known issue',
  release: 'Release',
};

export const TYPE_SHORT: Record<string, string> = { tsg: 'TSG', 'known-issue': 'Known issue', release: 'Release' };

export const STATUS_LABEL: Record<string, string> = { open: 'Open', fixed: 'Fixed', expected: 'Expected behavior' };

export const ICONS = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4Z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v5M12 18h.01"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};
