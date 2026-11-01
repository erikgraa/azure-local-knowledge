#!/usr/bin/env node
/**
 * Durable archive of the published index on a dedicated `data` git branch.
 *
 *   node scripts/archive.mjs load    [--out .cache/last-good-index.json]   # fetch the archive as the build baseline
 *   node scripts/archive.mjs publish [--index public/data/index.json]      # commit the final index if its content changed
 *
 * Why a git branch: it survives cache eviction and an unreachable website, keeps the full history of every
 * daily change, and needs no extra service. Commits are made with plumbing commands, so no working-tree checkout
 * of the branch is needed. Pushes to `data` do not trigger the deploy workflow.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ARCHIVE_README = `# Data archive

Machine-written history of the Azure Local Compendium index. Each commit is the published \`index.json\` after a daily
(or manual) build; a commit is only made when the content actually changed.

Nothing is ever removed from this archive: items that disappeared from the official sources are kept with
\`lifecycle.state = "removed"\`.

- \`index.json\` - the full index (see schema/index.schema.json on main)
- \`meta.json\`  - content hash used to skip no-op commits
`;

const git = (args, { cwd, input, env, allowFail = false } = {}) => {
  try {
    return execFileSync('git', args, { cwd, input, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${(err.stderr || err.message).toString().trim().slice(0, 400)}`);
  }
};

/** Hash of what matters: everything except timestamps that change on every run. */
export function contentHash(index) {
  const strip = (x) => {
    const c = structuredClone(x);
    if (c.lifecycle) delete c.lifecycle.lastSeen;
    if (c.enrichment) delete c.enrichment.enrichedAt;
    return c;
  };
  const stable = {
    releases: (index.releases ?? []).map(strip),
    items: (index.items ?? []).map(strip),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

const remoteRef = (remote, branch) => `refs/remotes/${remote}/${branch}`;

/** Fetch the archive branch; returns true if it exists. */
export function fetchArchive({ cwd, remote = 'origin', branch = 'data' } = {}) {
  const r = git(['fetch', '--quiet', '--depth=1', remote, `+refs/heads/${branch}:${remoteRef(remote, branch)}`], { cwd, allowFail: true });
  return r !== null;
}

export function loadArchive({ cwd, remote = 'origin', branch = 'data', out } = {}) {
  if (!fetchArchive({ cwd, remote, branch })) return { found: false };
  const text = git(['show', `${remoteRef(remote, branch)}:index.json`], { cwd, allowFail: true });
  if (!text) return { found: false };
  const index = JSON.parse(text);
  let wrote = false;
  if (out) {
    // Keep an existing baseline (e.g. fetched from the live site) if it is newer than the archive.
    let existing = null;
    try {
      existing = JSON.parse(readFileSync(out, 'utf8')).generatedAt;
    } catch {
      /* none yet */
    }
    if (!existing || existing < index.generatedAt) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, text);
      wrote = true;
    }
  }
  return { found: true, wrote, items: index.items?.length ?? 0, generatedAt: index.generatedAt };
}

export function publishArchive({ cwd, indexFile, remote = 'origin', branch = 'data', identity = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }, now = new Date().toISOString() } = {}) {
  const text = readFileSync(indexFile, 'utf8');
  const index = JSON.parse(text);
  const hash = contentHash(index);
  const parentExists = fetchArchive({ cwd, remote, branch });
  const parent = parentExists ? git(['rev-parse', remoteRef(remote, branch)], { cwd }).trim() : null;

  if (parent) {
    const prevMeta = git(['show', `${parent}:meta.json`], { cwd, allowFail: true });
    if (prevMeta && JSON.parse(prevMeta).contentHash === hash) return { committed: false, reason: 'unchanged' };
  }

  const removed = (index.items ?? []).filter((i) => i.lifecycle?.state === 'removed').length;
  const meta = JSON.stringify({ contentHash: hash, generatedAt: index.generatedAt, items: index.items?.length ?? 0, removed, archivedAt: now }, null, 2) + '\n';
  const blob = (content) => git(['hash-object', '-w', '--stdin'], { cwd, input: content }).trim();
  const tree = git(
    ['mktree'],
    {
      cwd,
      input: [`100644 blob ${blob(ARCHIVE_README)}\tREADME.md`, `100644 blob ${blob(text)}\tindex.json`, `100644 blob ${blob(meta)}\tmeta.json`].join('\n') + '\n',
    },
  ).trim();
  const env = { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email };
  const message = `Archive ${index.generatedAt}: ${index.items?.length ?? 0} items (${removed} removed upstream)`;
  const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message], { cwd, env }).trim();
  git(['push', '--quiet', remote, `${commit}:refs/heads/${branch}`], { cwd });
  return { committed: true, commit, parent, removed };
}

// ---- CLI ---------------------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : fallback;
  };
  try {
    if (cmd === 'load') {
      const out = resolve(root, opt('--out', '.cache/last-good-index.json'));
      const r = loadArchive({ cwd: root, out });
      console.log(r.found ? `[archive] data branch has ${r.items} items (generated ${r.generatedAt})${r.wrote ? ' - using it as the baseline' : ' - the existing baseline is newer, keeping it'}` : '[archive] no data branch yet');
    } else if (cmd === 'publish') {
      const r = publishArchive({ cwd: root, indexFile: resolve(root, opt('--index', 'public/data/index.json')) });
      console.log(r.committed ? `[archive] committed ${r.commit.slice(0, 7)} (${r.removed} removed upstream, kept)` : `[archive] nothing to commit (${r.reason})`);
    } else {
      console.error('usage: archive.mjs load|publish');
      process.exit(2);
    }
  } catch (err) {
    console.error('[archive] ERROR:', err.message);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Archive::${String(err.message).replace(/\n/g, ' ')}`);
    process.exit(1);
  }
}
