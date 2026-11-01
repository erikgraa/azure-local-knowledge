#!/usr/bin/env node
/**
 * Fetch the Azure Local Supportability TSGs and the Learn release / known-issues
 * articles, normalize them, and write public/data/index.json.
 *
 *   npm run build:index                   # live GitHub sources
 *   npm run build:index -- --fixtures     # offline: checked-in samples under test/fixtures (CI)
 *
 * Optional: GITHUB_TOKEN / GH_TOKEN (or a logged-in `gh`) raises API rate limits and
 * enables per-file "last updated" dates.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './lib/build.mjs';
import { getGitHubToken } from './lib/fetch.mjs';
import { fixtureSource, liveSource } from './lib/sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(root, 'public/data/index.json');
const CACHE_DIR = resolve(root, '.cache');
const SOURCE_TEXT_FILE = resolve(CACHE_DIR, 'source-text.json');
const LASTMOD_FILE = resolve(CACHE_DIR, 'last-modified.json');

const log = (...a) => console.log('[build-index]', ...a);
const warn = (...a) => {
  console.warn('[build-index] WARN', ...a);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=build-index::${a.join(' ')}`);
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const started = Date.now();
  const useFixtures = process.argv.includes('--fixtures') || process.env.INDEX_SOURCE === 'fixtures';

  let source;
  const lastMod = useFixtures ? {} : await readJson(LASTMOD_FILE, {});
  if (useFixtures) {
    log('using offline fixtures (test/fixtures) - NOT live data');
    source = fixtureSource();
  } else {
    log((await getGitHubToken()) ? 'using a GitHub token' : 'no GitHub token: anonymous API limits, no last-updated dates');
    source = liveSource({ warn, cache: lastMod });
  }

  const { index, sourceText } = await buildIndex({ source, log, warn });

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(index) + '\n');
  await writeFile(SOURCE_TEXT_FILE, JSON.stringify(sourceText));
  if (!useFixtures) await writeFile(LASTMOD_FILE, JSON.stringify(lastMod));

  log(`wrote ${OUT_FILE}`);
  log(`  ${index.stats.tsg} TSGs, ${index.stats['known-issue']} known issues, ${index.stats.release} releases (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

main().catch((err) => {
  console.error('[build-index] FAILED:', err);
  process.exit(1);
});
