import { assessSources, degradedEntries, symmetrizeLinks } from './guard.mjs';
import { isRemoved, mergeReleaseList, stampAndKeep } from './lifecycle.mjs';
import { consolidateKnownIssues, parseFrontMatter, parseKnownIssueEntries, parseReleaseInfo } from './learn.mjs';
import { SCHEMA_VERSION, buildReleases, knownIssueToRecord, linkKnownIssuesToTsgs, releaseToRecord, tsgToRecord } from './records.mjs';
import { formatErrors, validateIndex } from './schema.mjs';
import { pool } from './fetch.mjs';
import { isExcludedTsgPath, parseReadmeIndex, parseTsg, TSG_REPO } from './tsg.mjs';
import { compareTrains, trainKey } from './versions.mjs';

/** Learn: release information + known issues. Throws when the markdown can't be read or parsed at all. */
async function loadLearn(source, { log, warn }) {
  const learnFiles = await source.learnFiles();
  log(`Learn known-issue files: ${learnFiles.join(', ')}`);
  const releaseRows = parseReleaseInfo(await source.learnFile('release-information-23h2.md'));
  if (!releaseRows.length) warn('no release rows parsed from release-information-23h2.md');

  const kiEntries = [];
  const fileDates = {};
  for (const file of learnFiles) {
    try {
      const md = await source.learnFile(file);
      fileDates[file] = parseFrontMatter(md).msDate;
      const entries = parseKnownIssueEntries(md, { file });
      log(`  ${file}: ${entries.length} rows`);
      kiEntries.push(...entries);
    } catch (err) {
      warn(`could not process ${file}: ${err.message}`);
    }
  }
  if (!kiEntries.length) throw new Error('No known-issue rows parsed; the Learn markdown layout may have changed.');

  const releases = buildReleases(releaseRows, [...new Set(kiEntries.map((e) => e.train))]);
  log(`${releases.length} release trains (latest ${releases[0]?.id})`);
  return { releases, kiEntries, fileDates };
}

/** Supportability TSGs. Throws when the repo can't be listed or most downloads fail. */
async function loadTsgs(source, { log, warn }) {
  const tree = await source.tsgTree();
  if (tree.truncated) warn('git tree response was truncated');
  const readmes = tree.files.filter((f) => /(^|\/)README\.md$/i.test(f.path));
  const tsgFiles = tree.files.filter((f) => !isExcludedTsgPath(f.path));
  log(`${tsgFiles.length} TSG files (${tree.files.length - tsgFiles.length} excluded), ${readmes.length} README indexes`);
  if (!tsgFiles.length) throw new Error('The TSG listing contained no guides.');

  const readmeTitles = {};
  for (const r of await pool(readmes, 8, async (f) => parseReadmeIndex(f.path, await source.tsgFile(f.path)))) {
    if (r.ok) Object.assign(readmeTitles, r.value);
  }

  const tsgContent = await pool(tsgFiles, 8, async (f) => ({ file: f, content: await source.tsgFile(f.path) }));
  const failed = tsgContent.filter((r) => !r.ok);
  failed.forEach((r) => warn(`failed to fetch a TSG: ${r.error.message}`));
  if (failed.length > tsgFiles.length / 2) throw new Error(`Too many TSG downloads failed (${failed.length}/${tsgFiles.length}).`);

  const lastModified = await source.lastModified(tsgFiles);
  return { tree, tsgContent, readmeTitles, lastModified };
}

const attempt = async (fn) => {
  try {
    return { value: await fn(), error: null };
  } catch (error) {
    return { value: null, error };
  }
};

/**
 * Pipeline: source -> normalized index. No file or network access beyond what `source` does.
 *
 * `baseline` is the last known-good index (normally the one currently published). With `thresholds`
 * set, a source group that fails or shrinks suspiciously is replaced by the baseline's copy and the
 * result is marked in `index.degraded`; without a baseline the build throws instead of publishing a
 * hollow index.
 *
 * @returns {{ index: object, sourceText: Record<string,string>, degraded: object[] }}
 */
export async function buildIndex({ source, baseline = null, thresholds = null, now = new Date().toISOString(), log = () => {}, warn = () => {} }) {
  const io = { log, warn };
  const learnRes = await attempt(() => loadLearn(source, io));
  if (learnRes.error) warn(`Learn sources unavailable: ${learnRes.error.message}`);

  // Release trains are needed to resolve TSG versions, so decide on Learn first.
  const freshReleases = learnRes.value?.releases ?? [];
  const learnPreCheck = thresholds
    ? assessSources({ tsg: Infinity, 'known-issue': Infinity, releases: freshReleases.length }, baseline, { learnError: learnRes.error }, thresholds).learn
    : { degraded: Boolean(learnRes.error), problems: learnRes.error ? [learnRes.error.message] : [] };
  const releasesForTsg = learnPreCheck.degraded && baseline ? baseline.releases : freshReleases;
  // Trains that were removed upstream still count as known, so archived guides keep resolving to them.
  const knownTrainsAsc = [...new Set([...releasesForTsg, ...(baseline?.releases ?? [])].map((r) => r.id))].sort(compareTrains);

  const tsgRes = await attempt(() => loadTsgs(source, io));
  if (tsgRes.error) warn(`TSG sources unavailable: ${tsgRes.error.message}`);

  // ---- Fresh records --------------------------------------------------------------
  const sourceText = {};
  const tsgRecords = [];
  if (tsgRes.value) {
    const { tsgContent, readmeTitles, lastModified } = tsgRes.value;
    for (const r of tsgContent) {
      if (!r.ok) continue;
      const { file, content } = r.value;
      try {
        const parsed = parseTsg({ path: file.path, content, readmeTitle: readmeTitles[file.path] ?? null });
        if (/^\{.*\}$/.test(parsed.title) || /^contributing to /i.test(parsed.title)) continue;
        const record = tsgToRecord(parsed, { sourceText: content, lastUpdated: lastModified.get(file.path) ?? null, knownTrainsAsc });
        sourceText[record.id] = content.slice(0, 24000);
        tsgRecords.push(record);
      } catch (err) {
        warn(`parse failure for ${file.path}: ${err.message}`);
      }
    }
  }

  const kiRecords = [];
  const kiByRecordId = new Map();
  const releaseRecords = [];
  if (learnRes.value) {
    for (const ki of consolidateKnownIssues(learnRes.value.kiEntries, learnRes.value.fileDates)) {
      const record = knownIssueToRecord(ki);
      sourceText[record.id] = ki.sourceText;
      kiRecords.push(record);
      kiByRecordId.set(record.id, ki);
    }
    for (const release of learnRes.value.releases) releaseRecords.push(releaseToRecord(release));
  }

  // ---- Guardrails -------------------------------------------------------------------
  const assessment = thresholds
    ? assessSources({ tsg: tsgRecords.length, 'known-issue': kiRecords.length, releases: freshReleases.length }, baseline, { tsgError: tsgRes.error, learnError: learnRes.error }, thresholds)
    : {
        tsg: { degraded: Boolean(tsgRes.error), problems: tsgRes.error ? [tsgRes.error.message] : [] },
        learn: { degraded: Boolean(learnRes.error), problems: learnRes.error ? [learnRes.error.message] : [] },
        hasBaseline: Boolean(baseline),
      };

  for (const group of ['tsg', 'learn']) {
    if (!assessment[group].degraded) continue;
    const why = assessment[group].problems.join('; ');
    if (!baseline) throw new Error(`The ${group} source is unusable (${why}) and there is no previous index to fall back on. Refusing to build.`);
    warn(`Using the last published data for "${group}" (${why}).`);
  }
  if (assessment.tsg.degraded && assessment.learn.degraded) {
    warn('Both sources are degraded: the published data is entirely from the last good index.');
  }

  const fromBaseline = (types) => (baseline?.items ?? []).filter((i) => types.includes(i.type)).map((i) => structuredClone(i));
  const baselineItems = baseline?.items ?? [];
  const baselineAt = baseline?.generatedAt ?? null;

  // Archive semantics: a healthy source group refreshes its records, but anything that was in the previous
  // index and has vanished upstream is kept and marked as removed. A degraded group is carried over untouched.
  let tsgOut;
  let learnOut;
  let releasesOut;
  const lifecycle = { removed: 0, newlyRemoved: 0, restored: 0 };
  const tally = (r) => {
    lifecycle.removed += r.removed;
    lifecycle.newlyRemoved += r.newlyRemoved;
    lifecycle.restored += r.restored;
    return r.items;
  };
  if (assessment.tsg.degraded) tsgOut = fromBaseline(['tsg']);
  else tsgOut = tally(stampAndKeep({ fresh: tsgRecords, baselineItems, types: ['tsg'], now, baselineAt }));
  if (assessment.learn.degraded) {
    learnOut = fromBaseline(['known-issue', 'release']);
    releasesOut = structuredClone(baseline.releases);
  } else {
    learnOut = tally(stampAndKeep({ fresh: [...kiRecords, ...releaseRecords], baselineItems, types: ['known-issue', 'release'], now, baselineAt }));
    releasesOut = mergeReleaseList({ fresh: freshReleases, baselineReleases: baseline?.releases ?? [], now, baselineAt }).sort((a, b) => trainKey(b.id) - trainKey(a.id));
  }
  if (lifecycle.newlyRemoved) warn(`${lifecycle.newlyRemoved} item(s) disappeared from the official sources; kept in the archive and marked as removed.`);
  if (lifecycle.restored) log(`${lifecycle.restored} previously removed item(s) are back in the official sources.`);

  const records = [...tsgOut, ...learnOut];

  // Path-slug collisions: keep ids unique and stable.
  const seen = new Map();
  for (const rec of records) {
    const n = (seen.get(rec.id) ?? 0) + 1;
    seen.set(rec.id, n);
    if (n > 1) {
      const old = rec.id;
      rec.id = `${old}-${n}`;
      sourceText[rec.id] = sourceText[old];
    }
  }

  if (!assessment.tsg.degraded && !assessment.learn.degraded) linkKnownIssuesToTsgs(records, kiByRecordId);
  symmetrizeLinks(records);

  const counts = { tsg: 0, 'known-issue': 0, release: 0, archived: 0 };
  for (const rec of records) {
    counts[rec.type]++;
    if (isRemoved(rec)) counts.archived++;
  }

  const degraded = degradedEntries(assessment, baseline);
  const index = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    sources: [
      { name: 'Azure/AzureLocal-Supportability', url: `https://github.com/${TSG_REPO}`, ref: assessment.tsg.degraded ? null : (tsgRes.value?.tree.ref ?? null), count: counts.tsg },
      { name: 'Learn: Azure Local known issues', url: 'https://learn.microsoft.com/azure/azure-local/known-issues', ref: null, count: counts['known-issue'] },
      { name: 'Learn: Azure Local release information', url: 'https://learn.microsoft.com/azure/azure-local/release-information-23h2', ref: null, count: counts.release },
    ],
    stats: counts,
    degraded,
    enrichment: null,
    releases: releasesOut,
    items: records,
  };

  if (!validateIndex(index)) throw new Error(`Generated index failed schema validation: ${formatErrors(validateIndex)}`);
  return { index, sourceText, degraded };
}
