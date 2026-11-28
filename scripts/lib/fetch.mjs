import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cachedToken;
/** GITHUB_TOKEN / GH_TOKEN, else whatever `gh auth token` knows. Optional - everything degrades without it. */
export async function getGitHubToken() {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  if (!cachedToken) {
    try {
      const { stdout } = await execFileP('gh', ['auth', 'token'], { timeout: 5000 });
      cachedToken = stdout.trim() || null;
    } catch {
      cachedToken = null;
    }
  }
  return cachedToken;
}

async function request(url, { headers = {}, retries = 4, json = false, withHeaders = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'azure-local-knowledge-build', ...headers }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const data = json ? await res.json() : await res.text();
        return withHeaders ? { data, headers: res.headers } : data;
      }
      if ([429, 502, 503, 504].includes(res.status) || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
        lastErr = new Error(`${res.status} ${url}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      const err = new Error(`${res.status} ${res.statusText} for ${url}`);
      err.status = res.status;
      throw err;
    } catch (err) {
      if (err.status) throw err;
      lastErr = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

async function apiHeaders() {
  const token = await getGitHubToken();
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

export async function githubTree(repo, ref) {
  return request(`https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`, {
    headers: await apiHeaders(),
    json: true,
  });
}

export async function githubContents(repo, path, ref) {
  return request(`https://api.github.com/repos/${repo}/contents/${encodePath(path)}?ref=${ref}`, {
    headers: await apiHeaders(),
    json: true,
  });
}

export async function githubCommitDates(repo, path, ref, { warn = console.warn } = {}) {
  const url = `https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}&per_page=1`;
  const options = { headers: await apiHeaders(), json: true };
  const { data: latest, headers } = await request(url, { ...options, withHeaders: true });
  const commitDate = (list) => list?.[0]?.commit?.committer?.date ?? list?.[0]?.commit?.author?.date ?? null;
  let firstCommitDate = null;
  try {
    const links = headers.get('link') ?? '';
    const last = /<([^>]+)>;\s*rel="last"/.exec(links)?.[1];
    if (!last && /rel="next"/.test(links)) throw new Error('Incomplete commit pagination');
    firstCommitDate = commitDate(last ? await request(last, options) : latest);
  } catch (err) {
    warn(`could not fetch first commit date for ${path}: ${err.message}`);
  }
  return { date: commitDate(latest), firstCommitDate };
}

export const rawFile = (repo, ref, path) =>
  request(`https://raw.githubusercontent.com/${repo}/${ref}/${encodePath(path)}`);

/** Run fn over items with bounded concurrency; failures are captured, not thrown. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
