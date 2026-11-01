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

async function request(url, { headers = {}, retries = 4, json = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'azlocal-triage-build', ...headers } });
      if (res.ok) return json ? await res.json() : await res.text();
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

export async function githubLastCommitDate(repo, path, ref) {
  const list = await request(
    `https://api.github.com/repos/${repo}/commits?sha=${ref}&path=${encodeURIComponent(path)}&per_page=1`,
    { headers: await apiHeaders(), json: true },
  );
  return list?.[0]?.commit?.committer?.date ?? list?.[0]?.commit?.author?.date ?? null;
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
