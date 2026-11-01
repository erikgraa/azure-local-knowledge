import type { Affects, Item, Release } from './types';

/** 2411.3 -> 241103 */
export function trainKey(train: string): number {
  const m = /^(\d{4})(?:\.(\d+))?$/.exec(train);
  return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : -1;
}

export const compareTrainsDesc = (a: string, b: string) => trainKey(b) - trainKey(a);

/**
 * Does this item apply to a user running `release`?
 *  yes          - explicitly listed for that release
 *  maybe        - a guide with no stated version (compatible OS) that could still apply
 *  fixed-later  - a known issue fixed in a newer release than the user's: upgrading resolves it
 *  no           - not applicable
 */
export function affects(item: Item, release: Release): Affects {
  if (item.releases.includes(release.id)) return 'yes';
  if (item.type === 'release') return 'no';
  const key = trainKey(release.id);

  if (item.type === 'known-issue') {
    if (item.fixedIn && key < trainKey(item.fixedIn)) {
      const first = item.releases.length ? Math.min(...item.releases.map(trainKey)) : -Infinity;
      return key > first ? 'fixed-later' : 'no';
    }
    return 'no';
  }

  if (item.releases.length) return 'no';
  if (item.osVersions.length && !item.osVersions.some((os) => release.osVersions.includes(os))) return 'no';
  return 'maybe';
}

export function releaseLabel(r: Release): string {
  const bits = [r.id];
  if (r.isLatest) bits.push('latest');
  else if (!r.supported) bits.push('unsupported');
  return bits.join(' · ');
}

/** Collapse ['2504','2505','2506','2508'] -> '2504–2506, 2508' using the known release order. */
export function summarizeReleases(releases: string[], allAsc: string[]): string {
  if (!releases.length) return '';
  const set = new Set(releases);
  const runs: string[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  const flush = () => {
    if (start === null || prev === null) return;
    runs.push(start === prev ? start : `${start}–${prev}`);
  };
  for (const t of allAsc) {
    if (set.has(t)) {
      if (start === null) start = t;
      prev = t;
    } else {
      flush();
      start = prev = null;
    }
  }
  flush();
  return runs.join(', ');
}
