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
 *
 * Guardrails (live builds): if a source is unreachable or comes back suspiciously small compared to the
 * last published index (.cache/last-good-index.json, see AZL_BASELINE_FILE), that source's records are
 * carried over from the baseline and flagged in `index.degraded`. With no baseline the build fails
 * instead of producing a hollow site. Tune with AZL_MIN_* / AZL_MIN_RATIO / AZL_MAX_STALE_DAYS.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './lib/build.mjs';
import { getGitHubToken } from './lib/fetch.mjs';
import { daysBetween, thresholdsFromEnv } from './lib/guard.mjs';
import { validateIndex } from './lib/schema.mjs';
import { fixtureSource, liveSource } from './lib/sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(root, 'public/data/index.json');
const CACHE_DIR = resolve(root, '.cache');
const SOURCE_TEXT_FILE = resolve(CACHE_DIR, 'source-text.json');
const LASTMOD_FILE = resolve(CACHE_DIR, 'last-modified.json');
const BASELINE_FILE = process.env.AZL_BASELINE_FILE || resolve(CACHE_DIR, 'last-good-index.json');

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

async function loadBaseline() {
  const baseline = await readJson(BASELINE_FILE, null);
  if (!baseline) {
    log('no baseline index (first run, or the published site could not be fetched)');
    return null;
  }
  if (!validateIndex(baseline) || !baseline.items?.length) {
    warn(`ignoring baseline ${BASELINE_FILE}: not a valid, non-empty index`);
    return null;
  }
  log(`baseline: ${baseline.items.length} items generated ${baseline.generatedAt}${baseline.degraded?.length ? ' (itself degraded)' : ''}`);
  return baseline;
}

async function main() {
  const started = Date.now();
  const useFixtures = process.argv.includes('--fixtures') || process.env.INDEX_SOURCE === 'fixtures';

  let source;
  let baseline = null;
  let thresholds = null;
  const lastMod = useFixtures ? {} : await readJson(LASTMOD_FILE, {});
  if (useFixtures) {
    log('using offline fixtures (test/fixtures) - NOT live data');
    source = fixtureSource();
  } else {
    log((await getGitHubToken()) ? 'using a GitHub token' : 'no GitHub token: anonymous API limits, no last-updated dates');
    source = liveSource({ warn, cache: lastMod });
    baseline = await loadBaseline();
    thresholds = thresholdsFromEnv();
  }

  const { index, sourceText, degraded } = await buildIndex({ source, baseline, thresholds, log, warn });

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(index) + '\n');
  await writeFile(SOURCE_TEXT_FILE, JSON.stringify(sourceText));
  if (!useFixtures) await writeFile(LASTMOD_FILE, JSON.stringify(lastMod));

  log(`wrote ${OUT_FILE}`);
  log(`  ${index.stats.tsg} TSGs, ${index.stats['known-issue']} known issues, ${index.stats.release} releases (${((Date.now() - started) / 1000).toFixed(1)}s)`);

  if (degraded.length) {
    const maxDays = Number(process.env.AZL_MAX_STALE_DAYS ?? 14);
    const stale = degraded.filter((d) => daysBetween(d.since, d.checkedAt) >= maxDays);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = ['### ⚠️ Degraded sources', '', ...degraded.map((d) => `- **${d.source}** – serving data from ${d.since.slice(0, 10)}: ${d.reason}`), ''];
      await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    }
    if (stale.length) {
      console.error(`[build-index] ERROR: ${stale.map((d) => d.source).join(', ')} stale for ${maxDays}+ days; failing so someone looks at it.`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('[build-index] FAILED:', err);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=build-index failed::${String(err.message).replace(/\n/g, ' ')}`);
  process.exit(1);
});
