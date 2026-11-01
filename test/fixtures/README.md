# Test fixtures

Small, trimmed snapshots of the real sources, used by CI (`npm run build:index -- --fixtures`) and the unit
tests so they never depend on live network access.

| Folder | Origin | Licence |
| --- | --- | --- |
| `supportability/` | [Azure/AzureLocal-Supportability](https://github.com/Azure/AzureLocal-Supportability) (`TSG/…`) | MIT |
| `learn/` | [MicrosoftDocs/azure-stack-docs](https://github.com/MicrosoftDocs/azure-stack-docs) (`azure-local/…`), trimmed to a few release blocks | CC BY 4.0 / MIT |

Refresh them with `npm run fixtures:update`. Tests assert on these files, so review the diff when they change.
