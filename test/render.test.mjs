import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { blankRecord } from '../scripts/lib/records.mjs';

// Resolve the renderer's bundler-style imports for Node's native TypeScript loader.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === new URL('../src/render.ts', import.meta.url).href && ['./format', './versions'].includes(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { enrichmentSummary, renderDrawer } = await import('../src/render.ts');
hooks.deregister();

const item = blankRecord({
  id: 'tsg-example', type: 'tsg', title: 'Example', url: 'https://github.com/o/r/blob/main/TSG/example.md',
  firstSeenOnGitHub: '2023-04-05T06:07:08Z',
  lastUpdated: '2026-11-20T12:00:00Z',
  lifecycle: { state: 'active', firstSeen: '2026-11-28T00:00:00Z', lastSeen: '2026-11-28T00:00:00Z' },
});
const render = (value) => renderDrawer(value, { generatedAt: '2026-11-28T00:00:00Z' }, new Map(), []);

test('TSG details show first GitHub date separately using the existing date format', () => {
  const html = render(item);
  assert.match(html, /<dt>TSG first seen on GitHub<\/dt><dd>Apr 5, 2023<\/dd>/);
  assert.match(html, /<dt>Last updated<\/dt><dd>Nov 20, 2026<\/dd>/);
  assert.match(html, /<dt>First seen here<\/dt><dd>Nov 28, 2026<\/dd>/);
});

test('unknown first commit dates and non-TSGs do not show the new fact', () => {
  for (const firstSeenOnGitHub of [null, undefined]) {
    const html = render({ ...item, firstSeenOnGitHub });
    assert.doesNotMatch(html, /TSG first seen on GitHub/);
    assert.match(html, /First seen here/);
    assert.match(html, /Last updated/);
  }
  assert.doesNotMatch(render({ ...item, type: 'known-issue' }), /TSG first seen on GitHub/);
});

test('footer describes complete enrichment without counting release records', () => {
  const enriched = { ...item, enrichment: { provider: 'copilot-cli' } };
  const data = {
    enrichment: { enrichedItems: 2, pendingItems: 0 },
    items: [enriched, { ...enriched, type: 'known-issue' }, { ...item, type: 'release' }],
  };
  assert.equal(enrichmentSummary(data), 'All guides and known issues refined by Copilot');
});

test('footer retains the count when a new or archived guide is unenriched, even with no pending work', () => {
  const data = {
    enrichment: { enrichedItems: 1, pendingItems: 0 },
    items: [{ ...item, enrichment: { provider: 'copilot-cli' } }, item],
  };
  assert.equal(enrichmentSummary(data), '1 item refined by Copilot');
  data.items[1] = { ...item, lifecycle: { state: 'removed' } };
  assert.equal(enrichmentSummary(data), '1 item refined by Copilot');
});

test('footer does not claim complete enrichment for empty, release-only, or unenriched indexes', () => {
  assert.equal(enrichmentSummary({ items: [item], enrichment: null }), '');
  for (const items of [[], [item], [{ ...item, type: 'release' }]]) {
    assert.equal(enrichmentSummary({ items, enrichment: { enrichedItems: 0, pendingItems: 0 } }), '0 items refined by Copilot');
  }
});
