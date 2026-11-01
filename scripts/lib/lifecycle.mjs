/**
 * Archive semantics: nothing is ever dropped from the index.
 *
 * An item that was in the previous (baseline) index but is missing from a fresh build of its source
 * is kept and marked `lifecycle.state = "removed"`. If it later reappears it simply becomes active
 * again. Items that are still present are stamped `active` with their first / last seen dates.
 */

const TSG_BLOB = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/;

/** Link that still works after a file was deleted: its commit history on GitHub. */
function historyLink(url) {
  const m = TSG_BLOB.exec(String(url ?? ''));
  return m ? { label: 'File history on GitHub', url: `${m[1]}/commits/${m[2]}/${m[3]}` } : null;
}

/**
 * @param {object[]} fresh        records built this run for one source group
 * @param {object[]} baselineItems all items of the previous index
 * @param {string[]} types        item types that belong to this source group
 * @returns {{ items: object[], removed: number, newlyRemoved: number, restored: number }}
 */
export function stampAndKeep({ fresh, baselineItems = [], types, now, baselineAt = null }) {
  const prev = new Map(baselineItems.filter((i) => types.includes(i.type)).map((i) => [i.id, i]));
  const seen = new Set();
  let restored = 0;

  for (const rec of fresh) {
    seen.add(rec.id);
    const p = prev.get(rec.id);
    if (p?.lifecycle?.state === 'removed') restored++;
    rec.lifecycle = {
      state: 'active',
      firstSeen: p?.lifecycle?.firstSeen ?? (p ? (baselineAt ?? now) : now),
      lastSeen: now,
    };
  }

  const kept = [];
  let newlyRemoved = 0;
  for (const [id, p] of prev) {
    if (seen.has(id)) continue;
    const clone = structuredClone(p);
    const lc = p.lifecycle ?? {};
    const wasRemoved = lc.state === 'removed';
    if (!wasRemoved) newlyRemoved++;
    clone.lifecycle = {
      state: 'removed',
      firstSeen: lc.firstSeen ?? baselineAt ?? now,
      lastSeen: lc.lastSeen ?? baselineAt ?? now,
      removedAt: wasRemoved ? (lc.removedAt ?? now) : now,
    };
    if (clone.type === 'tsg') {
      const link = historyLink(clone.url);
      if (link && !(clone.urls ?? []).some((u) => u.url === link.url)) clone.urls = [...(clone.urls ?? []), link];
    }
    kept.push(clone);
  }
  return { items: [...fresh, ...kept], removed: kept.length, newlyRemoved, restored };
}

/** Release trains: union of fresh and baseline; trains that disappeared stay, flagged as removed. */
export function mergeReleaseList({ fresh, baselineReleases = [], now, baselineAt = null }) {
  const freshIds = new Set(fresh.map((r) => r.id));
  const out = fresh.map((r) => ({ ...r, lifecycle: { state: 'active', firstSeen: baselineReleases.find((b) => b.id === r.id)?.lifecycle?.firstSeen ?? (baselineReleases.some((b) => b.id === r.id) ? (baselineAt ?? now) : now), lastSeen: now } }));
  for (const b of baselineReleases) {
    if (freshIds.has(b.id)) continue;
    const lc = b.lifecycle ?? {};
    out.push({
      ...structuredClone(b),
      isLatest: false,
      lifecycle: {
        state: 'removed',
        firstSeen: lc.firstSeen ?? baselineAt ?? now,
        lastSeen: lc.lastSeen ?? baselineAt ?? now,
        removedAt: lc.state === 'removed' ? (lc.removedAt ?? now) : now,
      },
    });
  }
  return out;
}

export const isRemoved = (x) => x?.lifecycle?.state === 'removed';
