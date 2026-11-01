import { LEARN_BASE, resolveLearnLink } from './learn.mjs';
import { tsgIdFromPath, tsgUrl } from './tsg.mjs';
import { dedupe, sha256, slugify } from './text.mjs';
import { compareTrains, expandRange, osVersionFromSolutionVersion, resolveKnownTrain, trainKey } from './versions.mjs';

export const SCHEMA_VERSION = 1;

export function blankRecord(over) {
  return {
    id: null,
    type: null,
    title: null,
    area: null,
    subarea: null,
    status: null,
    releases: [],
    osVersions: [],
    solutionVersions: [],
    versionText: null,
    introducedIn: null,
    fixedIn: null,
    symptoms: null,
    symptomSummary: null,
    errorStrings: [],
    errorCodes: [],
    aliases: [],
    mitigationSummary: null,
    mitigation: null,
    url: null,
    urls: [],
    lastUpdated: null,
    sourceHash: null,
    source: null,
    related: [],
    flags: [],
    enrichment: null,
    excerpt: null,
    release: null,
    lifecycle: null,
    ...over,
  };
}

/** Build the ordered releases list from release-information rows plus trains only seen in known-issues. */
export function buildReleases(releaseRows, extraTrains = []) {
  const byTrain = new Map();
  const ensure = (train) => {
    if (!byTrain.has(train)) {
      byTrain.set(train, { id: train, solutionVersions: [], osBuilds: [], osVersions: [], availabilityDate: null, supported: null });
    }
    return byTrain.get(train);
  };
  for (const row of releaseRows) {
    const r = ensure(row.train);
    r.solutionVersions.push({
      version: row.version,
      osVersion: row.osVersion,
      osBuild: row.osBuild,
      availabilityDate: row.availabilityDate,
      supersededBy: row.supersededBy,
    });
    if (row.osBuild) r.osBuilds.push(row.osBuild);
    if (!r.knownIssuesLink && row.knownIssuesLink && !row.supersededBy) r.knownIssuesLink = row.knownIssuesLink;
    if (row.supported === true) r.supported = true;
    else if (row.supported === false && r.supported == null) r.supported = false;
  }
  for (const t of extraTrains) ensure(t);

  const list = [...byTrain.values()].sort((a, b) => trainKey(b.id) - trainKey(a.id));
  for (const r of list) {
    r.osBuilds = dedupe(r.osBuilds);
    r.osVersions = dedupe(r.solutionVersions.map((v) => osVersionFromSolutionVersion(v.version)).filter(Boolean));
    if (!r.osVersions.length) r.osVersions = trainKey(r.id) <= 250399 ? ['23H2'] : ['24H2'];
    const dates = r.solutionVersions.map((v) => v.availabilityDate).filter(Boolean).sort();
    r.availabilityDate = dates.length ? dates[dates.length - 1] : null;
    r.supported = r.supported ?? false;
    r.label = r.id;
  }
  if (list[0]) list[0].isLatest = true;
  for (const r of list.slice(1)) r.isLatest = false;
  return list;
}

/** Resolve a TSG's version hints (title/file name) onto the known release trains. */
export function resolveTsgReleases(versions, knownTrainsAsc) {
  const known = new Set(knownTrainsAsc);
  let trains = versions.trains.map((t) => resolveKnownTrain(t, known)).filter(Boolean);
  if (versions.range) {
    const from = resolveKnownTrain(versions.range.from, known) ?? versions.range.from;
    const to = resolveKnownTrain(versions.range.to, known) ?? versions.range.to;
    trains = trains.concat(expandRange(from, to, knownTrainsAsc));
  } else if (versions.openEnded && trains.length) {
    const first = [...trains].sort(compareTrains)[0];
    trains = trains.concat(expandRange(first, null, knownTrainsAsc));
  }
  return dedupe(trains).sort(compareTrains);
}

export function tsgToRecord(parsed, { sourceText, lastUpdated = null, knownTrainsAsc }) {
  return blankRecord({
    id: tsgIdFromPath(parsed.path),
    type: 'tsg',
    title: parsed.title,
    area: parsed.area,
    subarea: parsed.subarea,
    status: null,
    releases: resolveTsgReleases(parsed.versions, knownTrainsAsc),
    osVersions: parsed.versions.osVersions.length
      ? parsed.versions.osVersions
      : dedupe(parsed.versions.solutionVersions.map(osVersionFromSolutionVersion).filter(Boolean)),
    solutionVersions: parsed.versions.solutionVersions,
    versionText: parsed.versionText,
    symptoms: parsed.symptoms,
    errorStrings: parsed.errorStrings,
    errorCodes: parsed.errorCodes,
    mitigationSummary: parsed.mitigationSummary,
    mitigation: parsed.mitigation,
    url: tsgUrl(parsed.path),
    urls: [],
    lastUpdated,
    sourceHash: sha256(sourceText),
    source: 'AzureLocal-Supportability',
    excerpt: parsed.excerpt,
    flags: [],
  });
}

export function knownIssueToRecord(ki) {
  const urls = [{ label: 'Known issues for this release (Learn)', url: ki.url }];
  const current = `${LEARN_BASE}/known-issues`;
  if (!ki.url.startsWith(current)) urls.push({ label: 'Current known issues (Learn)', url: current });
  return blankRecord({
    id: `ki-${slugify(ki.key)}`,
    type: 'known-issue',
    title: ki.title,
    area: ki.area,
    subarea: ki.feature && ki.feature !== ki.area ? ki.feature : null,
    status: ki.status,
    releases: ki.releases,
    introducedIn: ki.introducedIn,
    fixedIn: ki.fixedIn,
    symptoms: ki.symptoms,
    errorStrings: ki.errorStrings,
    errorCodes: ki.errorCodes,
    mitigationSummary: ki.mitigationSummary,
    mitigation: ki.mitigation,
    url: ki.url,
    urls,
    lastUpdated: ki.lastUpdated,
    sourceHash: ki.sourceHash,
    source: 'Learn: known issues',
    flags: ki.flags,
    versionText: ki.fixedInVersion ? `Fixed in ${ki.fixedInVersion}` : null,
    solutionVersions: ki.fixedInVersion ? [ki.fixedInVersion] : [],
  });
}

export function releaseToRecord(release) {
  const versions = release.solutionVersions.map((v) => v.version);
  const builds = release.osBuilds;
  const lines = [
    versions.length ? `Solution versions: ${versions.join(', ')}.` : null,
    builds.length ? `OS build: ${builds.join(', ')}.` : null,
    release.availabilityDate ? `Latest availability date: ${release.availabilityDate}.` : null,
    release.supported ? 'In a supported state.' : 'Outside the supported window.',
  ].filter(Boolean);
  const kiLink = release.knownIssuesLink ? resolveLearnLink(release.knownIssuesLink) : `${LEARN_BASE}/known-issues`;
  return blankRecord({
    id: `release-${slugify(release.id)}`,
    type: 'release',
    title: `Azure Local ${release.id} release`,
    area: 'Release information',
    status: null,
    releases: [release.id],
    osVersions: release.osVersions,
    solutionVersions: versions,
    symptoms: lines.join(' '),
    url: `${LEARN_BASE}/release-information-23h2`,
    urls: [
      { label: 'Release information (Learn)', url: `${LEARN_BASE}/release-information-23h2` },
      { label: 'Known issues (Learn)', url: kiLink },
    ],
    lastUpdated: release.availabilityDate,
    sourceHash: sha256(JSON.stringify(release)),
    source: 'Learn: release information',
    release: {
      train: release.id,
      supported: release.supported,
      osBuilds: builds,
      availabilityDate: release.availabilityDate,
      solutionVersions: release.solutionVersions,
    },
  });
}

/** Add symmetric cross-links between TSGs and the known issues that cite them. */
export function linkKnownIssuesToTsgs(records, kiByRecordId) {
  const tsgIds = new Set(records.filter((r) => r.type === 'tsg').map((r) => r.id));
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const [kiId, ki] of kiByRecordId) {
    for (const path of ki.tsgPaths) {
      const tid = tsgIdFromPath(path);
      if (!tsgIds.has(tid)) {
        byId.get(kiId)?.flags.push({ kind: 'broken-link', message: `Links to ${path}, which was not found in the Supportability repo.` });
        continue;
      }
      byId.get(kiId).related.push({ id: tid, relation: 'documented-in', reason: 'Linked from the Learn known issue.' });
      byId.get(tid).related.push({ id: kiId, relation: 'known-issue', reason: 'Cited by a Learn known issue.' });
    }
  }
}
