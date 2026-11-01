import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  expandRange,
  extractVersions,
  normalizeTrain,
  osVersionFromSolutionVersion,
  resolveKnownTrain,
  trainFromSolutionVersion,
  trainKey,
} from '../scripts/lib/versions.mjs';

test('solution versions map to release trains', () => {
  assert.equal(trainFromSolutionVersion('12.2610.1004.41'), '2610');
  assert.equal(trainFromSolutionVersion('11.2510.1002.93'), '2510');
  assert.equal(trainFromSolutionVersion('10.2411.3.2'), '2411.3');
  assert.equal(trainFromSolutionVersion('10.2411.0.24'), '2411');
  assert.equal(trainFromSolutionVersion('not a version'), null);
  assert.equal(trainFromSolutionVersion(null), null);
});

test('10.x/11.x ship the 23H2 OS build, 12.x ships 24H2', () => {
  assert.equal(osVersionFromSolutionVersion('10.2503.0.13'), '23H2');
  assert.equal(osVersionFromSolutionVersion('11.2510.1002.93'), '23H2');
  assert.equal(osVersionFromSolutionVersion('12.2610.1004.41'), '24H2');
});

test('train keys sort minor trains between their neighbours', () => {
  assert.ok(trainKey('2411') < trainKey('2411.3'));
  assert.ok(trainKey('2411.3') < trainKey('2503'));
  assert.equal(normalizeTrain('2411.0'), '2411');
  assert.equal(normalizeTrain('2411.3'), '2411.3');
  assert.equal(normalizeTrain('abc'), null);
});

test('extractVersions reads the TSG title convention', () => {
  const v = extractVersions('TSG | 23H2 | 10.2411.3.2 | Missing SPN during deployment');
  assert.deepEqual(v.trains, ['2411.3']);
  assert.deepEqual(v.solutionVersions, ['10.2411.3.2']);
  assert.deepEqual(v.osVersions, ['23H2']);
});

test('extractVersions handles file-name style versions and trailing .0', () => {
  assert.deepEqual(extractVersions('Triggering-deployment-OperationTimeout-2411-0').trains, ['2411']);
  assert.deepEqual(extractVersions('results in OperationTimeout 2411.1 and LCM Extension 2411-1').trains, ['2411.1']);
  assert.deepEqual(extractVersions('[2411.2][2411.3] ConfigureSecurityBaseline').trains, ['2411.2', '2411.3']);
});

test('extractVersions does not mistake OS builds or component versions for trains', () => {
  assert.deepEqual(extractVersions('OS build 26100.33650').trains, []);
  assert.deepEqual(extractVersions('LCM Extension Build: 30.2411.2.789').trains, []);
  assert.deepEqual(extractVersions('Az.Accounts 5.3.0').trains, []);
  assert.deepEqual(extractVersions('').trains, []);
  assert.deepEqual(extractVersions(undefined).trains, []);
});

test('extractVersions detects ranges and open-ended phrasing', () => {
  assert.deepEqual(extractVersions('Fails 2411 - 2505').range, { from: '2411', to: '2505' });
  assert.equal(extractVersions('Fails on 2504 and later').openEnded, true);
  assert.equal(extractVersions('Fails on 2504').openEnded, false);
});

test('expandRange / resolveKnownTrain use the known release list', () => {
  const known = ['2411', '2411.3', '2503', '2504', '2505'];
  assert.deepEqual(expandRange('2411.3', '2504', known), ['2411.3', '2503', '2504']);
  assert.deepEqual(expandRange('2503', null, known), ['2503', '2504', '2505']);
  assert.deepEqual(expandRange(null, '2411', known), ['2411']);
  const set = new Set(known);
  assert.equal(resolveKnownTrain('2411.0', set), '2411');
  assert.equal(resolveKnownTrain('2411.9', set), '2411');
  assert.equal(resolveKnownTrain('2999', set), null);
});
