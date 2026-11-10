import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { manifestReferences, planRetention, retainContainers } from '../scripts/container-retention.mjs';

const now = new Date('2026-11-10T12:00:00Z');
const old = '2026-09-01T00:00:00Z';
const blob = `sha256:${'a'.repeat(64)}`;
function image(extra = {}) {
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { digest: blob }, layers: [], ...extra }));
  return { bytes, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
}
function index(children) {
  return image({ mediaType: 'application/vnd.oci.image.index.v1+json', manifests: children.map(digest => ({ digest })) });
}
function version(id, tags, manifest = image({ annotations: { id: String(id) } }), extra = {}) {
  return { id, name: manifest.digest, created_at: old, updated_at: old,
    metadata: { package_type: 'container', container: { tags } }, ...extra };
}
const anchor = version(1, ['latest']);

test('only old exclusively dated/SHA versions expire; preserve anchors, releases, unknown and untagged', () => {
  const versions = [anchor, version(2, ['2026-09-01', 'sha-abcdef0']), version(3, ['sha-abcdef1']),
    version(4, ['nightly']), version(5, ['v1.2.3', '2026-09-01-release']), version(6, ['sha-abcdef2', 'stable']),
    version(7, []), version(8, ['2026-11-01']), version(9, ['2026-02-30']), version(10, ['nightly-20260901']),
    version(11, ['sha-abcdef3'], undefined, { updated_at: '2026-11-09T00:00:00Z' }),
    version(12, ['sha-abcdef4'], undefined, { created_at: '2026-11-09T00:00:00Z', updated_at: '2026-11-09T00:00:00Z' }),
    version(13, ['sha-abcdef5'], undefined, { updated_at: '2026-10-11T12:00:00Z' })];
  assert.deepEqual(planRetention(versions, new Set(), now).map(v => v.id), [2, 3]);
  assert.deepEqual(planRetention(versions, new Set([versions[1].name]), now).map(v => v.id), [3]);
});

test('malformed or incomplete package metadata fails closed', () => {
  for (const bad of [[], [version(2, ['sha-abcdef0'])], [anchor, anchor],
    [anchor, { ...version(2, []), metadata: {} }], [anchor, version(2, ['latest'])],
    [anchor, version(2, [], undefined, { created_at: 'broken' })], [anchor, version(2, [], undefined, { name: 'bad' })]]) {
    assert.throws(() => planRetention(bad, new Set(), now));
  }
});

test('manifest digests, schemas and references are validated', () => {
  const child = image();
  const parent = index([child.digest]);
  assert.deepEqual(manifestReferences(parent.bytes, parent.digest), [child.digest]);
  const subject = image({ subject: { digest: child.digest } });
  assert.deepEqual(manifestReferences(subject.bytes, subject.digest), [child.digest]);
  assert.throws(() => manifestReferences(child.bytes, blob), /digest mismatch/);
  for (const malformed of [image({ schemaVersion: 1 }), image({ mediaType: 'unknown' }),
    index([]), index(['invalid']), image({ config: { digest: 'invalid' } })]) {
    assert.throws(() => manifestReferences(malformed.bytes, malformed.digest));
  }
});

function fixture({ versions, manifests, failPage, changed = false, badIdentity = false, failManifest = false,
  deleteStatus = 204, organization = false, incomplete = false }) {
  const calls = [];
  let lists = 0;
  const remaining = structuredClone(versions);
  return { calls, fetchImpl: async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    assert.equal(options.redirect, 'error');
    const path = new URL(url).pathname;
    const response = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
    if (path === '/repos/owner/package') return response({ full_name: 'owner/package', owner: { login: 'owner', type: organization ? 'Organization' : 'User' } });
    if (path === '/token') return response({ token: 'registry-token' });
    if (path.includes('/manifests/')) {
      if (failManifest) return response({}, 503);
      const m = manifests.find(m => url.endsWith(m.digest));
      return m ? new Response(m.bytes) : response({}, 404);
    }
    assert.ok(path.startsWith(`/${organization ? 'orgs' : 'users'}/owner/packages/container/package`));
    if (!path.includes('/versions')) return response({ name: 'package', package_type: 'container', version_count: remaining.length + (incomplete ? 1 : 0), repository: { full_name: badIdentity ? 'other/package' : 'owner/package' } });
    if (options.method === 'DELETE') {
      if (deleteStatus === 204) remaining.splice(remaining.findIndex(v => path.endsWith(`/${v.id}`)), 1);
      return response({}, deleteStatus);
    }
    const page = Number(new URL(url).searchParams.get('page'));
    if (page === 1) lists++;
    if (page === failPage) return response({}, 403);
    const data = structuredClone(remaining);
    if (changed && lists > 1) data[1].metadata.container.tags.push('v1.0.0');
    return response(data.slice((page - 1) * 100, page * 100));
  } };
}
const root = image({ annotations: { root: 'latest' } });
const obsolete = image({ annotations: { root: 'old' } });
const inventory = [version(1, ['latest'], root), version(2, ['2026-09-01', 'sha-abcdef0'], obsolete)];
async function run(f, apply = false) {
  return retainContainers({ repository: 'owner/package', actor: 'owner', token: 'test-only', now, log: () => {}, ...f, apply });
}

test('dry run reads manifests and full inventory but never deletes', async () => {
  const f = fixture({ versions: inventory, manifests: [root, obsolete] });
  assert.deepEqual(await run(f), [2]);
  assert.ok(f.calls.some(c => c.url.includes('page=2')));
  assert.ok(!f.calls.some(c => c.method === 'DELETE'));
});

test('apply deletes only planned tagged versions using user/org version endpoints', async () => {
  for (const organization of [false, true]) {
    const f = fixture({ versions: inventory, manifests: [root, obsolete], organization });
    assert.deepEqual(await run(f, true), [2]);
    assert.deepEqual(f.calls.filter(c => c.method === 'DELETE').map(c => c.url),
      [`https://api.github.com/${organization ? 'orgs' : 'users'}/owner/packages/container/package/versions/2`]);
  }
});

test('nested multiarchitecture children and OCI subjects stay protected even when tagged old', async () => {
  const nested = index([obsolete.digest]);
  const parent = index([nested.digest]);
  const subject = image({ subject: { digest: parent.digest } });
  const versions = [version(1, ['latest'], subject), version(2, ['sha-abcdef0'], obsolete),
    version(3, [], nested), version(4, ['2026-09-01'], parent)];
  const f = fixture({ versions, manifests: [subject, parent, nested, obsolete] });
  assert.deepEqual(await run(f, true), []);
  assert.ok(!f.calls.some(c => c.method === 'DELETE'));
});

test('children of retained untagged indexes also stay protected', async () => {
  const untagged = index([obsolete.digest]);
  const versions = [...inventory, version(3, [], untagged)];
  const f = fixture({ versions, manifests: [root, obsolete, untagged] });
  assert.deepEqual(await run(f, true), []);
  assert.ok(!f.calls.some(c => c.method === 'DELETE'));
});

test('multiple eligible versions delete with refreshed inventory after each successful deletion', async () => {
  const second = image({ annotations: { old: 'second' } });
  const versions = [...inventory, version(3, ['sha-abcdef1'], second)];
  const f = fixture({ versions, manifests: [root, obsolete, second] });
  assert.deepEqual(await run(f, true), [2, 3]);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 2);
});

test('pagination errors, registry errors, identity mismatch and concurrent retags abort before deletion', async () => {
  for (const options of [{ failPage: 2 }, { failManifest: true }, { badIdentity: true }, { changed: true }, { incomplete: true }]) {
    const f = fixture({ versions: inventory, manifests: [root, obsolete], ...options });
    await assert.rejects(run(f, true));
    assert.ok(!f.calls.some(c => c.method === 'DELETE'));
  }
});

test('delete errors are fatal and are not retried', async () => {
  const f = fixture({ versions: inventory, manifests: [root, obsolete], deleteStatus: 403 });
  await assert.rejects(run(f, true), /403/);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 1);
});

test('more than 100 versions are fully paginated and all recent versions retained', async () => {
  const versions = Array.from({ length: 101 }, (_, i) => version(i + 1, i === 0 ? ['latest'] : [`sha-${i.toString(16).padStart(7, '0')}`],
    undefined, { created_at: '2026-11-09T00:00:00Z', updated_at: '2026-11-09T00:00:00Z' }));
  const manifests = Array.from({ length: 101 }, (_, i) => image({ annotations: { id: String(i + 1) } }));
  const f = fixture({ versions, manifests });
  assert.deepEqual(await run(f), []);
  assert.ok(f.calls.some(c => c.url.includes('page=3')));
});

test('workflow preserves refresh ordering, tags and serialized publication; cleanup follows successful push', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '17 4 \* \* \*'/);
  assert.match(workflow, /group: pages\s+cancel-in-progress: false/);
  assert.match(workflow, /type=raw,value=latest/);
  assert.match(workflow, /type=raw,value=\$\{\{ steps.index.outputs.date \}\}/);
  assert.match(workflow, /type=sha,prefix=sha-/);
  assert.ok(workflow.indexOf('Build index from live sources') < workflow.indexOf('Build site for the container image'));
  assert.ok(workflow.indexOf('Build and push (amd64 + arm64)') < workflow.indexOf('container-retention.mjs --apply'));
  const paths = workflow.slice(workflow.indexOf('    paths:'), workflow.indexOf('  schedule:'));
  for (const input of ['src/**', 'public/**', 'schema/**', 'scripts/**', 'Dockerfile', 'package-lock.json', '.github/workflows/deploy.yml']) assert.ok(paths.includes(input));
  assert.ok(!paths.includes('README.md') && !paths.includes('docs/**'));
});
