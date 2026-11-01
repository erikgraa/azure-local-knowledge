import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_DIR, DOCS_REPO } from './learn.mjs';
import { TSG_BRANCH, TSG_REPO } from './tsg.mjs';
import { getGitHubToken, githubContents, githubLastCommitDate, githubTree, pool, rawFile } from './fetch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = resolve(here, '../../test/fixtures');

/**
 * A "source" hides where the markdown comes from, so the same build code runs against the live
 * GitHub repos or against the checked-in fixtures (CI, offline work).
 *
 *   tsgTree()            -> { ref, truncated, files: [{ path, sha }] }
 *   tsgFile(path)        -> markdown
 *   learnFiles()         -> ['known-issues.md', 'previous-releases/known-issues-24.md', ...]
 *   learnFile(name)      -> markdown (name relative to azure-local/)
 *   lastModified(files)  -> Map(path -> ISO date), best effort
 */
export function liveSource({ warn = console.warn, cache = {} } = {}) {
  return {
    name: 'live',
    async tsgTree() {
      const tree = await githubTree(TSG_REPO, TSG_BRANCH);
      return {
        ref: tree.sha ?? null,
        truncated: Boolean(tree.truncated),
        files: tree.tree.filter((n) => n.type === 'blob' && /^TSG\/.+\.md$/i.test(n.path)).map((n) => ({ path: n.path, sha: n.sha })),
      };
    },
    tsgFile: (path) => rawFile(TSG_REPO, TSG_BRANCH, path),
    async learnFiles() {
      const found = new Set(['known-issues.md']);
      for (const dir of [DOCS_DIR, `${DOCS_DIR}/previous-releases`]) {
        try {
          for (const f of await githubContents(DOCS_REPO, dir, 'main')) {
            if (f.type === 'file' && /^known-issues.*\.md$/i.test(f.name)) found.add(dir === DOCS_DIR ? f.name : `previous-releases/${f.name}`);
          }
        } catch (err) {
          warn(`could not list ${dir}: ${err.message}`);
          if (dir !== DOCS_DIR) {
            found.add('previous-releases/known-issues-24.md');
            found.add('previous-releases/known-issues-23.md');
          }
        }
      }
      return [...found];
    },
    learnFile: (name) => rawFile(DOCS_REPO, 'main', `${DOCS_DIR}/${name}`),
    async lastModified(files) {
      const out = new Map();
      if (!(await getGitHubToken())) return out;
      const stale = files.filter((f) => cache[f.path]?.sha !== f.sha);
      const results = await pool(stale, 6, async (f) => ({ f, date: await githubLastCommitDate(TSG_REPO, f.path, TSG_BRANCH) }));
      for (const r of results) if (r.ok) cache[r.value.f.path] = { sha: r.value.f.sha, date: r.value.date };
      for (const f of files) if (cache[f.path]?.date) out.set(f.path, cache[f.path].date);
      return out;
    },
  };
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export function fixtureSource(dir = FIXTURE_DIR) {
  const tsgRoot = join(dir, 'supportability');
  const learnRoot = join(dir, 'learn');
  const posix = (p) => p.split('\\').join('/');
  return {
    name: 'fixtures',
    async tsgTree() {
      const files = [];
      for (const full of await walk(tsgRoot)) {
        const path = posix(relative(tsgRoot, full));
        if (!/^TSG\/.+\.md$/i.test(path)) continue;
        files.push({ path, sha: createHash('sha1').update(await readFile(full)).digest('hex') });
      }
      return { ref: 'fixtures', truncated: false, files };
    },
    tsgFile: (path) => readFile(join(tsgRoot, path), 'utf8'),
    async learnFiles() {
      return (await walk(learnRoot)).map((f) => posix(relative(learnRoot, f))).filter((f) => /(^|\/)known-issues.*\.md$/i.test(f));
    },
    learnFile: (name) => readFile(join(learnRoot, name), 'utf8'),
    async lastModified() {
      return new Map();
    },
  };
}
