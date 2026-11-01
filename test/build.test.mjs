import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { buildIndex } from '../scripts/lib/build.mjs';
import { fixtureSource } from '../scripts/lib/sources.mjs';
import { validateIndex } from '../scripts/lib/schema.mjs';

let index;
before(async () => {
  ({ index } = await buildIndex({ source: fixtureSource() }));
});

const byId = (id) => index.items.find((i) => i.id === id);

test('fixture index validates against the JSON schema and has unique ids', () => {
  assert.equal(validateIndex(index), true);
  assert.equal(new Set(index.items.map((i) => i.id)).size, index.items.length);
  assert.equal(index.stats.tsg, 5);
  assert.ok(index.stats['known-issue'] > 20);
});

test('README indexes and templates are not indexed as TSGs', () => {
  assert.ok(index.items.every((i) => !/README|Template/i.test(i.url)));
});

test('releases are ordered newest first with OS mapping and support flags', () => {
  assert.equal(index.releases[0].id, '2610');
  assert.equal(index.releases[0].isLatest, true);
  assert.equal(index.releases[0].supported, true);
  assert.deepEqual(index.releases[0].osVersions, ['24H2']);
  const old = index.releases.find((r) => r.id === '2411.3');
  assert.equal(old.supported, false);
  assert.deepEqual(old.osVersions, ['23H2']);
  assert.equal(byId('release-2610').type, 'release');
});

test('TSG and the Learn known issue that cites it are cross-linked both ways', () => {
  const tsg = byId('tsg-arcregistration-tsg-arc-registration-failing-with-error-42');
  const ki = byId('ki-bug-33008717');
  assert.ok(tsg && ki);
  assert.ok(tsg.related.some((r) => r.id === ki.id && r.relation === 'known-issue'));
  assert.ok(ki.related.some((r) => r.id === tsg.id && r.relation === 'documented-in'));
  assert.ok(ki.releases.includes('2610'));
  assert.match(ki.url, /learn\.microsoft\.com\/azure\/azure-local\/known-issues\?view=azloc-/);
});

test('TSG versions are resolved against the known release trains', () => {
  const spn = byId('tsg-deployment-tsg-azure-local-hci-missing-spn');
  assert.deepEqual(spn.releases, ['2411.3']);
  assert.deepEqual(spn.osVersions, ['23H2']);
  const timeout = index.items.find((i) => /OperationTimeout 2411/.test(i.title));
  assert.deepEqual(timeout.releases, ['2411']);
});

test('unknown fields stay null / empty rather than invented', () => {
  const ki = byId('tsg-arcregistration-tsg-arc-registration-failing-with-error-42');
  assert.deepEqual(ki.releases, []);
  assert.equal(ki.symptomSummary, null);
  assert.equal(ki.enrichment, null);
  assert.equal(ki.lastUpdated, null);
});
