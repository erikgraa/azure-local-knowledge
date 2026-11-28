import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { getGitHubToken, githubCommitDates } from '../scripts/lib/fetch.mjs';
import { liveSource } from '../scripts/lib/sources.mjs';

const FIRST = '2023-04-05T06:07:08Z';
const LATEST = '2026-11-20T12:00:00Z';
const path = 'TSG/Deployment/Guide with spaces #1.md';
const commit = (date) => ({ commit: { committer: { date }, author: { date: FIRST } } });
const response = (data, headers = {}) => new Response(JSON.stringify(data), { headers });

before(async () => {
  const env = process.env;
  process.env = { ...env, GITHUB_TOKEN: 'test-token' };
  try {
    await getGitHubToken();
  } finally {
    process.env = env;
  }
});

test('commit dates use the final history page, not the latest commit or author date', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    if (requests.length === 1) {
      const last = `${url}&page=137`;
      return response([commit(LATEST)], { link: `<${url}&page=2>; rel="next", <${last}>; rel="last"` });
    }
    return response([commit(FIRST)]);
  });
  assert.deepEqual(await githubCommitDates('owner/repo', path, 'release/test'), { date: LATEST, firstCommitDate: FIRST });
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0]).searchParams.get('path'), path);
  assert.equal(new URL(requests[0]).searchParams.get('sha'), 'release/test');
  assert.equal(new URL(requests[1]).searchParams.get('page'), '137');
});

test('single-commit and empty histories need one request; author date is a fallback', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response([commit(undefined)]));
  assert.deepEqual(await githubCommitDates('owner/repo', path, 'main'), { date: FIRST, firstCommitDate: FIRST });
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => response([]));
  assert.deepEqual(await githubCommitDates('owner/repo', path, 'main'), { date: null, firstCommitDate: null });
});

test('incomplete pagination is not mistaken for the first commit', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => response([commit(LATEST)], { link: `<${url}&page=2>; rel="next"` }));
  const warnings = [];
  assert.deepEqual(await githubCommitDates('owner/repo', path, 'main', { warn: (message) => warnings.push(message) }), {
    date: LATEST, firstCommitDate: null,
  });
  assert.match(warnings[0], /Incomplete commit pagination/);
});

test('a failed oldest-page lookup preserves the latest date and retries on the next build', async (t) => {
  const warnings = [];
  const cache = {};
  const source = liveSource({ cache, warn: (message) => warnings.push(message) });
  const files = [{ path, sha: 'sha' }];
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).searchParams.has('page')) return new Response('', { status: 404 });
    return response([commit(LATEST)], { link: `<${url}&page=2>; rel="last"` });
  });
  assert.deepEqual((await source.commitDates(files)).get(path), { sha: 'sha', date: LATEST, firstCommitDate: null });
  assert.match(warnings[0], /could not fetch first commit date.*404/);
  await source.commitDates(files);
  assert.equal(fetch.mock.callCount(), 4);
});

test('pipeline backfills old cache entries, reuses them, and retrieves new and changed TSGs', async (t) => {
  const cache = { [path]: { sha: 'old-sha', date: LATEST } };
  const source = liveSource({ cache });
  const fetch = t.mock.method(globalThis, 'fetch', async () => response([commit(FIRST)]));
  const files = [{ path, sha: 'old-sha' }];
  assert.equal((await source.commitDates(files)).get(path).firstCommitDate, FIRST);
  assert.equal(fetch.mock.callCount(), 1, 'unchanged latest-only cache is backfilled');
  await source.commitDates(files);
  assert.equal(fetch.mock.callCount(), 1, 'complete metadata is cached');
  const newPath = 'TSG/Update/New guide.md';
  files.push({ path: newPath, sha: 'new-sha' });
  files[0].sha = 'changed-sha';
  const dates = await source.commitDates(files);
  assert.equal(fetch.mock.callCount(), 3);
  assert.equal(dates.get(newPath).firstCommitDate, FIRST);
  assert.equal(cache[path].sha, 'changed-sha');
});

test('history failures warn, retain known dates, and retry missing metadata', async (t) => {
  const cached = { sha: 'previous-sha', date: LATEST, firstCommitDate: FIRST };
  const cache = { [path]: { ...cached } };
  const warnings = [];
  const source = liveSource({ cache, warn: (message) => warnings.push(message) });
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const files = [{ path, sha: 'changed-sha' }, { path: 'TSG/new.md', sha: 'new-sha' }];
  const dates = await source.commitDates(files);
  assert.deepEqual(dates.get(path), cached);
  assert.equal(dates.has('TSG/new.md'), false);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((message) => /could not fetch commit dates.*404/.test(message)));
  fetch.mock.mockImplementation(async () => response([commit(FIRST)]));
  await source.commitDates(files);
  assert.equal(fetch.mock.callCount(), 4, 'both failed paths retry on the next build');
  assert.equal(cache['TSG/new.md'].firstCommitDate, FIRST);
});
