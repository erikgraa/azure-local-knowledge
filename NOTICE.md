# Third-party content and notices

Azure Local Compendium is an **unofficial community project**. This project is not affiliated with, endorsed by, or
sponsored by Microsoft. Azure and Azure Local are trademarks of Microsoft Corporation.

The application code in this repository is licensed under the [MIT License](LICENSE). The *content* it indexes
belongs to its respective owners:

| Content | Source | Licence |
| --- | --- | --- |
| Troubleshooting guides (TSGs) | [Azure/AzureLocal-Supportability](https://github.com/Azure/AzureLocal-Supportability) | MIT, © Microsoft Corporation and contributors |
| Release information and known issues | [MicrosoftDocs/azure-stack-docs](https://github.com/MicrosoftDocs/azure-stack-docs) (`azure-local/`), published at [learn.microsoft.com](https://learn.microsoft.com/azure/azure-local/) | Documentation: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); code samples: MIT, © Microsoft Corporation |

What this project does with that content:

- It reads the source Markdown at build time and extracts short excerpts (titles, symptoms, error text, mitigation
  snippets) into a search index, always with a link back to the original document.
- **Changes were made:** text is trimmed, normalised and re-ordered; summaries, aliases, version ranges and
  cross-links may be generated or refined by an AI model (GitHub Copilot) and are marked as such in the UI.
  Generated text can be wrong — treat the linked source as authoritative.
- Trimmed copies of a few source files are kept in `test/fixtures` for offline tests.

Third-party software used to build and run the site is listed in `package.json` and distributed under its own licences
(notably [MiniSearch](https://github.com/lucaong/minisearch), MIT, and [Vite](https://vite.dev), MIT).

If you are a rights holder and want something changed or removed, please open an issue.
