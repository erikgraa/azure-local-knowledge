import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildIndex } from '../scripts/lib/build.mjs';
import { assessSources, countsOf, daysBetween, degradedEntries, symmetrizeLinks } from '../scripts/lib/guard.mjs';
import { validateIndex } from '../scripts/lib/schema.mjs';
import { fixtureSource } from '../scripts/lib/sources.mjs';

const TH = { min: { tsg: 1, 'known-issue': 1, releases: 1 }, ratio: { tsg: 0.7, 'known-issue': 0.7, releases: 0.8 } };
const root = fileURLToPath(new URL('..', import.meta.url));

let baseline;
before(async () => {
  ({ index: baseline } = await buildIndex({ source: fixtureSource() }));
  baseline.generatedAt = '2026-10-01T00:00:00.000Z';
});

const unreachable = () => Promise.reject(new Error('getaddrinfo ENOTFOUND github.com'));
const sourceWith = (over) => ({ ...fixtureSource(), ...over });
const run = (source, extra = {}) => buildIndex({ source, baseline, thresholds: TH, ...extra });

test('healthy sources: nothing degraded', async () => {
  const { index, degraded } = await run(fixtureSource());
  assert.deepEqual(degraded, []);
  assert.deepEqual(index.degraded, []);
  assert.deepEqual(countsOf(index), countsOf(baseline));
});

test('TSG repo unreachable: guides come from the baseline, Learn data stays fresh', async () => {
  const { index, degraded } = await run(sourceWith({ tsgTree: unreachable }));
  assert.equal(validateIndex(index), true);
  assert.equal(index.stats.tsg, baseline.stats.tsg);
  assert.ok(index.stats['known-issue'] > 0);
  assert.deepEqual(degraded.map((d) => d.source), ['tsg']);
  assert.match(degraded[0].reason, /ENOTFOUND/);
  assert.equal(degraded[0].since, '2026-10-01T00:00:00.000Z', 'staleness is dated from the baseline');
  // known issues still link to the carried-over guides
  const ki = index.items.find((i) => i.id === 'ki-bug-33008717');
  assert.ok(ki.related.some((r) => r.id.startsWith('tsg-arcregistration')));
});

test('Learn unreachable: known issues and releases come from the baseline, TSGs still resolve versions', async () => {
  const { index, degraded } = await run(sourceWith({ learnFiles: unreachable, learnFile: unreachable }));
  assert.deepEqual(degraded.map((d) => d.source), ['learn']);
  assert.equal(index.releases.length, baseline.releases.length);
  assert.equal(index.stats['known-issue'], baseline.stats['known-issue']);
  const spn = index.items.find((i) => i.id === 'tsg-deployment-tsg-azure-local-hci-missing-spn');
  assert.deepEqual(spn.releases, ['2411.3'], 'versions resolved against the baseline release list');
});

test('both unreachable: the whole index is served from the baseline, flagged twice', async () => {
  const { index, degraded } = await run(sourceWith({ tsgTree: unreachable, learnFiles: unreachable, learnFile: unreachable }));
  assert.deepEqual(degraded.map((d) => d.source).sort(), ['learn', 'tsg']);
  assert.deepEqual(countsOf(index), countsOf(baseline));
  assert.equal(validateIndex(index), true);
});

test('no baseline: refuses to build rather than publish a hollow index', async () => {
  await assert.rejects(() => buildIndex({ source: sourceWith({ tsgTree: unreachable }), baseline: null, thresholds: TH }), /no previous index/);
  await assert.rejects(() => buildIndex({ source: sourceWith({ learnFiles: unreachable, learnFile: unreachable }), baseline: null, thresholds: TH }), /no previous index/);
});

test('a source that "succeeds" but shrinks suspiciously is treated as broken', async () => {
  const real = fixtureSource();
  const tree = await real.tsgTree();
  const one = { ...tree, files: tree.files.filter((f) => /missing-spn/.test(f.path)) };
  const { index, degraded } = await run(sourceWith({ tsgTree: async () => one }));
  assert.deepEqual(degraded.map((d) => d.source), ['tsg']);
  assert.match(degraded[0].reason, /expected at least/);
  assert.equal(index.stats.tsg, baseline.stats.tsg);
});

test('an empty TSG listing is never published', async () => {
  const { degraded } = await run(sourceWith({ tsgTree: async () => ({ ref: 'x', truncated: false, files: [] }) }));
  assert.deepEqual(degraded.map((d) => d.source), ['tsg']);
});

test('assessSources: ratio against baseline, absolute floor without one', () => {
  const th = { min: { tsg: 50, 'known-issue': 100, releases: 15 }, ratio: { tsg: 0.7, 'known-issue': 0.7, releases: 0.8 } };
  const base = { items: [...Array(200)].map((_, i) => ({ type: 'tsg', id: `t${i}` })), releases: [...Array(40)].map((_, i) => ({ id: `r${i}` })) };
  assert.equal(assessSources({ tsg: 150, 'known-issue': 1, releases: 40 }, base, {}, th).tsg.degraded, false);
  assert.equal(assessSources({ tsg: 100, 'known-issue': 1, releases: 40 }, base, {}, th).tsg.degraded, true);
  assert.equal(assessSources({ tsg: 60, 'known-issue': 150, releases: 20 }, null, {}, th).tsg.degraded, false);
  assert.equal(assessSources({ tsg: 10, 'known-issue': 150, releases: 20 }, null, {}, th).tsg.degraded, true);
  assert.equal(assessSources({ tsg: 60, 'known-issue': 150, releases: 20 }, null, { learnError: new Error('x') }, th).learn.degraded, true);
});

test('degradedEntries keeps the original "since" across consecutive bad runs', () => {
  const a = { tsg: { degraded: true, problems: ['x'] }, learn: { degraded: false, problems: [] } };
  const first = degradedEntries(a, { generatedAt: '2026-10-01T00:00:00Z' }, '2026-10-02T00:00:00Z');
  assert.equal(first[0].since, '2026-10-01T00:00:00Z');
  const second = degradedEntries(a, { generatedAt: '2026-10-02T00:00:00Z', degraded: first }, '2026-10-03T00:00:00Z');
  assert.equal(second[0].since, '2026-10-01T00:00:00Z');
  assert.equal(daysBetween(second[0].since, second[0].checkedAt), 2);
});

test('symmetrizeLinks drops dangling links and restores back-links', () => {
  const items = [
    { id: 'a', related: [{ id: 'b', relation: 'documented-in', reason: null }, { id: 'gone', relation: 'related', reason: null }] },
    { id: 'b', related: [] },
  ];
  symmetrizeLinks(items);
  assert.deepEqual(items[0].related.map((r) => r.id), ['b']);
  assert.deepEqual(items[1].related, [{ id: 'a', relation: 'known-issue', reason: null }]);
});

function scratchIndex(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'azl-check-'));
  const idx = structuredClone(baseline);
  mutate?.(idx);
  const file = join(dir, 'index.json');
  writeFileSync(file, JSON.stringify(idx));
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const check = (file, env = {}) =>
  spawnSync(process.execPath, ['scripts/check-index.mjs', file], { cwd: root, encoding: 'utf8', env: { ...process.env, AZL_MIN_TSG: '1', AZL_MIN_KNOWN_ISSUES: '1', AZL_MIN_RELEASES: '1', ...env } });

test('check-index CLI passes a healthy index and fails empty / tiny / invalid ones', () => {
  const ok = scratchIndex();
  const empty = scratchIndex((i) => {
    i.items = [];
  });
  const tiny = scratchIndex();
  try {
    assert.equal(check(ok.file).status, 0);
    assert.equal(check(empty.file).status, 1);
    const r = check(tiny.file, { AZL_MIN_TSG: '500' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /only 5 TSGs/);
    assert.equal(check(join(tmpdir(), 'does-not-exist.json')).status, 1);
  } finally {
    ok.cleanup();
    empty.cleanup();
    tiny.cleanup();
  }
});
