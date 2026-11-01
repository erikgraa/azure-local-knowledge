<div align="center">

<img src="docs/banner.png" alt="Azure Local Compendium – Paste an error. Pick your release. Find the fix." width="100%">

# 📚 Azure Local Compendium

**One searchable place for troubleshooting [Azure Local](https://learn.microsoft.com/azure/azure-local/).**
Supportability TSGs 🛠️ + release known issues 📋 + release information 🏷️ — merged, normalized, and searchable in your browser.

### 🌐 Live demo: **[knowledge.azl.graa.dev](https://knowledge.azl.graa.dev)**

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![Deploy](../../actions/workflows/deploy.yml/badge.svg)](../../actions/workflows/deploy.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A522.18-3c873a?logo=node.js&logoColor=white)
![Static site](https://img.shields.io/badge/hosting-GitHub%20Pages-2f6bff?logo=github)
![Enriched with Copilot](https://img.shields.io/badge/enriched%20by-GitHub%20Copilot-8957e5?logo=githubcopilot&logoColor=white)

</div>

> ⚠️ **Unofficial community tool.** Not affiliated with or endorsed by Microsoft. Always confirm fixes in the linked source (GitHub TSG / Microsoft Learn) before acting on a production cluster.

---

## 🧭 Why?

Troubleshooting Azure Local means hopping between two places:

| 📚 Source | What you find there |
| --- | --- |
| 🛠️ [**Azure/AzureLocal-Supportability**](https://github.com/Azure/AzureLocal-Supportability) | Hundreds of troubleshooting guides (TSGs) – symptoms, error text, mitigations |
| 📋 [**Azure Local release notes**](https://learn.microsoft.com/azure/azure-local/known-issues) | Fixed / known issues and the OS/solution builds for every release (2411 → 2610…) |

**Azure Local Compendium** crawls both, normalizes them into one JSON index, and ships a fast static UI: paste the error you're staring at, pick your release, get the matching guide and the known issue that explains it.

## ✨ Features

| | |
| --- | --- |
| 🔎 **Paste-an-error search** | Fuzzy, typo-tolerant full-text search (MiniSearch) that understands `SecretNotFoundException`, `0x800706BA`, `exitcode: 42`, and whole pasted log lines (GUIDs, IPs and timestamps are stripped before matching). |
| 🧭 **Release picker** | Choose your release under the search box and see only what applies to it (a grouped overview when nothing is typed, one ranked list when searching): issues *listed for it*, guides *written for it*, guides that *don't state a release*, and issues *fixed in the next two releases* (so upgrading is the fix). Matches that are documented only for other releases are hidden, with a one-click “Show them” so a search is never a dead end. |
| 🎛️ **Filters** | Release/version · area · type (TSG / known issue / release) · known-issue status (open / fixed / expected). |
| 🧾 **Result cards + detail drawer** | Symptoms, error text (copy button), mitigation snippet, affected releases, related items, and deep links to the **GitHub TSG** or the **Learn known-issue section**. |
| 🔗 **Shareable URLs** | Every search, filter, release and open item lives in the query string. |
| 🌗 **Dark / light** | Follows your OS, remembers your choice, force it with `?theme=dark`. |
| 🤖 **Copilot enrichment** | A daily GitHub Copilot pass fills in what parsers can't: version ranges, error aliases, one-line summaries, cross-links and inconsistency flags — cached, schema-validated, and always falling back to parser data. |
| ⚡ **100 % static** | No backend. Build step → `index.json` → browser search. Hosted on GitHub Pages. |

## 📸 Screenshots

<table>
  <tr>
    <td width="50%"><b>🔎 Search (light)</b><br><img src="docs/screenshot-search-light.png" alt="Search results for 'Arc registration error 42'"></td>
    <td width="50%"><b>🌙 Search (dark)</b><br><img src="docs/screenshot-search-dark.png" alt="Dark mode search for SecretNotFoundException"></td>
  </tr>
  <tr>
    <td><b>🧭 Release overview</b><br><img src="docs/screenshot-version.png" alt="Release 2606 grouped view"></td>
    <td><b>🧾 Detail drawer</b><br><img src="docs/screenshot-details.png" alt="Detail drawer for Missing SPN during deployment"></td>
  </tr>
</table>

## 🏗️ How it works

```mermaid
flowchart LR
  A["🛠️ Supportability repo<br/>TSG/**/*.md"] --> P
  B["📋 Learn markdown<br/>known-issues*.md<br/>release-information.md"] --> P
  P["⚙️ build-index.mjs<br/>deterministic parsers"] --> J[("📦 public/data/index.json")]
  J --> E["🤖 enrich.mjs<br/>GitHub Copilot CLI"]
  C[("🗃️ cache by<br/>content hash")] <--> E
  E -->|"✅ schema-valid results<br/>(else: keep parser data)"| J2[("📦 enriched index.json")]
  J2 --> V["⚡ Vite + TypeScript UI<br/>MiniSearch in the browser"]
  V --> G["🌐 GitHub Pages"]
```

1. **Fetch** – the Git trees API lists `TSG/**/*.md`; markdown is pulled from `raw.githubusercontent.com`. Learn pages are *not* scraped: the build reads the source markdown from [`MicrosoftDocs/azure-stack-docs`](https://github.com/MicrosoftDocs/azure-stack-docs/tree/main/azure-local).
2. **Parse** – defensive, regex/heuristic parsers (details below) turn each document into normalized records. Unknown fields stay `null`/`[]`, never guessed.
3. **Enrich (optional)** – Copilot reviews new/changed items only and refines the fields parsers can't reliably get.
4. **Search** – the browser downloads one `index.json` and builds a MiniSearch index in a few milliseconds.

## 🧩 The index

`public/data/index.json` (git-ignored, generated) is validated against [`schema/index.schema.json`](schema/index.schema.json).

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-31T23:54:37Z",
  "sources": [ /* repo + Learn pages, counts */ ],
  "releases": [ { "id": "2610", "supported": true, "osVersions": ["24H2"], "solutionVersions": [...] } ],
  "items": [ /* records */ ]
}
```

| Field | Meaning |
| --- | --- |
| `id`, `type` | Stable id · `tsg` \| `known-issue` \| `release` |
| `title`, `area`, `subarea` | Clean title (e.g. `Missing SPN during deployment`) and a canonical area (*Deployment*, *Update & SBE*, *Networking*…) |
| `status` | Known issues: `open` \| `fixed` \| `expected` |
| `releases[]` | Affected release trains (`2411.3`, `2504`…) – from Learn tables, TSG titles, or Copilot |
| `osVersions[]`, `solutionVersions[]`, `versionText` | `23H2`/`24H2`, e.g. `10.2411.3.2`, raw title metadata |
| `introducedIn`, `fixedIn` | First release listing the issue · release whose “Fixed issues” table lists it |
| `symptoms`, `symptomSummary` | Parsed text · one-line Copilot summary |
| `errorStrings[]` | Error text from code fences / “Error” sections / inline code |
| `errorCodes[]` | Exception names, `0x` codes, exit codes, validator names |
| `aliases[]` | 🤖 Normalized error strings and search phrases |
| `mitigation`, `mitigationSummary` | Parsed text · short summary |
| `url`, `urls[]` | Deep link to the TSG on GitHub / the Learn section |
| `lastUpdated`, `sourceHash` | Last commit date (TSGs) or `ms.date` · SHA-256 of the source (cache key) |
| `related[]`, `flags[]` | Cross-links (parser + Copilot) · inconsistencies |
| `enrichment` | Provenance of Copilot-derived fields (`null` if none) |

## 🔬 How parsing works

### 🛠️ TSG markdown (`scripts/lib/tsg.mjs`)

- **Title** – first non-boilerplate H1 (skips *Table of contents* / *Revision History*); otherwise the label from the folder `README.md` index, otherwise the file name. Titles like `TSG | 23H2 | 10.2411.3.2 | Missing SPN` are split into clean title + version metadata.
- **Versions** – release trains (`2411.3`), solution versions (`10.2411.3.2`) and `23H2/24H2` from the title/file name (supports `2411-1`, ranges, “and later”). Resolved against the real release list from Learn.
- **Symptoms / mitigation** – sections named *Symptoms, Issue, Problem…* and *Mitigation, Resolution, Workaround…*.
- **Error text** – fenced blocks that aren't commands, prose under *Error*/*Exception*/*Message* headings, and inline code in the symptoms. Exception names, hex/exit codes and `tsg-metadata` validator names become `errorCodes`.
- **Area** – the `TSG/<Area>/` folder, mapped to a canonical area shared with Learn's *Feature* column.
- **Excluded** – READMEs, images, contribution templates.

### 📋 Learn markdown (`scripts/lib/learn.mjs`)

- Walks `known-issues.md`, `previous-releases/known-issues-2x.md` (discovered via the contents API) tracking `::: moniker` ranges and `## Known issues for version …` headings.
- Reads every *Fixed issues*, *Known issues*, *Known issues from previous releases* and *Known and expected behaviors* table (columns detected by header).
- **De-duplicates** the same carried-over row across dozens of releases by Microsoft bug id (`<!--33008717-->`) or a text hash → one record with every affected release, `introducedIn` and `fixedIn`.
- Flags oddities, e.g. an issue still listed after the release that fixed it.
- **Release info** – `release-information-23h2.md` tables → trains, solution versions, OS builds, availability dates, supported window.
- **Deep links** – `…/known-issues?view=azloc-2610#known-issues-for-version-2610`, with Learn's heading-anchor rules (dots removed).
- Cross-links known issues ⇄ TSGs when a Learn row cites a TSG URL.

## 🤖 Copilot enrichment

The daily workflow runs `npm run enrich` after `build:index`. It **never** replaces parsed text — it adds:

| ✅ Fills / corrects | How |
| --- | --- |
| 📅 Affected version ranges | Expanded onto real release trains; fills gaps, extends only with *high* confidence, otherwise **flags** a mismatch |
| 🧷 Error aliases & normalized errors | GUIDs/hosts/paths replaced by placeholders so pasted errors match |
| 📝 One-line symptom + mitigation summaries | Max 200 / 340 characters |
| 🔗 Cross-links | Only ids from a lexically-nearest candidate list; made symmetric |
| 🚩 Inconsistency flags | `version-mismatch`, `inconsistent`, `duplicate`, `stale`, `broken-link`, `unclear` |

**Guard rails**

- 🗃️ **Cached by content hash** (`.cache/enrichment-cache.json`, keyed by `sourceHash` + prompt version) → only new/changed items are re-processed. In CI the cache is persisted with `actions/cache`.
- 🧪 **Schema-validated** against [`schema/enrichment.schema.json`](schema/enrichment.schema.json); over-long strings are clamped, bad structure is rejected, unknown ids are dropped.
- 🛟 **Always falls back** to deterministic data: no secret, CLI error, invalid JSON, schema failure or timeout never fails the deploy (use `--strict` to make it fail).
- 🔒 **Sandboxed**: the Copilot CLI runs with `--deny-tool=shell --deny-tool=write`, in an empty temp dir, source text is marked *untrusted* in the prompt. It's pure text-in/text-out.
- 📊 **Budgeted**: `ENRICH_MAX_ITEMS` per run (default 60, TSGs and open issues first), so the backlog is processed over a few days. Each item is enriched **once** (cached by content hash), so cost is bounded by the backlog plus whatever changes upstream.
- 💸 **Pushes never spend Copilot calls**: deploys triggered by a push to `main` only re-publish using the cached enrichment. New enrichment runs on the **daily schedule** and via **Run workflow** (`max_items`, e.g. `300` to clear a backlog in one go). Bumping `PROMPT_VERSION` re-enriches everything on purpose.
- 📋 The run's **step summary** lists everything the model flagged.

### 🔑 Required secret & permissions

Pick **one** way to authenticate the Copilot CLI in Actions:

| Option | Setup | Best for |
| --- | --- | --- |
| 🅰️ **PAT secret** *(works everywhere)* | Create a **fine-grained personal access token** with the **“Copilot Requests”** permission from an account with an active **GitHub Copilot** seat, then add it as repository secret **`COPILOT_GITHUB_TOKEN`** (*Settings → Secrets and variables → Actions → Secrets*). Classic PATs (`ghp_…`) are not supported. | Personal repos, forks, anywhere |
| 🅱️ **Built-in `GITHUB_TOKEN`** *(no secret)* | Add repository **variable `COPILOT_USE_GITHUB_TOKEN` = `true`** (*… → Variables*). The workflow already requests `copilot-requests: write`. The organization must allow **“Copilot CLI billed to the organization”** (on by default when Copilot CLI is enabled). | Organization-owned repos |

If neither is configured the enrichment step is **skipped** (with a notice) and parser-only data is published.

| Also | Where | Notes |
| --- | --- | --- |
| `ENRICH_MODEL` *(optional)* | Actions **Variables** | Model name passed to `copilot --model`; defaults to the CLI's default. |
| Workflow permissions | `deploy.yml` | `contents: read`, `pages: write`, `id-token: write`, `copilot-requests: write` – nothing else. |
| Triggers | `deploy.yml` | Only `push`, `schedule`, `workflow_dispatch` – never fork pull requests – so untrusted code can't reach the Copilot credentials. |

> 💡 `ENRICH_PROVIDER=github-models` is also supported by the script (GitHub Models with `GITHUB_TOKEN` + `models: read`) – not wired into the workflow by default.

## 🛡️ Guardrails: never ship an empty site

The deploy runs against live sources every day, so it is built to survive them being down, rate-limited or reorganised.

| Situation | What happens |
| --- | --- |
| GitHub (TSGs) or Learn is **unreachable** / returns an error | That source's records are carried over from the **last published index** (fetched from the live site at the start of the run). Everything else still refreshes. |
| A source "works" but comes back **suspiciously small** (e.g. the layout changed and almost nothing parses) | Judged against the last published index (default: must keep ≥ 70 % of the guides and known issues, ≥ 80 % of the releases). Below that it is treated as broken and replaced by the last good copy. |
| **No previous index** exists (first deploy) and a source is unusable | The build **fails** with a clear error, so nothing is published. Absolute floors apply: 50 guides, 100 known issues, 15 releases. |
| Data stays stale for **14+ days** | The run fails loudly so someone looks (a failed deploy never replaces the live site). |
| Anything else goes wrong later (enrichment, build) | `check-index` verifies the index schema and minimum sizes before **and** after the Vite build; failure aborts the deploy and the old site stays up. |

When a source is served from cache, the index carries a `degraded` entry (source, since when, why). The site then shows a **“could not be refreshed”** banner, the run emits a warning annotation, and the job summary lists what happened.

Tuning (environment variables): `AZL_MIN_TSG`, `AZL_MIN_KNOWN_ISSUES`, `AZL_MIN_RELEASES`, `AZL_MIN_RATIO` (default `0.7`), `AZL_MAX_STALE_DAYS` (default `14`), `AZL_BASELINE_FILE` (default `.cache/last-good-index.json`). Fixture builds (`--fixtures`) skip these checks.

## 🗄️ Nothing is ever removed

The official sources change: guides get renamed or deleted, Learn pages are reorganised, old releases drop out of the tables. This project is an **archive**, not a mirror.

- 🏷️ **Removed upstream ≠ removed here.** An item that was in the previous index but is missing from a fresh build is **kept**, marked `lifecycle.state = "removed"` with `firstSeen`, `lastSeen` and `removedAt`. In the UI it shows a dashed *Removed from source* badge, a note with the dates, and (for guides) a **file history** link that still works after deletion. Removed items stay searchable but rank below live ones.
- ♻️ **Reappearing is handled.** If an item comes back it simply turns active again and keeps its original `firstSeen`.
- 🚂 **Release trains too.** A train that disappears from the release tables stays in the release list, flagged as removed.
- 🧱 **A durable archive on a `data` branch.** After every verified build the workflow commits the final `index.json` to the `data` branch (only when the content changed, so history stays small). It survives cache eviction and an unreachable website, keeps the complete history of every daily change, and is the baseline the next build merges against. Pushing to `data` never triggers a deploy, and CI ignores it. The step is `continue-on-error`, so a failed archive push never blocks a deploy.
- 🔢 **Guardrails stay honest.** The shrink checks compare *live* items only, so archived items can't hide a broken source (and a source dropping 40 % of its pages can't silently delete anything).

Good to know: items are matched by id (a guide's path; a known issue's Microsoft bug id, or a hash of its text when it has none). A guide that is **renamed** therefore appears as a new item with the old one archived, and a known issue **without a bug id whose text is edited** can leave its previous wording archived next to the new one.

Restore or inspect the archive any time: `git fetch origin data && git show origin/data:index.json`.

## 🚀 Run it locally

Requires **Node ≥ 22.18**.

```bash
git clone https://github.com/<owner>/azure-local-knowledge.git
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
| `AZL_MIN_*`, `AZL_MIN_RATIO`, `AZL_MAX_STALE_DAYS`, `AZL_BASELINE_FILE` | see above | `build:index` / `check-index` guardrails |

## 🔗 URL parameters

| Param | Example | Meaning |
| --- | --- | --- |
| `q` | `?q=SecretNotFoundException` | Search text |
| `v` | `v=2606` | Release train: only items that apply to it are listed |
| `others` | `others=1` | With `v`: also list matches documented only for other releases |
| `type` | `type=tsg~known-issue` | `tsg`, `known-issue`, `release` (`~`-separated) |
| `status` | `status=open` | `open`, `fixed`, `expected` |
| `area` | `area=Networking` | Area names (`~`-separated) |
| `sort` | `sort=updated` | `relevance` (default) or `updated` |
| `id` | `id=tsg-deployment-…` | Open an item's drawer |
| `theme` | `theme=dark` | Force light/dark |

⌨️ **Keyboard:** <kbd>/</kbd> focus search · <kbd>↓</kbd> from the search box (or <kbd>↓</kbd>/<kbd>↑</kbd>/<kbd>j</kbd>/<kbd>k</kbd> on a result) to browse results · <kbd>Enter</kbd> open details · <kbd>Esc</kbd> close. Focus stays inside the details drawer while it is open.

## 🚢 CI/CD

| Workflow | Triggers | What it does |
| --- | --- | --- |
| 🧪 [`ci.yml`](.github/workflows/ci.yml) | push · pull request · manual | `npm ci` → unit tests → typecheck → lint *(if configured)* → **index from fixtures** (no dependency on live sources) → Vite build → uploads a preview artifact |
| 🚀 [`deploy.yml`](.github/workflows/deploy.yml) | push to `main`/`master` · **daily 04:17 UTC** · manual | tests → `configure-pages` → restore caches → fetch the **last published index** and the **`data`-branch archive** (baseline; the newer wins) → **live** `build:index` → apply cached Copilot enrichment *(new calls only on schedule / manual runs)* → `check-index` → `vite build` with the right `base` → `check-index --dist` → **commit the index to the `data` branch** → `upload-pages-artifact` → `deploy-pages` |

- 🔐 Permissions: `pages: write`, `id-token: write`, `contents: read`, plus `copilot-requests: write` for the optional `GITHUB_TOKEN` Copilot auth.
- 🚦 `concurrency: pages` (never cancels an in-flight deployment).
- 🗺️ **Vite `base`** comes from `actions/configure-pages` (`/<repo>/` for project sites, `/` for user sites or custom domains) via `VITE_BASE`. Locally it falls back to `./`, which works from any path.
- ❌ If a source is down the build falls back to the last published data for it; if there is nothing to fall back on, or the result fails the sanity checks, the run fails and **the previously deployed site stays online** (see [Guardrails](#️-guardrails-never-ship-an-empty-site)).
- 🔄 Dependabot (`.github/dependabot.yml`) proposes monthly updates for actions and npm packages.
- 🎛️ *Run workflow* lets you set `max_items` (`0` = skip Copilot) and `force_enrich`.

### 🛠️ One-time setup

1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`** 👈 required – without it `deploy-pages` fails.
2. *(Optional)* enable Copilot enrichment: add the `COPILOT_GITHUB_TOKEN` secret **or** the `COPILOT_USE_GITHUB_TOKEN=true` variable (see above).
3. Push to `main`/`master` or run **Deploy** manually. Without a custom domain the site appears at `https://<owner>.github.io/azure-local-knowledge/`.
4. **Custom domain** (the demo uses `knowledge.azl.graa.dev`):
   - At your DNS provider add a `CNAME` record: `knowledge.azl.graa.dev` → `<owner>.github.io`.
   - **Settings → Pages → Custom domain** → `knowledge.azl.graa.dev` → Save, then tick **Enforce HTTPS** once the certificate is issued.
   - Nothing else to change: `actions/configure-pages` reports an empty base path for custom domains, so the build uses `/` automatically. (No `CNAME` file is needed with the Actions deployment source.)

> ℹ️ Scheduled workflows only run on the default branch, and GitHub pauses them after 60 days without repository activity – re-enable from the *Actions* tab if needed.

## 🗂️ Project layout

```text
├─ 📄 index.html · vite.config.ts · tsconfig.json
├─ 🎨 public/              favicon.svg, PNG icons, manifest, data/index.json (generated)
├─ 🖥️ src/                 UI (vanilla TypeScript): search, state, render, styles
├─ ⚙️ scripts/
│   ├─ build-index.mjs     live / fixture index builder (CLI)
│   ├─ check-index.mjs     pre-publish sanity gate (CLI)
│   ├─ archive.mjs         durable `data`-branch archive: load baseline / publish (CLI)
│   ├─ enrich.mjs          Copilot enrichment (CLI)
│   ├─ make-fixtures.mjs   refresh test fixtures
│   └─ lib/                tsg · learn · markdown · versions · records · guard · enrich · providers · sources · schema
├─ 📐 schema/              index + enrichment JSON Schemas
├─ 🧪 test/                node:test suites + fixtures/
├─ 📸 docs/                README images
├─ 📜 LICENSE · NOTICE.md  MIT licence · third-party content attribution
└─ 🤖 .github/             workflows/ (ci, deploy) · dependabot.yml
```

## ⚠️ Known limitations

- Parsing is heuristic. TSG formats vary; where titles don't state a version the release stays empty (and shows under *“Guides without a stated release”*). Copilot enrichment narrows this over time.
- Learn is read from its source markdown; if the table layout changes, the [guardrails](#️-guardrails-never-ship-an-empty-site) keep serving the last good data instead of publishing a partial index.
- Known issues only list releases for which Microsoft documented them.
- Archived items can't be updated any more (their source is gone), so treat them as historical reference.

## 📜 Credits & licensing

The code is [MIT licensed](LICENSE). Troubleshooting content © Microsoft and contributors – [Azure/AzureLocal-Supportability](https://github.com/Azure/AzureLocal-Supportability) (MIT) and [MicrosoftDocs/azure-stack-docs](https://github.com/MicrosoftDocs/azure-stack-docs) (CC BY 4.0 / MIT). This project only indexes it and links back to the originals; trimmed samples live in `test/fixtures`. See [NOTICE.md](NOTICE.md) for attribution details and the note that AI-generated summaries may be inaccurate.
