# PowerShell search

[← README](../README.md)

- [💻 Use it from the command line](#command-line)

<a id="command-line"></a>

## 💻 Use it from the command line

`index.json` is a static file, so there is no search API, but one PowerShell function turns it into one. No module, nothing to install; works in Windows PowerShell 5.1 and PowerShell 7+:

```powershell
iex (irm https://knowledge.azl.graa.dev/Search-AzLocalKnowledge.ps1)   # load it once per session

Search-AzLocalKnowledge 'SecretNotFoundException'
Search-AzLocalKnowledge 'Arc registration error 42' -Release 2610 | ConvertTo-Json -Depth 4
Search-AzLocalKnowledge -Type known-issue -Status open -Release 2610 -First 0 | Select-Object Title, Url
```

It ranks like the website (error codes and error text first, then aliases, title, symptoms), strips GUIDs, timestamps and IPs from pasted errors, and applies the same release logic (`Applies` = `yes` · `maybe` · `fixed-later`). Results are objects with `Score`, `Type`, `Title`, `Area`, `Status`, `Applies`, `Releases`, `FixedIn`, `Symptom`, `Mitigation`, `ErrorStrings`, `Aliases`, `Url`, `Related`, `Flags`, `LastUpdated`, `Archived` and `Id`. The index is cached in your temp folder for 6 hours (`-Refresh` to force). Filters: `-Release`, `-Type`, `-Area`, `-Status`, `-First`, `-ExcludeArchived`, `-IncludeOtherReleases`. Use `-IndexUrl` (or the `AZLOCAL_KNOWLEDGE_INDEX` environment variable) to read from a container or a local file. Summaries may be AI-generated: always confirm in the `Url` source.
