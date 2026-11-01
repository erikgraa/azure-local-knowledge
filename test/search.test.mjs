// Imports the browser search code directly; needs Node >= 22.18 (native TypeScript type stripping).
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { buildIndex } from '../scripts/lib/build.mjs';
import { fixtureSource } from '../scripts/lib/sources.mjs';
import { Searcher, highlightTerms, normalizeQuery, tokenize } from '../src/search.ts';
import { affects, summarizeReleases, trainKey } from '../src/versions.ts';

let index;
let searcher;
before(async () => {
  ({ index } = await buildIndex({ source: fixtureSource() }));
  searcher = new Searcher(index.items);
});

const ids = (q, n = 5) => searcher.search(q).slice(0, n).map((h) => h.item.id);

test('exception name finds the TSG that documents it, first', () => {
  const hits = searcher.search('SecretNotFoundException');
  assert.equal(hits[0].item.id, 'tsg-deployment-tsg-azure-local-hci-missing-spn');
});

test('"Arc registration error 42" finds both the TSG and the Learn known issue', () => {
  const top = ids('Arc registration error 42', 3);
  assert.equal(top[0], 'tsg-arcregistration-tsg-arc-registration-failing-with-error-42');
  assert.ok(top.includes('ki-bug-33008717'));
});

test('a pasted raw error message matches, even with GUID / IP / timestamp noise', () => {
  const raw =
    "2026-10-30T12:01:02Z Bootstrap reported error: A ArcAgentConnectionException error occurred with the message: 'AZCMAgent command failed with error:  >> exitcode: 42. Additional Info: See https://aka.ms/arc/azcmerror' on 10.0.0.4 correlation 3f2b6c1e-8a4d-4e0a-9d0b-1c2d3e4f5a6b";
  const top = ids(raw, 2);
  assert.ok(top.includes('tsg-arcregistration-tsg-arc-registration-failing-with-error-42'));
  assert.ok(top.includes('ki-bug-33008717'));
});

test('validator names from tsg-metadata are searchable', () => {
  assert.equal(ids('AzStackHci_Subscription_State', 1)[0], 'tsg-environmentvalidator-troubleshooting-azstackhci-subscription-state');
});

test('nonsense returns nothing', () => {
  assert.deepEqual(searcher.search('zzqqxxyy'), []);
  assert.deepEqual(searcher.search('   '), []);
});

test('tokenizer keeps identifiers whole and splits their parts', () => {
  const t = tokenize('CloudEngine.Configurations.SecretNotFoundException');
  assert.ok(t.includes('CloudEngine.Configurations.SecretNotFoundException'));
  assert.ok(t.includes('Secret') && t.includes('Found'));
  assert.equal(normalizeQuery('id 3f2b6c1e-8a4d-4e0a-9d0b-1c2d3e4f5a6b at 10.1.2.3:443'), 'id at');
  assert.ok(highlightTerms('The SecretNotFoundException').includes('secretnotfoundexception'));
});

test('"which issues affect my version" logic', () => {
  const rel = (id, osVersions) => ({ id, osVersions, supported: true });
  const ki = { type: 'known-issue', releases: ['2505', '2506'], fixedIn: '2507', osVersions: [] };
  assert.equal(affects(ki, rel('2505', ['24H2'])), 'yes');
  assert.equal(affects(ki, rel('2507', ['24H2'])), 'no');
  assert.equal(affects(ki, rel('2411', ['23H2'])), 'no');
  const fixedOnly = { type: 'known-issue', releases: [], fixedIn: '2610', osVersions: [] };
  assert.equal(affects(fixedOnly, rel('2606', ['24H2'])), 'fixed-later');
  assert.equal(affects(fixedOnly, rel('2610', ['24H2'])), 'no');
  const tsgNoVersion = { type: 'tsg', releases: [], osVersions: [] };
  assert.equal(affects(tsgNoVersion, rel('2606', ['24H2'])), 'maybe');
  const tsg23 = { type: 'tsg', releases: [], osVersions: ['23H2'] };
  assert.equal(affects(tsg23, rel('2606', ['24H2'])), 'no');
  assert.equal(affects(tsg23, rel('2411', ['23H2'])), 'maybe');
  const tsgPinned = { type: 'tsg', releases: ['2411.3'], osVersions: ['23H2'] };
  assert.equal(affects(tsgPinned, rel('2411.3', ['23H2'])), 'yes');
  assert.equal(affects(tsgPinned, rel('2503', ['23H2'])), 'no');
});

test('release run summaries and train ordering', () => {
  assert.equal(summarizeReleases(['2504', '2505', '2506', '2508'], ['2503', '2504', '2505', '2506', '2507', '2508']), '2504–2506, 2508');
  assert.ok(trainKey('2411.3') > trainKey('2411'));
});
