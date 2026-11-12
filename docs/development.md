# Local development and configuration

[← README](../README.md)

For a ready-to-run site without Node, see [self-hosting](self-hosting.md). For Actions credentials and hosting setup, see [deployment](deployment.md) and [Copilot enrichment](how-it-works.md#copilot-enrichment).

- [🚀 Run it locally](#local-development)

<a id="local-development"></a>

## 🚀 Run it locally

Requires **Node ≥ 22.18**.

```bash
git clone https://github.com/erikgraa/azure-local-knowledge.git
cd azure-local-knowledge
npm install

npm run build:index                 # 🌐 fetch the live sources -> public/data/index.json
npm run dev                         # ⚡ http://localhost:5173
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build:index -- --fixtures` | 📦 Build the index from the checked-in fixtures (offline, deterministic – what CI uses) |
| `npm run enrich` | 🤖 Copilot enrichment (`COPILOT_GITHUB_TOKEN` or a logged-in `copilot` CLI) |
| `npm run enrich -- --dry-run` | 👀 Show what would be processed |
| `npm run enrich -- --max-items 20 --force` | 🎚️ Cap work / ignore the cache |
| `npm test` | 🧪 Unit tests (parsers, search ranking, enrichment merge + cache + fallback) |
| `npm run typecheck` | 🔎 `tsc --noEmit` |
| `npm run build` / `npm run preview` | 🏗️ Production build to `dist/` / serve it |
| `npm run fixtures:update` | 🔄 Refresh `test/fixtures` from the live sources |

Set `GITHUB_TOKEN` (or log in with `gh auth login`) to raise API limits and get per-file *last updated* dates.

### ⚙️ Configuration

| Variable | Default | Used by |
| --- | --- | --- |
| `GITHUB_TOKEN` / `GH_TOKEN` | `gh auth token` | `build:index` – rate limits & last-updated dates (optional) |
| `INDEX_SOURCE=fixtures` | live | `build:index` – same as `--fixtures` |
| `COPILOT_GITHUB_TOKEN` | – | `enrich` – Copilot CLI auth (PAT) |
| `COPILOT_USE_GITHUB_TOKEN` | – | `true` in Actions = authenticate with the workflow `GITHUB_TOKEN` |
| `ENRICH_PROVIDER` | `copilot-cli` | `copilot-cli` · `github-models` · `mock` (tests) |
| `ENRICH_MODEL` | CLI default | model name |
| `ENRICH_MAX_ITEMS` | `60` | items per run (`0` disables) |
| `ENRICH_BATCH_SIZE` / `ENRICH_CONCURRENCY` | `4` / `2` | prompt batching |
| `COPILOT_BIN` | `copilot` | path to the CLI |
| `VITE_BASE` | `./` | public base path (set by the deploy workflow) |
| `AZL_MIN_*`, `AZL_MIN_RATIO`, `AZL_MAX_STALE_DAYS`, `AZL_BASELINE_FILE` | [Guardrails](how-it-works.md#guardrails) | `build:index` / `check-index` guardrails |
