<#
.SYNOPSIS
    Search the Azure Local Compendium (https://knowledge.azl.graa.dev) from PowerShell.

.DESCRIPTION
    A single, dependency-free function. It downloads the published index.json (cached for a few
    hours), ranks Azure Local troubleshooting guides, known issues and releases against your query,
    and returns them as objects, so the output pipes straight into ConvertTo-Json, Export-Csv, etc.

    Load it once:
        iex (irm https://knowledge.azl.graa.dev/Search-AzLocalKnowledge.ps1)
    or dot-source a downloaded copy:
        . ./Search-AzLocalKnowledge.ps1

    Works in Windows PowerShell 5.1 and PowerShell 7+.

    Summaries and cross-links in the index may be AI-generated and can be wrong: always confirm in
    the linked official source (the Url property) before acting on a production cluster.

.PARAMETER Query
    Free text, an error code or a whole pasted error line. GUIDs, timestamps and IP addresses are
    ignored. Leave empty to list items (newest first) using the filters only.

.PARAMETER Release
    Your release train, e.g. 2610 or 2411.3. Only items that apply to it are returned (as on the
    website). The Applies property is: yes | maybe (guide without a stated release) | fixed-later
    (fixed in one of the next two releases).

.PARAMETER Type
    tsg, known-issue and/or release.

.PARAMETER Area
    Wildcard-friendly area filter, e.g. Networking or *Deployment*.

.PARAMETER Status
    Known-issue status: open, fixed or expected.

.PARAMETER First
    Maximum number of results (default 10, 0 = no limit).

.PARAMETER ExcludeArchived
    Skip items that have been removed from the official sources (kept in the index for reference).

.PARAMETER IncludeOtherReleases
    With -Release, also return matches documented only for other releases (Applies = no).

.PARAMETER Refresh
    Ignore the cached copy of the index and download it again.

.PARAMETER IndexUrl
    Index location (URL or local file path). Defaults to the AZLOCAL_KNOWLEDGE_INDEX environment
    variable, then the public site. Point it at the container to work offline, e.g.
    http://localhost:8080/data/index.json

.EXAMPLE
    Search-AzLocalKnowledge 'SecretNotFoundException'

.EXAMPLE
    Search-AzLocalKnowledge 'Arc registration error 42' -Release 2610 | ConvertTo-Json -Depth 4

.EXAMPLE
    Search-AzLocalKnowledge -Type known-issue -Status open -Release 2610 -First 0 | Select-Object Title, Url
#>
function Search-AzLocalKnowledge {
    [CmdletBinding()]
    [OutputType('AzLocal.KnowledgeItem')]
    param(
        [Parameter(Position = 0, ValueFromPipeline = $true)]
        [string]$Query,

        [string]$Release,

        [ValidateSet('tsg', 'known-issue', 'release')]
        [string[]]$Type,

        [string]$Area,

        [ValidateSet('open', 'fixed', 'expected')]
        [string]$Status,

        [ValidateRange(0, [int]::MaxValue)]
        [int]$First = 10,

        [switch]$ExcludeArchived,
        [switch]$IncludeOtherReleases,
        [switch]$Refresh,

        [string]$IndexUrl = $(if ($env:AZLOCAL_KNOWLEDGE_INDEX) { $env:AZLOCAL_KNOWLEDGE_INDEX } else { 'https://knowledge.azl.graa.dev/data/index.json' })
    )

    begin {
        $ErrorActionPreference = 'Stop'
        $isFile = Test-Path -LiteralPath $IndexUrl -PathType Leaf
        $urlHash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($IndexUrl))).Replace('-', '').Substring(0, 12).ToLowerInvariant()
        $cacheFile = Join-Path ([IO.Path]::GetTempPath()) "azlocal-knowledge-index-$urlHash.json"
        $source = if ($isFile) { (Resolve-Path -LiteralPath $IndexUrl).Path } else { $cacheFile }

        if (-not $isFile) {
            $fresh = (Test-Path $cacheFile) -and ((Get-Date) - (Get-Item $cacheFile).LastWriteTime).TotalHours -lt 6
            if ($Refresh -or -not $fresh) {
                try {
                    $tmp = "$cacheFile.download"
                    Invoke-WebRequest -Uri $IndexUrl -OutFile $tmp -UseBasicParsing
                    Move-Item -LiteralPath $tmp -Destination $cacheFile -Force
                }
                catch {
                    if (-not (Test-Path $cacheFile)) { throw "Could not download $IndexUrl : $($_.Exception.Message)" }
                    Write-Warning "Could not refresh the index ($($_.Exception.Message)); using the cached copy."
                }
            }
        }

        $stamp = (Get-Item $source).LastWriteTimeUtc.Ticks
        if (-not $script:AzLocalKnowledgeCache -or $script:AzLocalKnowledgeCache.Source -ne $source -or $script:AzLocalKnowledgeCache.Stamp -ne $stamp) {
            $parsed = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
            if (-not $parsed.items) { throw "'$source' is not an Azure Local Compendium index." }
            $script:AzLocalKnowledgeCache = @{ Source = $source; Stamp = $stamp; Data = $parsed }
        }
        $index = $script:AzLocalKnowledgeCache.Data

        $stop = @('the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'be', 'at', 'by', 'with', 'from', 'this', 'that', 'it', 'as')
        $splitChars = '[\s"''`<>()\[\]{}:;,|=\\/!?*+~^$#@%&]+'
        $weights = [ordered]@{ codes = 6; errors = 4; aliases = 4; title = 3; symptoms = 2; area = 1; versions = 1; mitigation = 1 }

        function ConvertTo-Text($v) {
            if ($v -is [datetime]) { return $v.ToString('yyyy-MM-dd') }
            if ($null -eq $v) { return $null }
            [string]$v
        }

        function TrainKey([string]$train) {
            if ($train -match '^(\d{4})(?:\.(\d+))?$') {
                $minor = 0
                if ($Matches[2]) { $minor = [int]$Matches[2] }
                return [int]$Matches[1] * 100 + $minor
            }
            -1
        }

        $releases = @($index.releases)
        $releaseInfo = $null
        $laterWindow = @()
        if ($Release) {
            $releaseInfo = $releases | Where-Object { $_.id -eq $Release } | Select-Object -First 1
            if (-not $releaseInfo) {
                throw "Unknown release '$Release'. Known releases: $((@($releases | ForEach-Object { $_.id })) -join ', ')"
            }
            $ownKey = TrainKey $Release
            $laterWindow = @($releases | ForEach-Object { $_.id } | Where-Object { (TrainKey $_) -gt $ownKey } |
                    Sort-Object { TrainKey $_ } | Select-Object -First 2)
        }

        # Mirrors affects() in the website (src/versions.ts).
        function Get-Applies($item) {
            if (@($item.releases) -contains $releaseInfo.id) { return 'yes' }
            if ($item.type -eq 'release') { return 'no' }
            $key = TrainKey $releaseInfo.id
            if ($item.type -eq 'known-issue') {
                if ($item.fixedIn -and $key -lt (TrainKey $item.fixedIn) -and $laterWindow -contains $item.fixedIn) {
                    $first = -1
                    if (@($item.releases).Count) { $first = (@($item.releases) | ForEach-Object { TrainKey $_ } | Measure-Object -Minimum).Minimum }
                    if ($key -gt $first) { return 'fixed-later' }
                }
                return 'no'
            }
            if (@($item.releases).Count) { return 'no' }
            if (@($item.osVersions).Count -and -not (@($item.osVersions) | Where-Object { @($releaseInfo.osVersions) -contains $_ })) { return 'no' }
            'maybe'
        }

        function Get-Terms([string]$text) {
            $whole = New-Object 'System.Collections.Generic.List[string]'
            $parts = New-Object 'System.Collections.Generic.List[string]'
            foreach ($raw in [regex]::Split($text, $splitChars)) {
                $word = $raw.Trim('.', '-', '_')
                if (-not $word) { continue }
                $whole.Add($word.ToLowerInvariant())
                $pieces = foreach ($p in [regex]::Split($word, '[._-]+')) {
                    [regex]::Split($p, '(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])')
                }
                $pieces = @($pieces | Where-Object { $_.Length -gt 1 } | ForEach-Object { $_.ToLowerInvariant() })
                if ($pieces.Count -gt 1 -or ($pieces.Count -eq 1 -and $pieces[0] -ne $word.ToLowerInvariant())) {
                    foreach ($p in $pieces) { $parts.Add($p) }
                }
            }
            [pscustomobject]@{
                Whole = @($whole | Where-Object { $stop -notcontains $_ } | Select-Object -Unique)
                Parts = @($parts | Where-Object { $stop -notcontains $_ } | Select-Object -Unique)
            }
        }

        function New-TermRegex([string]$term) {
            $e = [regex]::Escape($term)
            if ($term.Length -le 3) { $e = "(?<![a-z0-9])$e(?![a-z0-9])" } else { $e = "(?<![a-z0-9])$e" }
            New-Object regex $e, 'Compiled'
        }

        # Lower-cased searchable text per item, built once per session load.
        if (-not $script:AzLocalKnowledgeCache.Docs) {
            $docs = @{}
            foreach ($it in $index.items) {
                $join = { param($v) (@($v) | Where-Object { $_ }) -join " `n " }
                $docs[$it.id] = @{
                    codes      = (& $join $it.errorCodes).ToLowerInvariant()
                    errors     = (& $join $it.errorStrings).ToLowerInvariant()
                    aliases    = (& $join $it.aliases).ToLowerInvariant()
                    title      = ([string]$it.title).ToLowerInvariant()
                    symptoms   = (& $join @($it.symptomSummary, $it.symptoms)).ToLowerInvariant()
                    area       = (& $join @($it.area, $it.subarea)).ToLowerInvariant()
                    mitigation = (& $join @($it.mitigationSummary, $it.mitigation)).ToLowerInvariant()
                    versions   = (& $join @($it.releases, $it.solutionVersions, $it.osVersions, $it.versionText, $it.fixedIn, $it.introducedIn)).ToLowerInvariant()
                }
                $d = $docs[$it.id]
                $d.signal = ($d.title, $d.errors, $d.aliases, $d.codes) -join " `n "
                $d.signal = ($d.signal -replace '\s+', ' ')
            }
            $script:AzLocalKnowledgeCache.Docs = $docs
        }
        $docs = $script:AzLocalKnowledgeCache.Docs
    }

    process {
        $normalized = ''
        if ($Query) {
            $normalized = $Query `
                -replace '(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', ' ' `
                -replace '\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?Z?\b', ' ' `
                -replace '\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b', ' ' `
                -replace '\s+', ' '
            $normalized = $normalized.Trim()
        }

        $candidates = @($index.items)
        if ($Type) { $candidates = @($candidates | Where-Object { $Type -contains $_.type }) }
        if ($Status) { $candidates = @($candidates | Where-Object { $_.status -eq $Status }) }
        if ($Area) {
            $pattern = if ($Area -match '[*?]') { $Area } else { "*$Area*" }
            $candidates = @($candidates | Where-Object { $_.area -like $pattern -or $_.subarea -like $pattern })
        }
        if ($ExcludeArchived) { $candidates = @($candidates | Where-Object { $_.lifecycle.state -ne 'removed' }) }

        $scored = New-Object 'System.Collections.Generic.List[object]'

        if ($normalized) {
            $terms = Get-Terms $normalized
            $wholeRx = @($terms.Whole | ForEach-Object { New-TermRegex $_ })
            $partRx = @($terms.Parts | Where-Object { $terms.Whole -notcontains $_ } | ForEach-Object { New-TermRegex $_ })
            $phrase = ($normalized.ToLowerInvariant() -replace '\s+', ' ').Trim('"', "'")
            $words = @($terms.Whole | Where-Object { $_.Length -gt 2 })
            $wordRx = @($words | ForEach-Object { New-TermRegex $_ })

            foreach ($it in $candidates) {
                $d = $docs[$it.id]
                $score = 0.0
                foreach ($field in $weights.Keys) {
                    $text = $d[$field]
                    if (-not $text) { continue }
                    $w = $weights[$field]
                    foreach ($rx in $wholeRx) { if ($rx.IsMatch($text)) { $score += $w } }
                    foreach ($rx in $partRx) { if ($rx.IsMatch($text)) { $score += 0.2 * $w } }
                }
                if ($score -le 0) { continue }
                if ($phrase.Length -ge 6 -and $d.signal.Contains($phrase)) { $score *= 2.5 }
                if ($words.Count -ge 3) {
                    $overlap = 0
                    foreach ($rx in $wordRx) { if ($rx.IsMatch($d.signal)) { $overlap++ } }
                    $score *= 1 + 1.5 * ($overlap / $words.Count)
                }
                if ($it.lifecycle.state -eq 'removed') { $score *= 0.6 }
                $scored.Add([pscustomobject]@{ Item = $it; Score = $score })
            }
            if ($scored.Count) {
                $top = ($scored | Measure-Object Score -Maximum).Maximum
                $ranked = @($scored | Where-Object { $_.Score -ge $top * 0.08 } | Sort-Object Score -Descending)
            }
            else { $ranked = @() }
        }
        else {
            # No query: items without a release record unless asked for, newest first.
            if (-not $Type -and -not $Release) { $candidates = @($candidates | Where-Object { $_.type -ne 'release' }) }
            $ranked = @($candidates | Sort-Object { ConvertTo-Text $_.lastUpdated } -Descending | ForEach-Object { [pscustomobject]@{ Item = $_; Score = 0 } })
        }

        $emitted = 0
        foreach ($r in $ranked) {
            $it = $r.Item
            $applies = $null
            if ($releaseInfo) {
                $applies = Get-Applies $it
                if ($applies -eq 'no' -and -not $IncludeOtherReleases) { continue }
            }
            if ($First -gt 0 -and $emitted -ge $First) { break }
            $emitted++

            $summary = if ($it.symptomSummary) { $it.symptomSummary } else { $it.symptoms }
            $fix = if ($it.mitigationSummary) { $it.mitigationSummary } else { $it.mitigation }
            $obj = [pscustomobject][ordered]@{
                PSTypeName   = 'AzLocal.KnowledgeItem'
                Score        = [math]::Round($r.Score, 1)
                Type         = $it.type
                Title        = $it.title
                Area         = $it.area
                Status       = $it.status
                Applies      = $applies
                Releases     = @($it.releases)
                FixedIn      = $it.fixedIn
                Symptom      = $summary
                Mitigation   = $fix
                ErrorStrings = @($it.errorStrings)
                Aliases      = @($it.aliases)
                Url          = $it.url
                Related      = @(@($it.related) | ForEach-Object { $_.id })
                Flags        = @(@($it.flags) | ForEach-Object { $_.message })
                LastUpdated  = ConvertTo-Text $it.lastUpdated
                Archived     = ($it.lifecycle.state -eq 'removed')
                Id           = $it.id
            }
            $obj
        }
    }
}

Update-TypeData -TypeName 'AzLocal.KnowledgeItem' -DefaultDisplayPropertySet 'Score', 'Type', 'Title', 'Applies', 'Url' -Force
