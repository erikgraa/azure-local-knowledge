#!/usr/bin/env node
/**
 * Final sanity gate before publishing:
 *
 *   node scripts/check-index.mjs [path/to/index.json] [--dist dist]
 *
 * Fails (exit 1) if the index is missing, doesn't match the schema, or is implausibly small, and
 * optionally verifies the built site contains the same data. Used by the deploy workflow so a bad
 * run can never replace a healthy site with an empty one.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { countsOf, thresholdsFromEnv } from './lib/guard.mjs';
import { formatErrors, validateIndex } from './lib/schema.mjs';

const args = process.argv.slice(2);
const distIdx = args.indexOf('--dist');
const dist = distIdx >= 0 ? args.splice(distIdx, 2)[1] : null;
const file = resolve(args[0] ?? 'public/data/index.json');

const fail = (msg) => {
  console.error(`[check-index] FAIL: ${msg}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Index check failed::${msg}`);
  process.exit(1);
};

async function load(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    fail(`cannot read ${path}: ${err.code ?? err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fail(`${path} is not valid JSON`);
  }
}

const index = await load(file);
if (!validateIndex(index)) fail(`schema validation failed: ${formatErrors(validateIndex)}`);

const th = thresholdsFromEnv();
const c = countsOf(index);
const problems = [];
if (c.tsg < th.min.tsg) problems.push(`only ${c.tsg} TSGs (minimum ${th.min.tsg})`);
if (c['known-issue'] < th.min['known-issue']) problems.push(`only ${c['known-issue']} known issues (minimum ${th.min['known-issue']})`);
if (c.releases < th.min.releases) problems.push(`only ${c.releases} releases (minimum ${th.min.releases})`);
if (problems.length) fail(problems.join('; '));

if (dist) {
  const built = await load(resolve(dist, 'data/index.json'));
  if (built.items?.length !== index.items.length) fail(`${dist}/data/index.json has ${built.items?.length} items, expected ${index.items.length}`);
  try {
    const html = await readFile(resolve(dist, 'index.html'), 'utf8');
    if (!html.includes('<script')) fail(`${dist}/index.html has no script`);
  } catch {
    fail(`${dist}/index.html is missing`);
  }
}

console.log(`[check-index] OK: ${c.tsg} TSGs, ${c['known-issue']} known issues, ${c.releases} releases${index.degraded?.length ? ` (degraded: ${index.degraded.map((d) => d.source).join(', ')})` : ''}`);
