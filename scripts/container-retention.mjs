import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const INDEX_TYPES = new Set(['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']);
const IMAGE_TYPES = new Set(['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json']);
const ACCEPT = [...INDEX_TYPES, ...IMAGE_TYPES].join(', ');

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Invalid package timestamp');
  }
  return Date.parse(value);
}

export function validateVersions(versions) {
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('Empty or invalid inventory');
  const ids = new Set();
  const digests = new Set();
  const tags = new Set();
  for (const v of versions) {
    if (!Number.isSafeInteger(v.id) || v.id <= 0 || ids.has(v.id) || !DIGEST.test(v.name) || digests.has(v.name)) {
      throw new Error('Invalid or duplicate package version');
    }
    ids.add(v.id);
    digests.add(v.name);
    timestamp(v.created_at);
    timestamp(v.updated_at);
    if (Date.parse(v.updated_at) < Date.parse(v.created_at)) throw new Error('Inconsistent timestamps');
    const names = v.metadata?.container?.tags;
    if (v.metadata?.package_type !== 'container' || !Array.isArray(names)) throw new Error('Missing container metadata');
    for (const tag of names) {
      if (typeof tag !== 'string' || !tag || tags.has(tag)) throw new Error('Invalid or duplicate tag');
      tags.add(tag);
    }
  }
  if (!tags.has('latest')) throw new Error('Missing latest safety anchor');
  return versions;
}

function expiredTag(tag, cutoff) {
  if (/^sha-[a-f0-9]{7,40}$/.test(tag)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return false;
  const date = Date.parse(`${tag}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === tag && date < cutoff;
}

export function planRetention(versions, referenced = new Set(), now = new Date()) {
  validateVersions(versions);
  const cutoff = now.getTime() - 30 * DAY;
  if (!Number.isFinite(cutoff)) throw new Error('Invalid retention clock');
  return versions.filter(v => {
    const tags = v.metadata.container.tags;
    return tags.length > 0 && tags.every(tag => expiredTag(tag, cutoff)) &&
      timestamp(v.created_at) < cutoff && timestamp(v.updated_at) < cutoff && !referenced.has(v.name);
  });
}

export function manifestReferences(bytes, digest) {
  if (!DIGEST.test(digest) || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== digest) {
    throw new Error('Manifest digest mismatch');
  }
  const manifest = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (manifest.schemaVersion !== 2) throw new Error('Unsupported manifest schema');
  let descriptors;
  if (INDEX_TYPES.has(manifest.mediaType)) {
    if (!Array.isArray(manifest.manifests) || !manifest.manifests.length) throw new Error('Invalid manifest index');
    descriptors = manifest.manifests;
  } else if (IMAGE_TYPES.has(manifest.mediaType)) {
    if (!manifest.config || !Array.isArray(manifest.layers)) throw new Error('Invalid image manifest');
    descriptors = [];
    // Blobs are not package manifests, but validate their descriptors before accepting this image.
    for (const blob of [manifest.config, ...manifest.layers]) {
      if (!DIGEST.test(blob?.digest)) throw new Error('Invalid blob descriptor');
    }
  } else {
    throw new Error('Unsupported manifest media type');
  }
  if (manifest.subject) descriptors = [...descriptors, manifest.subject];
  return descriptors.map(d => {
    if (!DIGEST.test(d?.digest)) throw new Error('Invalid manifest descriptor');
    return d.digest;
  });
}

function snapshot(versions) {
  return JSON.stringify(versions.map(v => ({ id: v.id, name: v.name, created: v.created_at,
    updated: v.updated_at, tags: [...v.metadata.container.tags].sort() })).sort((a, b) => a.id - b.id));
}

export async function retainContainers({ repository, token, actor, apply = false, fetchImpl = fetch,
  now = new Date(), log = console.log }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !token || !actor) {
    throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN and GITHUB_ACTOR are required');
  }
  const [owner, name] = repository.split('/');
  const api = 'https://api.github.com';
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28' };
  async function request(url, options = {}) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Request failed (${response.status}): ${new URL(url).pathname}`);
    return response;
  }
  const repo = await (await request(`${api}/repos/${repository}`, { headers })).json();
  if (repo.full_name?.toLowerCase() !== repository.toLowerCase() || repo.owner?.login?.toLowerCase() !== owner.toLowerCase() ||
      !['User', 'Organization'].includes(repo.owner?.type)) throw new Error('Repository identity mismatch');
  const base = `${api}/${repo.owner.type === 'Organization' ? 'orgs' : 'users'}/${owner}/packages/container/${encodeURIComponent(name.toLowerCase())}`;
  const pkg = await (await request(base, { headers })).json();
  if (pkg.package_type !== 'container' || pkg.name?.toLowerCase() !== name.toLowerCase() ||
      pkg.repository?.full_name?.toLowerCase() !== repository.toLowerCase()) throw new Error('Package identity mismatch');

  async function inventory() {
    const packageInfo = await (await request(base, { headers })).json();
    if (!Number.isSafeInteger(packageInfo.version_count) || packageInfo.version_count < 1) {
      throw new Error('Missing or invalid package version count');
    }
    const versions = [];
    // Request a terminal empty page rather than relying on a possibly truncated Link header.
    for (let page = 1; page <= 1000; page++) {
      const response = await request(`${base}/versions?state=active&per_page=100&page=${page}`, { headers });
      const batch = await response.json();
      if (!Array.isArray(batch) || batch.length > 100) throw new Error('Invalid inventory page');
      const link = response.headers.get('link');
      if (link && !/^<https:\/\/api\.github\.com\//.test(link)) throw new Error('Invalid pagination');
      if (!batch.length) {
        if (link?.includes('rel="next"') || versions.length !== packageInfo.version_count) {
          throw new Error('Incomplete inventory or package count changed');
        }
        return validateVersions(versions);
      }
      versions.push(...batch);
    }
    throw new Error('Inventory pagination limit exceeded');
  }

  const versions = await inventory();
  const image = repository.toLowerCase();
  const credentials = Buffer.from(`${actor}:${token}`).toString('base64');
  const auth = await (await request(`https://ghcr.io/token?service=ghcr.io&scope=repository:${image}:pull`,
    { headers: { Authorization: `Basic ${credentials}` } })).json();
  if (typeof auth.token !== 'string' || !auth.token) throw new Error('Missing registry token');
  const visited = new Set();
  const referenced = new Set();
  async function inspect(digest) {
    if (visited.has(digest)) return;
    visited.add(digest);
    if (visited.size > 20_000) throw new Error('Manifest traversal limit exceeded');
    const response = await request(`https://ghcr.io/v2/${image}/manifests/${digest}`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: ACCEPT } });
    const bytes = new Uint8Array(await response.arrayBuffer());
    for (const child of manifestReferences(bytes, digest)) {
      referenced.add(child);
      await inspect(child);
    }
  }
  // Untagged indexes are retained too, so their children must also be protected.
  for (const v of versions) await inspect(v.name);
  const candidates = planRetention(versions, referenced, now);
  log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', keepDays: 30, versions: versions.length,
    candidates: candidates.map(v => ({ id: v.id, digest: v.name, tags: v.metadata.container.tags })) }));
  const original = snapshot(versions);
  let remaining = versions;
  for (const candidate of candidates) {
    // DELETE has no conditional-tag API: detect concurrent writers and serialize the publishing workflow.
    const live = await inventory();
    if (snapshot(live) !== snapshot(remaining)) throw new Error('Inventory changed; refusing deletion');
    if (apply) {
      const response = await request(`${base}/versions/${candidate.id}`, { method: 'DELETE', headers });
      if (response.status !== 204) throw new Error('Unexpected deletion response');
      remaining = remaining.filter(v => v.id !== candidate.id);
      log(`Deleted package version ${candidate.id}`);
    }
  }
  if (!candidates.length && snapshot(await inventory()) !== original) throw new Error('Inventory changed during preflight');
  return candidates.map(v => v.id);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply', '--dry-run'].includes(arg)) || args.length > 1) {
    console.error('Usage: node scripts/container-retention.mjs [--dry-run|--apply]');
    process.exitCode = 1;
  } else {
    retainContainers({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN,
      actor: process.env.GITHUB_ACTOR, apply: args.includes('--apply') }).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
