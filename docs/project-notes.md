# Project notes, limitations and licensing

[← README](../README.md)

- [🗂️ Project layout](#project-layout)
- [⚠️ Known limitations](#limitations)
- [📜 Credits & licensing](#credits)

<a id="project-layout"></a>

## 🗂️ Project layout

```text
├─ 📄 index.html · vite.config.ts · tsconfig.json
├─ 🎨 public/              favicon.svg, PNG icons, manifest, Search-AzLocalKnowledge.ps1, data/index.json (generated)
├─ 🐳 Dockerfile · docker/  nginx image of the built site + nginx.conf + smoke.sh
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
├─ 📚 docs/                user and technical guides + screenshots
├─ 📜 LICENSE · NOTICE.md  MIT licence · third-party content attribution
└─ 🤖 .github/             workflows/ (ci, deploy) · dependabot.yml
```

<a id="limitations"></a>

## ⚠️ Known limitations

- Parsing is heuristic. TSG formats vary; where titles don't state a version the release stays empty (and shows under *“Guides without a stated release”*). Copilot enrichment narrows this over time.
- Learn is read from its source markdown; if the table layout changes, the [guardrails](how-it-works.md#guardrails) keep serving the last good data instead of publishing a partial index.
- Known issues only list releases for which Microsoft documented them.
- Archived items can't be updated any more (their source is gone), so treat them as historical reference.

<a id="credits"></a>

## 📜 Credits & licensing

The code is [MIT licensed](../LICENSE). Troubleshooting content © Microsoft and contributors – [Azure/AzureLocal-Supportability](https://github.com/Azure/AzureLocal-Supportability) (MIT) and [MicrosoftDocs/azure-stack-docs](https://github.com/MicrosoftDocs/azure-stack-docs) (CC BY 4.0 / MIT). This project only indexes it and links back to the originals; trimmed samples live in `test/fixtures`. See [NOTICE.md](../NOTICE.md) for attribution details and the note that AI-generated summaries may be inaccurate.
