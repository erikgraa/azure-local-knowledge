import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseTables, scanMarkdown, splitRow } from '../scripts/lib/markdown.mjs';
import { isExcludedTsgPath, parseReadmeIndex, parseTitle, parseTsg, parseTsgMetadata, tsgIdFromPath } from '../scripts/lib/tsg.mjs';

const fixture = (p) => readFileSync(new URL(`./fixtures/supportability/${p}`, import.meta.url), 'utf8');

test('splitRow keeps pipes inside code spans and escaped pipes', () => {
  assert.deepEqual(splitRow('| a | `b | c` | d \\| e |'), ['a', '`b | c`', 'd | e']);
});

test('parseTables finds header, rows and tolerates ragged rows', () => {
  const [t] = parseTables(['intro', '| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 |', '', 'tail']);
  assert.deepEqual(t.header, ['A', 'B']);
  assert.deepEqual(t.rows, [['1', '2'], ['3']]);
});

test('scanMarkdown ignores headings inside fences', () => {
  const nodes = scanMarkdown('# Title\n```\n# not a heading\n```\ntext');
  assert.equal(nodes.filter((n) => n.type === 'heading').length, 1);
  assert.equal(nodes.find((n) => n.type === 'fence').text, '# not a heading');
});

test('parseTitle splits the TSG | OS | version | title convention', () => {
  const t = parseTitle('TSG | 23H2 | 10.2411.3.2 | Missing SPN during deployment');
  assert.equal(t.title, 'Missing SPN during deployment');
  assert.equal(t.versionText, 'TSG | 23H2 | 10.2411.3.2');
  assert.equal(parseTitle('Plain title').title, 'Plain title');
  assert.equal(parseTitle('TSG: Something broke').title, 'Something broke');
});

test('path helpers', () => {
  assert.equal(tsgIdFromPath('TSG/Deployment/TSG-Azure-LOCAL-HCI-missing-spn.md'), 'tsg-deployment-tsg-azure-local-hci-missing-spn');
  assert.ok(isExcludedTsgPath('TSG/Update/README.md'));
  assert.ok(isExcludedTsgPath('TSG/Templates/HowTo-Template.md'));
  assert.ok(isExcludedTsgPath('TSG/Deployment/images/Readme.md'));
  assert.ok(!isExcludedTsgPath('TSG/Update/Get-SolutionUpdate-GatewayTimeout.md'));
});

test('README index resolves relative links to labels', () => {
  const map = parseReadmeIndex('TSG/Deployment/README.md', '* [A guide](./a.md)\n* [Elsewhere](../Other/b.md)\n* [Web](https://x.test/c.md)');
  assert.deepEqual(map, { 'TSG/Deployment/a.md': 'A guide', 'TSG/Other/b.md': 'Elsewhere' });
});

test('SPN TSG: title metadata, versions, error text, symptoms and mitigation', () => {
  const p = parseTsg({ path: 'TSG/Deployment/TSG-Azure-LOCAL-HCI-missing-spn.md', content: fixture('TSG/Deployment/TSG-Azure-LOCAL-HCI-missing-spn.md') });
  assert.equal(p.title, 'Missing SPN during deployment');
  assert.equal(p.area, 'Deployment');
  assert.deepEqual(p.versions.trains, ['2411.3']);
  assert.deepEqual(p.versions.osVersions, ['23H2']);
  assert.ok(p.errorCodes.includes('SecretNotFoundException'));
  assert.ok(p.errorStrings.some((e) => e.includes("raised an exception")));
  assert.match(p.symptoms, /error when trying to run a deployment/);
  assert.ok(p.mitigation && p.mitigationSummary);
});

test('error-42 TSG: unfenced error text under "# Error:" and exit code extraction', () => {
  const path = 'TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md';
  const labels = parseReadmeIndex('TSG/ArcRegistration/README.md', fixture('TSG/ArcRegistration/README.md'));
  const p = parseTsg({ path, content: fixture(path), readmeTitle: labels[path] ?? null });
  assert.equal(p.area, 'Registration');
  assert.match(p.title, /error 42/i);
  assert.ok(p.errorStrings.some((e) => e.includes('exitcode: 42')));
  assert.ok(p.errorCodes.includes('exitcode 42'));
  assert.ok(p.errorCodes.includes('ArcAgentConnectionException'));
});

test('Environment Validator TSG: skips boilerplate headings, reads tsg-metadata', () => {
  const path = 'TSG/EnvironmentValidator/Troubleshooting-AzStackHci_Subscription_State.md';
  const p = parseTsg({ path, content: fixture(path) });
  assert.equal(p.title, 'AzStackHci_Subscription_State');
  assert.ok(p.errorCodes.includes('AzStackHci_Subscription_State'));
  assert.equal(parseTsgMetadata('<!-- tsg-metadata\n{ not json }\n-->').raw, null);
});

test('parser is defensive about empty / odd input', () => {
  const p = parseTsg({ path: 'TSG/Networking/Some-odd_file.md', content: '' });
  assert.equal(p.title, 'Some Odd File');
  assert.equal(p.symptoms, null);
  assert.equal(p.mitigation, null);
  assert.deepEqual(p.errorStrings, []);
  assert.doesNotThrow(() => parseTsg({ path: 'TSG/x.md', content: '```\nunterminated fence\n# Symptoms\nfoo' }));
});
