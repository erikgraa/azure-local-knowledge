#!/usr/bin/env bash
# Smoke-test a built image: usage  [CONTAINER_ENGINE=podman] docker/smoke.sh <image> [container-name]
set -euo pipefail

image="${1:?usage: smoke.sh <image> [container-name]}"
name="${2:-azl-smoke}"
port="${PORT:-8080}"
engine="${CONTAINER_ENGINE:-docker}"

$engine rm -f "$name" >/dev/null 2>&1 || true
$engine run -d --name "$name" -p "$port:8080" "$image" >/dev/null
trap '$engine rm -f "$name" >/dev/null 2>&1 || true' EXIT

base="http://127.0.0.1:$port"
ready=0
for _ in $(seq 1 30); do
  if curl -fsS "$base/healthz" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "container did not become healthy"; $engine logs "$name" || true; exit 1; }

curl -fsS "$base/" | grep -qi '<div id="app"' || { echo "index.html is not the app shell"; exit 1; }

curl -fsS "$base/data/index.json" -o /tmp/azl-index.json
node -e "const i=JSON.parse(require('fs').readFileSync('/tmp/azl-index.json','utf8')); if(!Array.isArray(i.items)||!i.items.length) process.exit(1); console.log('index.json:', i.items.length, 'items, generated', i.generatedAt)"

curl -fsS "$base/Search-AzLocalKnowledge.ps1" | grep -q 'function Search-AzLocalKnowledge'

if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command "
    \$ErrorActionPreference = 'Stop'
    iex (Invoke-RestMethod '$base/Search-AzLocalKnowledge.ps1')
    \$r = @(Search-AzLocalKnowledge -First 1 -IndexUrl '$base/data/index.json')
    if (\$r.Count -ne 1) { throw 'cmdlet returned no results from the container' }
    'cmdlet ok: ' + \$r[0].Title"
fi

echo "smoke test passed for $image"
