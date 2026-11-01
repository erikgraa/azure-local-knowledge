#!/usr/bin/env node
/**
 * Copilot enrichment pass over public/data/index.json.
 *
 *   npm run enrich                         # uses the Copilot CLI
 *   npm run enrich -- --max-items 20       # cap work per run
 *   npm run enrich -- --dry-run            # show what would be processed
 *   npm run enrich -- --strict             # exit non-zero if anything fails (default: degrade gracefully)
 *
 * Contract: index.json stays valid and complete no matter what happens here. Results are cached by
 * source content hash (.cache/enrichment-cache.json), validated against schema/enrichment.schema.json,
 * and anything that fails validation or errors out is simply skipped, leaving the parser data intact.
 */
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROMPT_VERSION,
  applyEnrichment,
  buildNeighbourFinder,
  buildPrompt,
  chunk,
  clampResults,
  extractJson,
  pickResults,
  selectCandidates,
} from './lib/enrich.mjs';
import { PROVIDERS } from './lib/providers.mjs';
import { formatErrors, validateEnrichment, validateIndex } from './lib/schema.mjs';
import { pool } from './lib/fetch.mjs';
import { compareTrains } from './lib/versions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so tests can run against a scratch directory.
const INDEX_FILE = process.env.AZL_INDEX_FILE || resolve(root, 'public/data/index.json');
const REPORT_FILE = process.env.AZL_REPORT_FILE || resolve(dirname(INDEX_FILE), 'enrichment-report.json');
const CACHE_DIR = process.env.AZL_CACHE_DIR || resolve(root, '.cache');
const CACHE_FILE = resolve(CACHE_DIR, 'enrichment-cache.json');
const BASE_COPY = resolve(CACHE_DIR, 'index.base.json');
const SOURCE_TEXT_FILE = resolve(CACHE_DIR, 'source-text.json');

const log = (...a) => console.log('[enrich]', ...a);
const warn = (msg) => {
  console.warn('[enrich] WARN', msg);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Copilot enrichment::${String(msg).replace(/\n/g, ' ')}`);
};

function parseArgs(argv) {
  const args = { strict: false, dryRun: false, force: false, maxItems: null, provider: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') args.strict = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--max-items') args.maxItems = Number(argv[++i]);
    else if (a === '--provider') args.provider = argv[++i];
  }
  return args;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providerName = args.provider || process.env.ENRICH_PROVIDER || 'copilot-cli';
  const maxItems = args.maxItems ?? Number(process.env.ENRICH_MAX_ITEMS ?? 60);
  const batchSize = Number(process.env.ENRICH_BATCH_SIZE ?? 4);
  const concurrency = Number(process.env.ENRICH_CONCURRENCY ?? 2);
  const model = process.env.ENRICH_MODEL || undefined;
  const provider = PROVIDERS[providerName];

  const index = await readJson(INDEX_FILE, null);
  if (!index) {
    log('no public/data/index.json - run `npm run build:index` first. Nothing to do.');
    return 0;
  }
  if (!provider) throw new Error(`Unknown provider "${providerName}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`);

  const cache = await readJson(CACHE_FILE, { version: 1, entries: {} });
  if (cache.version !== 1 || typeof cache.entries !== 'object') cache.entries = {};
  const sourceTexts = await readJson(SOURCE_TEXT_FILE, {});

  // Always enrich from the deterministic base, never from a previously enriched file.
  const base = index.enrichment ? await readJson(BASE_COPY, index) : index;
  await mkdir(CACHE_DIR, { recursive: true });
  await writeAtomic(BASE_COPY, JSON.stringify(base));

  const items = base.items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const idSet = new Set(byId.keys());
  for (const id of Object.keys(cache.entries)) if (!idSet.has(id)) delete cache.entries[id];

  const pending = selectCandidates(items, cache, { force: args.force }).filter((i) => sourceTexts[i.id]);
  const todo = pending.slice(0, Math.max(0, maxItems));
  log(`${items.length} items: ${items.length - pending.length - items.filter((i) => i.type === 'release').length} cached, ${pending.length} need enrichment, processing ${todo.length} (provider ${providerName})`);

  const stats = { processed: 0, failedBatches: 0, invalidResults: 0, skippedNoProvider: false };
  if (args.dryRun) {
    todo.forEach((i) => log(`  would enrich ${i.id} - ${i.title.slice(0, 70)}`));
    return 0;
  }

  if (todo.length && !provider.available()) {
    stats.skippedNoProvider = true;
    warn(`Provider "${providerName}" has no credentials; skipping new enrichment and using cached results only. See README "Copilot enrichment".`);
  } else if (todo.length) {
    const neighbourOf = buildNeighbourFinder(items);
    const batches = chunk(todo, batchSize);
    let saveChain = Promise.resolve();
    const saveCache = () => (saveChain = saveChain.then(() => writeAtomic(CACHE_FILE, JSON.stringify(cache))));

    const runBatch = async (batch, attempt = 0) => {
      const neighbours = batch.map((i) => neighbourOf(i));
      const prompt = buildPrompt({ batch, sourceTexts, releases: base.releases, neighbours });
      const raw = await provider.run(prompt, { model });
      const parsed = clampResults(extractJson(raw));
      if (!validateEnrichment(parsed)) throw new Error(`schema validation failed: ${formatErrors(validateEnrichment)}`);
      const picked = pickResults(parsed, batch.map((i) => i.id));
      let stored = 0;
      for (const item of batch) {
        const result = picked.get(item.id);
        if (!result) {
          stats.invalidResults++;
          continue;
        }
        cache.entries[item.id] = {
          hash: item.sourceHash,
          promptVersion: PROMPT_VERSION,
          provider: providerName,
          model: model ?? null,
          at: new Date().toISOString(),
          result,
        };
        stored++;
      }
      stats.processed += stored;
      // Model dropped some ids: retry those once, individually.
      const missing = batch.filter((i) => !picked.has(i.id));
      if (missing.length && batch.length > 1 && attempt === 0) {
        for (const item of missing) await runBatch([item], 1).catch((e) => warn(`item ${item.id}: ${e.message}`));
      }
    };

    const outcomes = await pool(batches, concurrency, async (batch, n) => {
      log(`batch ${n + 1}/${batches.length} (${batch.map((i) => i.id).join(', ').slice(0, 120)})`);
      try {
        await runBatch(batch);
      } catch (err) {
        if (batch.length > 1) {
          warn(`batch ${n + 1} failed (${err.message}); retrying items individually`);
          for (const item of batch) await runBatch([item], 1).catch((e) => { stats.failedBatches++; warn(`item ${item.id}: ${e.message}`); });
        } else {
          throw err;
        }
      }
      // Persist progress after every batch so a late failure loses nothing.
      await saveCache();
    });
    for (const o of outcomes) if (!o.ok) { stats.failedBatches++; warn(o.error.message); }
    await saveCache();
    if (stats.failedBatches && stats.processed === 0) warn('No enrichment results this run; index.json keeps parser data plus any cached enrichment.');
  }

  // ---- Apply every valid cached result onto a fresh copy of the base index -------------------
  const out = structuredClone(base);
  const outById = new Map(out.items.map((i) => [i.id, i]));
  const knownTrainsAsc = out.releases.map((r) => r.id).sort(compareTrains);
  const flagsReport = [];
  let applied = 0;
  for (const item of out.items) {
    const entry = cache.entries[item.id];
    if (!entry || entry.hash !== item.sourceHash || entry.promptVersion !== PROMPT_VERSION) continue;
    if (!validateEnrichment({ results: [entry.result] })) {
      stats.invalidResults++;
      continue;
    }
    applyEnrichment(item, entry.result, { knownTrainsAsc, byId: outById, provider: entry.provider, model: entry.model, at: entry.at });
    applied++;
  }
  for (const item of out.items) {
    for (const f of item.flags) flagsReport.push({ id: item.id, title: item.title, kind: f.kind, message: f.message, url: item.url });
  }

  out.enrichment = {
    provider: providerName,
    model: model ?? null,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    enrichedItems: applied,
    pendingItems: Math.max(0, pending.length - stats.processed),
  };

  if (!validateIndex(out)) {
    warn(`Enriched index failed schema validation (${formatErrors(validateIndex)}); keeping parser-only index.json.`);
    await copyFile(BASE_COPY, INDEX_FILE);
    return args.strict ? 1 : 0;
  }

  await writeAtomic(INDEX_FILE, JSON.stringify(out) + '\n');
  const report = { generatedAt: out.enrichment.generatedAt, ...out.enrichment, stats, flags: flagsReport };
  await writeAtomic(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
  log(`done: ${applied} items enriched (${stats.processed} new this run), ${out.enrichment.pendingItems} still pending, ${flagsReport.length} flags`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '### Copilot enrichment',
      '',
      `- Provider: \`${providerName}\`${model ? ` (model \`${model}\`)` : ''}`,
      `- Enriched items in index: **${applied}** (new this run: ${stats.processed})`,
      `- Still pending (will be picked up next run): ${out.enrichment.pendingItems}`,
      `- Failed batches: ${stats.failedBatches}`,
      '',
      ...(flagsReport.length
        ? ['| Item | Flag | Message |', '| --- | --- | --- |', ...flagsReport.slice(0, 40).map((f) => `| [${f.title.replace(/\|/g, '\\|').slice(0, 60)}](${f.url}) | ${f.kind} | ${f.message.replace(/\|/g, '\\|')} |`)]
        : ['No inconsistencies flagged.']),
    ];
    await writeFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' });
  }
  return args.strict && (stats.failedBatches || stats.skippedNoProvider) ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // Enrichment is optional: never fail the pipeline unless asked to.
    console.error('[enrich] ERROR:', err);
    process.exit(process.argv.includes('--strict') ? 1 : 0);
  });
