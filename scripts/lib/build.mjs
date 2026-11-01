import { consolidateKnownIssues, parseFrontMatter, parseKnownIssueEntries, parseReleaseInfo } from './learn.mjs';
import { SCHEMA_VERSION, buildReleases, knownIssueToRecord, linkKnownIssuesToTsgs, releaseToRecord, tsgToRecord } from './records.mjs';
import { formatErrors, validateIndex } from './schema.mjs';
import { pool } from './fetch.mjs';
import { isExcludedTsgPath, parseReadmeIndex, parseTsg, TSG_REPO } from './tsg.mjs';
import { compareTrains } from './versions.mjs';

/**
 * Pure pipeline: source -> normalized index. No file or network access beyond what `source` does.
 * @returns {{ index: object, sourceText: Record<string,string> }}
 */
export async function buildIndex({ source, log = () => {}, warn = () => {} }) {
  // ---- Supportability TSGs ------------------------------------------------
  const tree = await source.tsgTree();
  if (tree.truncated) warn('git tree response was truncated');
  const readmes = tree.files.filter((f) => /(^|\/)README\.md$/i.test(f.path));
  const tsgFiles = tree.files.filter((f) => !isExcludedTsgPath(f.path));
  log(`${tsgFiles.length} TSG files (${tree.files.length - tsgFiles.length} excluded), ${readmes.length} README indexes`);

  const readmeTitles = {};
  for (const r of await pool(readmes, 8, async (f) => parseReadmeIndex(f.path, await source.tsgFile(f.path)))) {
    if (r.ok) Object.assign(readmeTitles, r.value);
  }

  const tsgContent = await pool(tsgFiles, 8, async (f) => ({ file: f, content: await source.tsgFile(f.path) }));
  const failed = tsgContent.filter((r) => !r.ok);
  failed.forEach((r) => warn(`failed to fetch a TSG: ${r.error.message}`));
  if (failed.length > tsgFiles.length / 2) throw new Error('Too many TSG downloads failed; refusing to write a partial index.');

  // ---- Learn release information + known issues ---------------------------
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

  // ---- Releases -----------------------------------------------------------------
  const releases = buildReleases(releaseRows, [...new Set(kiEntries.map((e) => e.train))]);
  const knownTrainsAsc = releases.map((r) => r.id).sort(compareTrains);
  log(`${releases.length} release trains (latest ${releases[0]?.id})`);

  const lastModified = await source.lastModified(tsgFiles);

  // ---- Records ------------------------------------------------------------------
  const sourceText = {};
  const records = [];

  for (const r of tsgContent) {
    if (!r.ok) continue;
    const { file, content } = r.value;
    try {
      const parsed = parseTsg({ path: file.path, content, readmeTitle: readmeTitles[file.path] ?? null });
      if (/^\{.*\}$/.test(parsed.title) || /^contributing to /i.test(parsed.title)) continue;
      const record = tsgToRecord(parsed, { sourceText: content, lastUpdated: lastModified.get(file.path) ?? null, knownTrainsAsc });
      sourceText[record.id] = content.slice(0, 24000);
      records.push(record);
    } catch (err) {
      warn(`parse failure for ${file.path}: ${err.message}`);
    }
  }

  const kiByRecordId = new Map();
  for (const ki of consolidateKnownIssues(kiEntries, fileDates)) {
    const record = knownIssueToRecord(ki);
    sourceText[record.id] = ki.sourceText;
    records.push(record);
    kiByRecordId.set(record.id, ki);
  }
  for (const release of releases) records.push(releaseToRecord(release));

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

  linkKnownIssuesToTsgs(records, kiByRecordId);

  const counts = { tsg: 0, 'known-issue': 0, release: 0 };
  for (const rec of records) counts[rec.type]++;

  const index = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources: [
      { name: 'Azure/AzureLocal-Supportability', url: `https://github.com/${TSG_REPO}`, ref: tree.ref ?? null, count: counts.tsg },
      { name: 'Learn: Azure Local known issues', url: 'https://learn.microsoft.com/azure/azure-local/known-issues', ref: null, count: counts['known-issue'] },
      { name: 'Learn: Azure Local release information', url: 'https://learn.microsoft.com/azure/azure-local/release-information-23h2', ref: null, count: counts.release },
    ],
    stats: counts,
    enrichment: null,
    releases,
    items: records,
  };

  if (!validateIndex(index)) throw new Error(`Generated index failed schema validation: ${formatErrors(validateIndex)}`);
  return { index, sourceText };
}
