import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { contentHash, loadArchive, publishArchive } from '../scripts/archive.mjs';
import { buildIndex } from '../scripts/lib/build.mjs';
import { countsOf } from '../scripts/lib/guard.mjs';
import { mergeReleaseList, stampAndKeep } from '../scripts/lib/lifecycle.mjs';
import { validateIndex } from '../scripts/lib/schema.mjs';
import { fixtureSource } from '../scripts/lib/sources.mjs';

const T0 = '2026-10-01T00:00:00.000Z';
const T1 = '2026-10-02T00:00:00.000Z';
const T2 = '2026-10-03T00:00:00.000Z';
const SPN = 'tsg-deployment-tsg-azure-local-hci-missing-spn';

let day0;
before(async () => {
  ({ index: day0 } = await buildIndex({ source: fixtureSource(), now: T0 }));
});

/** A source where the SPN TSG has been deleted upstream. */
const withoutSpn = () => {
  const real = fixtureSource();
  return {
    ...real,
    tsgTree: async () => {
      const t = await real.tsgTree();
      return { ...t, files: t.files.filter((f) => !/missing-spn/i.test(f.path)) };
    },
  };
};

test('first build stamps everything as active with first/last seen', () => {
  assert.ok(day0.items.every((i) => i.lifecycle?.state === 'active' && i.lifecycle.firstSeen === T0 && i.lifecycle.lastSeen === T0));
  assert.ok(day0.releases.every((r) => r.lifecycle?.state === 'active'));
  assert.equal(day0.stats.archived, 0);
});

test('a TSG deleted upstream is kept, marked removed, and gets a file-history link', async () => {
  const { index } = await buildIndex({ source: withoutSpn(), baseline: day0, now: T1 });
  const spn = index.items.find((i) => i.id === SPN);
  assert.ok(spn, 'the item is still in the index');
  assert.equal(spn.lifecycle.state, 'removed');
  assert.equal(spn.lifecycle.removedAt, T1);
  assert.equal(spn.lifecycle.firstSeen, T0);
  assert.equal(spn.lifecycle.lastSeen, T0, 'lastSeen is the last time it was actually there');
  assert.equal(spn.title, 'Missing SPN during deployment');
  assert.ok(spn.symptoms && spn.mitigation, 'content is preserved');
  assert.ok(spn.urls.some((u) => /\/commits\/main\/TSG\/Deployment\/TSG-Azure-LOCAL-HCI-missing-spn\.md$/.test(u.url)));
  assert.equal(index.stats.archived, 1);
  assert.equal(index.items.length, day0.items.length, 'nothing was dropped');
  assert.equal(validateIndex(index), true);
  // everything else stays active
  assert.equal(index.items.filter((i) => i.lifecycle.state === 'removed').length, 1);
});

test('removal date sticks across later runs, and the item comes back when it reappears', async () => {
  const day1 = (await buildIndex({ source: withoutSpn(), baseline: day0, now: T1 })).index;
  const day2 = (await buildIndex({ source: withoutSpn(), baseline: day1, now: T2 })).index;
  assert.equal(day2.items.find((i) => i.id === SPN).lifecycle.removedAt, T1, 'removedAt is not reset');
  assert.equal(day2.stats.archived, 1);

  const day3 = (await buildIndex({ source: fixtureSource(), baseline: day2, now: '2026-10-04T00:00:00.000Z' })).index;
  const back = day3.items.find((i) => i.id === SPN);
  assert.equal(back.lifecycle.state, 'active');
  assert.equal(back.lifecycle.removedAt, undefined);
  assert.equal(back.lifecycle.firstSeen, T0, 'original first-seen survives a removal');
  assert.equal(day3.stats.archived, 0);
});

test('known issues and release trains that vanish from Learn are kept too', async () => {
  const real = fixtureSource();
  const noOld = { ...real, learnFiles: async () => (await real.learnFiles()).filter((f) => !/known-issues-24/.test(f)) };
  const { index } = await buildIndex({ source: noOld, baseline: day0, now: T1 });
  const removedKi = index.items.filter((i) => i.type === 'known-issue' && i.lifecycle.state === 'removed');
  assert.ok(removedKi.length > 0, 'known issues from the removed page are archived');
  assert.equal(index.items.length, day0.items.length);
  assert.equal(index.releases.length, day0.releases.length, 'no release train disappears');
  assert.equal(validateIndex(index), true);
});

test('a degraded source is carried over untouched, not marked as removed', async () => {
  const down = { ...fixtureSource(), tsgTree: () => Promise.reject(new Error('ENOTFOUND')) };
  const { index } = await buildIndex({ source: down, baseline: day0, thresholds: { min: { tsg: 1, 'known-issue': 1, releases: 1 }, ratio: { tsg: 0.7, 'known-issue': 0.7, releases: 0.8 } }, now: T1 });
  assert.equal(index.stats.archived, 0);
  assert.ok(index.items.filter((i) => i.type === 'tsg').every((i) => i.lifecycle.state === 'active' && i.lifecycle.lastSeen === T0));
});

test('removed items do not make the shrink guardrail think the source is healthy or broken', async () => {
  const day1 = (await buildIndex({ source: withoutSpn(), baseline: day0, now: T1 })).index;
  assert.equal(countsOf(day1).tsg, countsOf(day0).tsg - 1, 'guard counts only live items');
  assert.equal(day1.items.filter((i) => i.type === 'tsg').length, countsOf(day0).tsg, 'archive still holds them all');
});

test('pure helpers: stampAndKeep / mergeReleaseList', () => {
  const base = [{ id: 'a', type: 'tsg', url: 'https://github.com/o/r/blob/main/TSG/x.md', urls: [], lifecycle: { state: 'active', firstSeen: T0, lastSeen: T0 } }, { id: 'k', type: 'known-issue' }];
  const r = stampAndKeep({ fresh: [{ id: 'b', type: 'tsg' }], baselineItems: base, types: ['tsg'], now: T1 });
  assert.deepEqual(r.items.map((i) => [i.id, i.lifecycle.state]), [['b', 'active'], ['a', 'removed']]);
  assert.equal(r.newlyRemoved, 1);
  assert.ok(!r.items.some((i) => i.id === 'k'), 'other source groups are untouched');
  const rel = mergeReleaseList({ fresh: [{ id: '2610', isLatest: true }], baselineReleases: [{ id: '2411', isLatest: true }], now: T1 });
  assert.deepEqual(rel.map((x) => [x.id, x.lifecycle.state, x.isLatest]), [['2610', 'active', true], ['2411', 'removed', false]]);
});

// ---- durable git archive ------------------------------------------------------------------------

const sh = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' });

test('archive branch: commits only on real changes, keeps history, and loads back as a baseline', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'azl-archive-'));
  try {
    const remote = join(dir, 'remote.git');
    const work = join(dir, 'work');
    sh(['init', '--bare', '-q', remote]);
    sh(['init', '-q', work]);
    sh(['remote', 'add', 'origin', remote], work);
    const indexFile = join(work, 'index.json');

    writeFileSync(indexFile, JSON.stringify(day0));
    assert.equal(loadArchive({ cwd: work }).found, false, 'no data branch yet');
    const first = publishArchive({ cwd: work, indexFile });
    assert.equal(first.committed, true);

    // same content, different timestamps: no new commit
    const touched = structuredClone(day0);
    touched.generatedAt = T2;
    touched.items.forEach((i) => (i.lifecycle.lastSeen = T2));
    assert.equal(contentHash(touched), contentHash(day0));
    writeFileSync(indexFile, JSON.stringify(touched));
    assert.deepEqual(publishArchive({ cwd: work, indexFile }), { committed: false, reason: 'unchanged' });

    // a removed item changes the content: second commit on top of the first
    const day1 = (await buildIndex({ source: withoutSpn(), baseline: day0, now: T1 })).index;
    writeFileSync(indexFile, JSON.stringify(day1));
    const second = publishArchive({ cwd: work, indexFile });
    assert.equal(second.committed, true);
    assert.equal(second.parent, first.commit);
    assert.equal(sh(['--git-dir', remote, 'rev-list', '--count', 'data'], dir).trim(), '2');

    const out = join(dir, 'baseline.json');
    const loaded = loadArchive({ cwd: work, out });
    assert.equal(loaded.found, true);
    const stored = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(stored.items.find((i) => i.id === SPN).lifecycle.state, 'removed');
    assert.equal(validateIndex(stored), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
