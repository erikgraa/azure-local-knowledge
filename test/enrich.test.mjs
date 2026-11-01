import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PROMPT_VERSION, applyEnrichment, buildNeighbourFinder, buildPrompt, extractJson, pickResults, selectCandidates } from '../scripts/lib/enrich.mjs';
import { buildIndex } from '../scripts/lib/build.mjs';
import { formatErrors, validateEnrichment, validateIndex } from '../scripts/lib/schema.mjs';
import { fixtureSource } from '../scripts/lib/sources.mjs';
import { compareTrains } from '../scripts/lib/versions.mjs';

let base;
let sourceText;
before(async () => {
  ({ index: base, sourceText } = await buildIndex({ source: fixtureSource() }));
});

const clone = () => structuredClone(base);
const ctxFor = (index) => ({
  knownTrainsAsc: index.releases.map((r) => r.id).sort(compareTrains),
  byId: new Map(index.items.map((i) => [i.id, i])),
  provider: 'test',
  model: null,
  at: '2026-01-01T00:00:00.000Z',
});
const ERR42 = 'tsg-arcregistration-tsg-arc-registration-failing-with-error-42';
const SPN = 'tsg-deployment-tsg-azure-local-hci-missing-spn';

test('extractJson tolerates fences and surrounding prose', () => {
  assert.deepEqual(extractJson('```json\n{"results":[]}\n```'), { results: [] });
  assert.deepEqual(extractJson('Sure! Here you go:\n{"results":[]}\nHope that helps'), { results: [] });
  assert.throws(() => extractJson('no json here'));
});

test('enrichment schema accepts a good result and rejects bad ones', () => {
  const good = { results: [{ id: 'a', confidence: 'high', versionRanges: [{ from: '2411', to: null }], related: [{ id: 'b', relation: 'related' }], flags: [{ kind: 'unclear', message: 'vague' }] }] };
  assert.equal(validateEnrichment(good), true, formatErrors(validateEnrichment));
  for (const bad of [
    { results: [{ id: 'a', confidence: 'certain' }] },
    { results: [{ id: 'a', confidence: 'low', versionRanges: [{ from: 'soon', to: null }] }] },
    { results: [{ id: 'a', confidence: 'low', related: [{ id: 'b', relation: 'best-friend' }] }] },
    { results: [{ id: 'a', confidence: 'low', symptomSummary: 'x'.repeat(500) }] },
    { results: [{ id: 'a', confidence: 'low', surprise: true }] },
    { nope: [] },
  ]) {
    assert.equal(validateEnrichment(bad), false, JSON.stringify(bad));
  }
});

test('candidates are keyed by source hash + prompt version, TSGs first, releases never', () => {
  const cache = { entries: {} };
  const all = selectCandidates(base.items, cache);
  assert.ok(all.every((i) => i.type !== 'release'));
  assert.equal(all[0].type, 'tsg');
  assert.equal(all.length, base.items.filter((i) => i.type !== 'release').length);

  const spn = base.items.find((i) => i.id === SPN);
  cache.entries[SPN] = { hash: spn.sourceHash, promptVersion: PROMPT_VERSION, result: {} };
  assert.ok(!selectCandidates(base.items, cache).some((i) => i.id === SPN), 'unchanged content is skipped');

  cache.entries[SPN].hash = 'different';
  assert.ok(selectCandidates(base.items, cache).some((i) => i.id === SPN), 'changed content is re-processed');

  cache.entries[SPN] = { hash: spn.sourceHash, promptVersion: PROMPT_VERSION - 1, result: {} };
  assert.ok(selectCandidates(base.items, cache).some((i) => i.id === SPN), 'new prompt version is re-processed');
  assert.ok(selectCandidates(base.items, { entries: {} }, { force: true }).length === all.length);
});

test('prompt carries the item, candidates and the untrusted-source warning', () => {
  const neighbours = buildNeighbourFinder(base.items);
  const item = base.items.find((i) => i.id === ERR42);
  const prompt = buildPrompt({ batch: [item], sourceTexts: sourceText, releases: base.releases, neighbours: [neighbours(item)] });
  assert.match(prompt, new RegExp(`### ITEM ${ERR42}`));
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /2610\(24H2\)/);
  assert.match(prompt, /exitcode: 42/);
});

test('applying enrichment fills gaps, adds aliases and links, and keeps the index schema-valid', () => {
  const index = clone();
  const ctx = ctxFor(index);
  const err42 = ctx.byId.get(ERR42);
  const ki = index.items.find((i) => i.id === 'ki-bug-33008717');
  const other = index.items.find((i) => i.type === 'tsg' && i.id !== ERR42 && i.id !== SPN);
  const kiReleasesBefore = [...ki.releases];

  const applied = applyEnrichment(
    err42,
    {
      id: ERR42,
      confidence: 'medium',
      versionRanges: [{ from: '2504', to: '2506' }],
      osVersions: ['24H2'],
      errorAliases: ['arc registration error 42', 'azcmagent exit code 42'],
      normalizedErrors: ['AZCMAgent command failed with error: exitcode: 42'],
      symptomSummary: 'Arc registration of a new node fails with exit code 42.',
      mitigationSummary: 'Remove Az.Accounts versions other than 4.0.2 and retry bootstrap.',
      related: [
        { id: other.id, relation: 'related', reason: 'Same error.' },
        { id: ki.id, relation: 'same-issue', reason: 'already linked by the parser' },
        { id: 'does-not-exist', relation: 'same-issue', reason: null },
        { id: ERR42, relation: 'same-issue', reason: 'self' },
      ],
      flags: [{ kind: 'stale', message: 'Mentions 2505 as current.' }],
    },
    ctx,
  );

  assert.deepEqual(err42.releases, ['2504', '2505', '2506']);
  assert.deepEqual(err42.osVersions, ['24H2']);
  assert.ok(err42.aliases.includes('arc registration error 42'));
  assert.equal(err42.symptomSummary, 'Arc registration of a new node fails with exit code 42.');
  assert.ok(err42.related.some((r) => r.id === other.id));
  assert.equal(err42.related.filter((r) => r.id === ki.id).length, 1, 'existing links are not duplicated');
  assert.ok(!err42.related.some((r) => r.id === 'does-not-exist' || (r.id === ERR42 && r.reason === 'self')), 'unknown and self links are dropped');
  assert.ok(other.related.some((r) => r.id === ERR42), 'links are symmetric');
  assert.deepEqual(ki.releases, kiReleasesBefore, 'Learn-sourced release lists are never overridden');
  assert.equal(err42.enrichment.confidence, 'medium');
  assert.ok(applied.includes('releases') && applied.includes('aliases') && applied.includes('related'));
  assert.equal(validateIndex(index), true, formatErrors(validateIndex));
});

test('conflicting versions are flagged, not silently overwritten; low confidence never changes versions', () => {
  const index = clone();
  const ctx = ctxFor(index);
  const spn = ctx.byId.get(SPN);
  assert.deepEqual(spn.releases, ['2411.3']);

  applyEnrichment(spn, { id: SPN, confidence: 'high', versionRanges: [{ from: '2504', to: '2505' }] }, ctx);
  assert.deepEqual(spn.releases, ['2411.3']);
  assert.ok(spn.flags.some((f) => f.kind === 'version-mismatch'));

  const err42 = ctx.byId.get(ERR42);
  applyEnrichment(err42, { id: ERR42, confidence: 'low', versionRanges: [{ from: '2504', to: '2505' }], osVersions: ['24H2'] }, ctx);
  assert.deepEqual(err42.releases, []);
  assert.deepEqual(err42.osVersions, []);
});

test('over-long model strings are clamped instead of failing the whole batch', async () => {
  const { clampResults } = await import('../scripts/lib/enrich.mjs');
  const parsed = clampResults({
    results: [{ id: 'a', confidence: 'high', normalizedErrors: ['x'.repeat(900)], symptomSummary: 'y'.repeat(400), errorAliases: Array.from({ length: 14 }, (_, i) => `alias ${i}`), flags: [{ kind: 'unclear', message: 'z'.repeat(800) }] }],
  });
  assert.equal(validateEnrichment(parsed), true, formatErrors(validateEnrichment));
  assert.ok(parsed.results[0].normalizedErrors[0].length <= 300);
  assert.equal(parsed.results[0].errorAliases.length, 10);
  // enums and structure are still enforced
  assert.equal(validateEnrichment(clampResults({ results: [{ id: 'a', confidence: 'certain' }] })), false);
});

test('pickResults only keeps ids that were asked for', () => {
  const picked = pickResults({ results: [{ id: 'a' }, { id: 'zzz' }, { id: 'a' }] }, ['a', 'b']);
  assert.deepEqual([...picked.keys()], ['a']);
});

// ---- the CLI, end to end, with the offline mock provider ---------------------------------------

const root = fileURLToPath(new URL('..', import.meta.url));

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'azl-enrich-test-'));
  const files = { dir, index: join(dir, 'index.json'), cache: join(dir, 'cache') };
  const writeBase = (mutate) => {
    const idx = structuredClone(base);
    mutate?.(idx);
    writeFileSync(files.index, JSON.stringify(idx));
    mkdirSync(files.cache, { recursive: true });
    writeFileSync(join(files.cache, 'source-text.json'), JSON.stringify(sourceText));
    return idx;
  };
  const run = (extraEnv = {}, args = []) =>
    spawnSync(process.execPath, ['scripts/enrich.mjs', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, AZL_INDEX_FILE: files.index, AZL_CACHE_DIR: files.cache, ENRICH_PROVIDER: 'mock', ENRICH_BATCH_SIZE: '3', ENRICH_MAX_ITEMS: '1000', GITHUB_ACTIONS: '', ...extraEnv },
    });
  const read = () => JSON.parse(readFileSync(files.index, 'utf8'));
  const cache = () => JSON.parse(readFileSync(join(files.cache, 'enrichment-cache.json'), 'utf8'));
  return { ...files, writeBase, run, read, cache, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('CLI: enriches, caches by content hash, and only re-processes changed items', () => {
  const s = scratch();
  try {
    const total = base.items.filter((i) => i.type !== 'release').length;
    s.writeBase();

    const first = s.run();
    assert.equal(first.status, 0, first.stderr);
    let idx = s.read();
    assert.equal(validateIndex(idx), true);
    assert.equal(idx.items.filter((i) => i.enrichment).length, total);
    assert.equal(idx.items.find((i) => i.id === SPN).symptomSummary, `Summary of ${SPN}`);
    assert.equal(idx.enrichment.pendingItems, 0);
    assert.equal(Object.keys(s.cache().entries).length, total);

    // Same sources, fresh deterministic index (what build:index produces every day): nothing to do.
    s.writeBase();
    const second = s.run();
    assert.match(second.stdout, new RegExp(`${total} cached, 0 need enrichment`));
    assert.equal(s.read().items.filter((i) => i.enrichment).length, total, 'cached results are re-applied');

    // One source document changes upstream.
    s.writeBase((i) => {
      i.items.find((x) => x.id === SPN).sourceHash = 'changed-upstream';
    });
    const third = s.run();
    assert.match(third.stdout, /1 need enrichment, processing 1/);
    assert.equal(s.cache().entries[SPN].hash, 'changed-upstream');
  } finally {
    s.cleanup();
  }
});

test('CLI: honours the per-run item cap and picks up the backlog next run', () => {
  const s = scratch();
  try {
    s.writeBase();
    const r1 = s.run({ ENRICH_MAX_ITEMS: '4' });
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(s.read().items.filter((i) => i.enrichment).length, 4);
    assert.ok(s.read().enrichment.pendingItems > 0);
    s.writeBase();
    s.run({ ENRICH_MAX_ITEMS: '4' });
    assert.equal(s.read().items.filter((i) => i.enrichment).length, 8);
  } finally {
    s.cleanup();
  }
});

for (const mode of ['invalid', 'schema']) {
  test(`CLI: falls back to parser data when the model output is ${mode}`, () => {
    const s = scratch();
    try {
      const idx0 = s.writeBase();
      const r = s.run({ ENRICH_MOCK_MODE: mode });
      assert.equal(r.status, 0, 'enrichment problems must not fail the pipeline');
      const idx = s.read();
      assert.equal(validateIndex(idx), true);
      assert.equal(idx.items.filter((i) => i.enrichment).length, 0);
      assert.deepEqual(idx.items.map((i) => [i.id, i.title, i.releases, i.symptoms]), idx0.items.map((i) => [i.id, i.title, i.releases, i.symptoms]));

      const strict = s.run({ ENRICH_MOCK_MODE: mode }, ['--strict']);
      assert.equal(strict.status, 1, '--strict surfaces the failure');
    } finally {
      s.cleanup();
    }
  });
}

test('CLI: without credentials the step is skipped and the index is untouched', () => {
  const s = scratch();
  try {
    s.writeBase();
    const r = s.run({ ENRICH_PROVIDER: 'copilot-cli', GITHUB_ACTIONS: 'true', COPILOT_GITHUB_TOKEN: '' });
    assert.equal(r.status, 0);
    assert.match(r.stdout + r.stderr, /no credentials/);
    assert.equal(s.read().items.filter((i) => i.enrichment).length, 0);
  } finally {
    s.cleanup();
  }
});
