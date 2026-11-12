# Deployment and CI/CD

[← README](../README.md)

See also [container publishing and retention](self-hosting.md#containers), [data safety and the durable archive](how-it-works.md#guardrails), and [enrichment authentication](how-it-works.md#enrichment-authentication).

- [🚢 CI/CD](#ci-cd)

<a id="ci-cd"></a>

## 🚢 CI/CD

| Workflow | Triggers | What it does |
| --- | --- | --- |
| 🧪 [`ci.yml`](../.github/workflows/ci.yml) | push · pull request · manual | `npm ci` → unit tests → typecheck → lint *(if configured)* → **index from fixtures** (no dependency on live sources) → Vite build → uploads a preview artifact |
| 🚀 [`deploy.yml`](../.github/workflows/deploy.yml) | relevant input pushes to `main`/`master` (not docs-only) · **daily 04:17 UTC** · manual | tests → `configure-pages` → restore caches → fetch the **last published index** and the **`data`-branch archive** (baseline; the newer wins) → **live** `build:index` → apply cached Copilot enrichment *(new calls only on schedule / manual runs)* → `check-index` → `vite build` with the right `base` → `check-index --dist` → **commit the index to the `data` branch** → `upload-pages-artifact` → `deploy-pages`. A parallel `container` job then builds, smoke-tests and pushes the **GHCR image** from the same verified site, then applies conservative **30-day container retention** |

- 🔐 Permissions: `pages: write`, `id-token: write`, `contents: read`, plus `copilot-requests: write` for the optional `GITHUB_TOKEN` Copilot auth. The `container` job only has `contents: read` and `packages: write`.
- 🚦 `concurrency: pages` (never cancels an in-flight deployment).
- 🗺️ **Vite `base`** comes from `actions/configure-pages` (`/<repo>/` for project sites, `/` for user sites or custom domains) via `VITE_BASE`. Locally it falls back to `./`, which works from any path.
- ❌ If a source is down the build falls back to the last published data for it; if there is nothing to fall back on, or the result fails the sanity checks, the run fails and **the previously deployed site stays online** (see [Guardrails](how-it-works.md#guardrails)).
- 🔄 Dependabot (`.github/dependabot.yml`) proposes monthly updates for actions and npm packages.
- 🎛️ *Run workflow* lets you set `max_items` (`0` = skip Copilot) and `force_enrich`.

### 🛠️ One-time setup

1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`** 👈 required – without it `deploy-pages` fails.
2. *(Optional)* enable Copilot enrichment: add the `COPILOT_GITHUB_TOKEN` secret **or** the `COPILOT_USE_GITHUB_TOKEN=true` variable (see [enrichment authentication](how-it-works.md#enrichment-authentication)).
3. Push to `main`/`master` or run **Deploy** manually. Without a custom domain the site appears at `https://<owner>.github.io/azure-local-knowledge/`.
4. **Custom domain** (the demo uses `knowledge.azl.graa.dev`):
   - At your DNS provider add a `CNAME` record: `knowledge.azl.graa.dev` → `<owner>.github.io`.
   - **Settings → Pages → Custom domain** → `knowledge.azl.graa.dev` → Save, then tick **Enforce HTTPS** once the certificate is issued.
   - Nothing else to change: `actions/configure-pages` reports an empty base path for custom domains, so the build uses `/` automatically. (No `CNAME` file is needed with the Actions deployment source.)

> ℹ️ Scheduled workflows only run on the default branch, and GitHub pauses them after 60 days without repository activity – re-enable from the *Actions* tab if needed.
