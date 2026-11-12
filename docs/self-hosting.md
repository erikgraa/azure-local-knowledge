# Self-hosting and container maintenance

[← README](../README.md)

- [🐳 Run it as a container](#containers)

<a id="containers"></a>

## 🐳 Run it as a container

Every Deploy run (daily after the index is rebuilt, on pushes to `main` and manually) also publishes a **self-contained image** to GitHub Container Registry: the verified site with that day's `index.json` baked in, served by unprivileged nginx. No Node, no outbound network access and no secrets are needed at runtime, so it suits air-gapped or internal use.

```bash
docker run --rm -p 8080:8080 ghcr.io/erikgraa/azure-local-knowledge:latest
# http://localhost:8080
```

**Podman** works the same way (rootless is fine: the image runs as an unprivileged user and listens on 8080; nothing is mounted, so no SELinux flags are needed):

```bash
podman run --rm -p 8080:8080 ghcr.io/erikgraa/azure-local-knowledge:latest
```

On Windows and macOS start the VM once with `podman machine init && podman machine start`; the port is forwarded to `localhost` automatically. To keep it running on a Linux host and pick up each nightly image, use a [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit, `~/.config/containers/systemd/azure-local-compendium.container`:

```ini
[Unit]
Description=Azure Local Compendium

[Container]
Image=ghcr.io/erikgraa/azure-local-knowledge:latest
PublishPort=8080:8080
AutoUpdate=registry

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload && systemctl --user start azure-local-compendium
systemctl --user enable --now podman-auto-update.timer   # re-pulls :latest daily and restarts on a new image
```

| Tag | Meaning |
| --- | --- |
| `latest` | the most recent build |
| `YYYY-MM-DD` | the date the index was generated (pin a snapshot) |
| `sha-<commit>` | the exact source commit |

Multi-arch (`linux/amd64`, `linux/arm64`). The image also serves `/data/index.json`, `/Search-AzLocalKnowledge.ps1` and `/healthz`, so the cmdlet works against it offline:

```powershell
$env:AZLOCAL_KNOWLEDGE_INDEX = 'http://localhost:8080/data/index.json'
iex (irm http://localhost:8080/Search-AzLocalKnowledge.ps1)
Search-AzLocalKnowledge 'SecretNotFoundException'
```

Notes:
- **Pull from your own fork:** replace the image name with `ghcr.io/<owner>/<repo>`.
- **First publish:** GHCR packages start **private**. Make the package public under *Packages → azure-local-knowledge → Package settings → Change visibility* if you want anonymous pulls.
- **Freshness:** the data is a snapshot from build time. Pull `latest` again (or pin a dated tag) to update. Relevant code, data, dependency, Docker and deploy-workflow fixes merged to `main`/`master` rebuild the image; documentation-only pushes do not. The daily 04:17 UTC refresh and manual runs are unchanged.
- **Retention:** after each successful container publish, CI deletes versions only when every tag is a recognized `YYYY-MM-DD` or `sha-<7–40 hex>` tag and the version's creation, update and dated tags are all older than 30 days. Versions carrying `latest`, `nightly`, any release or unknown tag are preserved, as are recent versions, all untagged versions and recursively referenced multi-architecture manifests. This is conservative retention, not orphan garbage collection.
- **Cleanup safety:** the job uses `packages: write`; this repository must have **Admin** access under the GHCR package's *Manage Actions access*. Missing permissions, incomplete/invalid inventory, unreadable/unsupported manifests, digest mismatches or concurrent inventory changes fail cleanup before the affected deletion; Pages remains independent. Publishing and cleanup share the existing serialized `pages` workflow. External package writers must also serialize: GitHub's DELETE API has no atomic tag guard. GitHub may refuse deletion of popular public versions; errors fail the job rather than widening the policy.
- **Preview cleanup:** `node scripts/container-retention.mjs --dry-run` (also the default without arguments) reads the full package and registry metadata but makes no DELETE requests. Set `GITHUB_REPOSITORY`, `GITHUB_ACTOR` and `GITHUB_TOKEN` using a token with package read access; never expose the token in logs. Offline safety fixtures run with `node --test test/container-retention.test.mjs`.
- **Safety net:** the image is built from the same checked index as Pages and smoke-tested (`docker/smoke.sh`) before it is pushed. A container failure never blocks the Pages deploy.
- **Build locally:** `npm run build:index && npx vite build --base=/ --outDir dist-container && docker build -t azl .` (use `podman build` the same way; `CONTAINER_ENGINE=podman bash docker/smoke.sh azl` runs the smoke test with Podman).
