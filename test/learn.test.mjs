import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  consolidateKnownIssues,
  extractTsgPaths,
  issueTitle,
  learnUrl,
  parseFrontMatter,
  parseKnownIssueEntries,
  parseReleaseInfo,
  resolveLearnLink,
} from '../scripts/lib/learn.mjs';
import { headingAnchor } from '../scripts/lib/text.mjs';

const DOC = `---
title: Known issues
ms.date: 10/20/2026
---
# Known issues

::: moniker range="=azloc-2610"

## Known issues for version 2610

## Fixed issues

| Feature | Issue | Comments | Solution version |
| --- | --- | --- | --- |
| Update <!--111111--> | Update hangs at \`Step | with pipe\`. | Fixed now. | 12.2610.1004.41 |

## Known issues

There are none.

## Known issues from previous releases

| Feature | Issue | Workaround |
| --- | --- | --- |
| Deployment <!--33008717--> | Registration fails: \`AZCMAgent command failed with error: >> exitcode: 42\`. | See the [guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md). |
| Update <!--111111--> | Update hangs at a step. | Retry. |

::: moniker-end

::: moniker range="=azloc-2609"

## Known issues for version 2609

### Known issues

| Feature | Issue | Workaround |
| --- | --- | --- |
| Deployment <!--33008717--> | Registration fails: \`AZCMAgent command failed with error: >> exitcode: 42\`. | See the guide. |

## Known and expected behaviors

| Feature | Behavior | Workaround |
| --- | --- | --- |
| Operating system | RegBack restore is unsupported. | |

::: moniker-end
`;

test('front matter ms.date becomes ISO', () => {
  assert.deepEqual(parseFrontMatter(DOC), { title: 'Known issues', msDate: '2026-10-20' });
});

test('Learn heading anchors drop dots like Learn does', () => {
  assert.equal(headingAnchor('Known issues for version 2411.3'), 'known-issues-for-version-24113');
  assert.equal(headingAnchor('Known issues for version 2610'), 'known-issues-for-version-2610');
});

test('rows are tagged with release, kind, moniker view and bug id', () => {
  const entries = parseKnownIssueEntries(DOC, { file: 'known-issues.md' });
  assert.equal(entries.length, 5);
  const fixed = entries.find((e) => e.kind === 'fixed');
  assert.equal(fixed.train, '2610');
  assert.equal(fixed.view, 'azloc-2610');
  assert.equal(fixed.bugId, '111111');
  assert.equal(fixed.solutionVersion, '12.2610.1004.41');
  assert.match(fixed.issue, /`Step \| with pipe`/);
  assert.equal(entries.filter((e) => e.kind === 'carried').length, 2);
  assert.equal(entries.filter((e) => e.kind === 'expected').length, 1);
  assert.equal(entries.find((e) => e.train === '2609' && e.kind === 'open').anchor, 'known-issues-for-version-2609');
});

test('the same issue across releases collapses to one record with every affected release', () => {
  const items = consolidateKnownIssues(parseKnownIssueEntries(DOC, { file: 'known-issues.md' }), { 'known-issues.md': '2026-10-20' });
  const reg = items.find((i) => i.bugId === '33008717');
  assert.deepEqual(reg.releases, ['2609', '2610']);
  assert.equal(reg.introducedIn, '2609');
  assert.equal(reg.status, 'open');
  assert.deepEqual(reg.errorCodes, ['exitcode 42']);
  assert.deepEqual(reg.tsgPaths, ['TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md']);
  assert.equal(reg.url, 'https://learn.microsoft.com/azure/azure-local/known-issues?view=azloc-2610#known-issues-for-version-2610');
  assert.equal(reg.lastUpdated, '2026-10-20');
});

test('a bug listed as fixed becomes status=fixed and records the fix release', () => {
  const items = consolidateKnownIssues(parseKnownIssueEntries(DOC, { file: 'known-issues.md' }));
  const upd = items.find((i) => i.bugId === '111111');
  assert.equal(upd.status, 'fixed');
  assert.equal(upd.fixedIn, '2610');
  assert.equal(upd.fixedInVersion, '12.2610.1004.41');
  assert.equal(items.filter((i) => i.status === 'expected').length, 1);
});

test('later listing after a fix is flagged as inconsistent', () => {
  const entries = parseKnownIssueEntries(DOC, { file: 'known-issues.md' });
  const stale = { ...entries.find((e) => e.bugId === '111111' && e.kind === 'carried'), train: '2611', kind: 'open' };
  const upd = consolidateKnownIssues([...entries, stale]).find((i) => i.bugId === '111111');
  assert.ok(upd.flags.some((f) => f.kind === 'listed-after-fix'));
});

test('release table rows give train, OS build, date and supersession', () => {
  const md = `## Azure Local release information summary

### Supported versions of Azure Local

| Solution version | OS build | Security update | What's new | Known issues |
| --- | --- | --- | --- | --- |
| 12.2608.1003.9 <br><br> Availability date: 2026-09-01 Supersedes: 12.2608.1003.8 <br><br> Availability date: 2026-08-18 | 26100.33296 | [x](a.md) | [y](b.md) | [Known issues](./known-issues.md?view=azloc-2608&preserve-view=true) |

### Older versions of Azure Local

| Solution version | OS Build | Security update | What's new | Known issues |
| --- | --- | --- | --- | --- |
| 10.2411.3.2 <br><br> Availability date: 2025-02-20 | 25398.1425 | [x](a.md) | [y](b.md) | [Known issues](./previous-releases/known-issues-24.md?view=azloc-previous) |
`;
  const rows = parseReleaseInfo(md);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => [r.train, r.version, r.osBuild, r.availabilityDate, r.supported, r.osVersion]),
    [
      ['2608', '12.2608.1003.9', '26100.33296', '2026-09-01', true, '24H2'],
      ['2608', '12.2608.1003.8', null, '2026-08-18', true, '24H2'],
      ['2411.3', '10.2411.3.2', '25398.1425', '2025-02-20', false, '23H2'],
    ],
  );
});

test('helpers: titles, links, tsg path extraction', () => {
  assert.equal(issueTitle('In this release and previous releases, registration fails with a timeout.'), 'Registration fails with a timeout.');
  assert.equal(learnUrl({ file: 'previous-releases/known-issues-24.md', view: null, anchor: 'known-issues-for-version-24113' }), 'https://learn.microsoft.com/azure/azure-local/previous-releases/known-issues-24#known-issues-for-version-24113');
  assert.equal(resolveLearnLink('./known-issues.md?view=azloc-2610&preserve-view=true'), 'https://learn.microsoft.com/azure/azure-local/known-issues?view=azloc-2610');
  assert.deepEqual(extractTsgPaths('x https://github.com/Azure/AzureStackHCI-Supportability/blob/main/TSG/Update/a%20b.md#frag y'), ['TSG/Update/a b.md']);
});

test('parsers tolerate empty or unrelated markdown', () => {
  assert.deepEqual(parseKnownIssueEntries('', { file: 'x.md' }), []);
  assert.deepEqual(parseKnownIssueEntries('# Hello\n\nnothing here', { file: 'x.md' }), []);
  assert.deepEqual(parseReleaseInfo('no tables'), []);
});
