/**
 * Guardrails that stop a flaky or changed upstream from producing an (almost) empty site.
 *
 * Each source group is judged independently:
 *   tsg    -> Azure/AzureLocal-Supportability guides
 *   learn  -> Learn known issues + release information
 * A group that failed, or came back far smaller than the last published index, is "degraded" and is
 * replaced by the baseline's copy of that group. With no baseline to fall back on, the build throws,
 * so CI fails and the previously deployed site stays online.
 */

export const DEFAULT_THRESHOLDS = {
  // Absolute floors, used when there is no baseline to compare against.
  min: { tsg: 50, 'known-issue': 100, releases: 15 },
  // Fraction of the baseline a fresh result must reach.
  ratio: { tsg: 0.7, 'known-issue': 0.7, releases: 0.8 },
};

export function thresholdsFromEnv(env = process.env) {
  const num = (k, d) => (env[k] !== undefined && env[k] !== '' && !Number.isNaN(Number(env[k])) ? Number(env[k]) : d);
  const d = DEFAULT_THRESHOLDS;
  return {
    min: {
      tsg: num('AZL_MIN_TSG', d.min.tsg),
      'known-issue': num('AZL_MIN_KNOWN_ISSUES', d.min['known-issue']),
      releases: num('AZL_MIN_RELEASES', d.min.releases),
    },
    ratio: {
      tsg: num('AZL_MIN_RATIO', d.ratio.tsg),
      'known-issue': num('AZL_MIN_RATIO', d.ratio['known-issue']),
      releases: num('AZL_MIN_RATIO', d.ratio.releases),
    },
  };
}

export function countsOf(index) {
  const live = (x) => x?.lifecycle?.state !== 'removed';
  const counts = { tsg: 0, 'known-issue': 0, release: 0, releases: (index?.releases ?? []).filter(live).length };
  for (const i of index?.items ?? []) if (i.type in counts && live(i)) counts[i.type]++;
  return counts;
}

/**
 * @param {{tsg:number,'known-issue':number,releases:number}} fresh counts from this run
 * @param {object|null} baseline last published index (or null)
 * @returns {{ ok: boolean, problems: string[] }}
 */
function judge(metric, freshCount, baselineCount, th) {
  if (baselineCount != null && baselineCount > 0) {
    const need = Math.ceil(baselineCount * th.ratio[metric]);
    if (freshCount < need) return `${metric}: ${freshCount} found, expected at least ${need} (last published: ${baselineCount})`;
    return null;
  }
  if (freshCount < th.min[metric]) return `${metric}: ${freshCount} found, expected at least ${th.min[metric]}`;
  return null;
}

/**
 * Decide, per source group, whether the fresh result can be trusted.
 * @param {{tsg:number,'known-issue':number,releases:number}} fresh
 * @param {{ tsgError?: Error|null, learnError?: Error|null }} errors fetch/parse failures
 */
export function assessSources(fresh, baselineIndex, errors = {}, thresholds = DEFAULT_THRESHOLDS) {
  const base = baselineIndex ? countsOf(baselineIndex) : null;
  const tsgProblems = [];
  const learnProblems = [];
  if (errors.tsgError) tsgProblems.push(`fetch failed: ${errors.tsgError.message}`);
  else {
    const p = judge('tsg', fresh.tsg, base?.tsg, thresholds);
    if (p) tsgProblems.push(p);
  }
  if (errors.learnError) learnProblems.push(`fetch failed: ${errors.learnError.message}`);
  else {
    for (const metric of ['known-issue', 'releases']) {
      const p = judge(metric, fresh[metric], base?.[metric], thresholds);
      if (p) learnProblems.push(p);
    }
  }
  return {
    tsg: { degraded: tsgProblems.length > 0, problems: tsgProblems },
    learn: { degraded: learnProblems.length > 0, problems: learnProblems },
    hasBaseline: Boolean(baselineIndex),
  };
}

/** Carry a `since` date forward so the UI can say how long data has been stale. */
export function degradedEntries(assessment, baselineIndex, now = new Date().toISOString()) {
  const prior = new Map((baselineIndex?.degraded ?? []).map((d) => [d.source, d]));
  const out = [];
  for (const source of ['tsg', 'learn']) {
    if (!assessment[source].degraded) continue;
    out.push({
      source,
      since: prior.get(source)?.since ?? baselineIndex?.generatedAt ?? now,
      checkedAt: now,
      reason: assessment[source].problems.join('; ').slice(0, 400),
    });
  }
  return out;
}

export const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86_400_000);

/** Re-establish cross links between known issues and TSGs after mixing fresh and baseline records. */
export function symmetrizeLinks(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const inverse = { 'documented-in': 'known-issue', 'known-issue': 'documented-in' };
  for (const item of items) {
    item.related = (item.related ?? []).filter((r) => byId.has(r.id));
    for (const rel of item.related) {
      const inv = inverse[rel.relation];
      if (!inv) continue;
      const target = byId.get(rel.id);
      if (!target.related.some((r) => r.id === item.id)) {
        target.related.push({ id: item.id, relation: inv, reason: rel.reason ?? null });
      }
    }
  }
}
