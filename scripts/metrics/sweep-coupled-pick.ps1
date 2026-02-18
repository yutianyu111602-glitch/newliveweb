# sweep-coupled-pick.ps1 — Parameter sweep for coupled-pair pick strategy.
# Runs weighted vs shuffle for each (gamma, explore, dedupN, dedupPenalty) combination,
# collects metrics, and outputs CSV + Markdown summary.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/metrics/sweep-coupled-pick.ps1
#   # Or with custom params:
#   ... -Gammas @(1,2,3,4) -Explores @(0,0.05,0.1) -DedupNs @(0,30) -DedupPenalties @(0.05) -Samples 60

param(
  [double[]]$Gammas = @(1, 2, 3, 4),
  [double[]]$Explores = @(0, 0.05, 0.1),
  [int[]]$DedupNs = @(0, 30),
  [double[]]$DedupPenalties = @(0.05),
  [int]$Samples = 60,
  [string]$Pack = "ai_generated_coupled_final",
  [string]$OutDir = "artifacts/sweep",
  [int]$DelayMs = 250,
  [int]$HardTimeoutMs = 900000,
  [string]$AudioMode = "file",
  [string]$AudioRoot = "D:\CloudMusic",
  [string]$PairsManifest = "",
  [switch]$Headed = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-JsonPropOrDefault($obj, [string]$name, $default) {
  if ($null -eq $obj) { return $default }
  $p = $obj.PSObject.Properties[$name]
  if ($null -eq $p) { return $default }
  if ($null -eq $p.Value) { return $default }
  return $p.Value
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir "../..")

$evalScript = Join-Path $rootDir "scripts/headless-eval-coupled-pairs.mjs"
if (-not (Test-Path $evalScript)) {
  Write-Host "FAIL: eval script not found: $evalScript"
  exit 1
}

# Ensure output directory
$outPath = Join-Path $rootDir $OutDir
if (-not (Test-Path $outPath)) {
  New-Item -ItemType Directory -Path $outPath -Force | Out-Null
}

$csvPath = Join-Path $outPath "sweep-results.csv"
$mdPath = Join-Path $outPath "sweep-summary.md"

$qualityPath = Join-Path $rootDir "public/presets/$Pack/pairs-quality.v0.json"
if (-not (Test-Path $qualityPath)) {
  Write-Host "FAIL: missing pairs-quality: $qualityPath"
  exit 1
}

$qualityJson = Get-Content $qualityPath -Raw | ConvertFrom-Json
if ($null -eq $qualityJson -or $null -eq $qualityJson.pairs) {
  Write-Host "FAIL: invalid pairs-quality json: $qualityPath"
  exit 1
}

# pairId -> quality01
$qualityMap = @{}
$allQualities = New-Object System.Collections.Generic.List[double]
foreach ($p in $qualityJson.pairs) {
  if ($null -eq $p) { continue }
  $id = [int]$p.pair
  $val = [double]$p.quality01
  if ([double]::IsNaN($val) -or [double]::IsInfinity($val)) { continue }
  $qualityMap[[string]$id] = $val
  $allQualities.Add($val) | Out-Null
}
if ($qualityMap.Count -lt 10) {
  Write-Host "FAIL: pairs-quality seems too small (pairs=$($qualityMap.Count))"
  exit 1
}

function Percentile($arr, [double]$p) {
  if ($null -eq $arr -or $arr.Count -eq 0) { return [double]::NaN }
  $sorted = $arr | Sort-Object
  $idx = [int][Math]::Floor(($sorted.Count - 1) * $p)
  return [double]$sorted[$idx]
}

$top20Threshold = Percentile $allQualities 0.80

function Read-EvalStats([string]$evalPath, [hashtable]$qMap, [double]$top20Threshold) {
  $pairIds = New-Object System.Collections.Generic.List[int]
  $qualities = New-Object System.Collections.Generic.List[double]
  $missingQuality = 0

  foreach ($line in Get-Content $evalPath) {
    if (-not $line) { continue }
    $o = $line | ConvertFrom-Json
    if ($null -eq $o) { continue }

    $pairId = $null
    if ($null -ne $o.pair) {
      try { $pairId = [int]$o.pair } catch { $pairId = $null }
    }
    if ($null -ne $pairId) {
      $pairIds.Add($pairId) | Out-Null
    }

    $q = $null
    if ($null -ne $o.quality01) {
      try { $q = [double]$o.quality01 } catch { $q = $null }
    }
    if ($null -ne $q -and -not [double]::IsNaN($q) -and -not [double]::IsInfinity($q)) {
      $qualities.Add($q) | Out-Null
      continue
    }

    if ($null -ne $pairId) {
      $k = [string]$pairId
      if ($qMap.ContainsKey($k)) {
        $qualities.Add([double]$qMap[$k]) | Out-Null
        continue
      }
    }

    $missingQuality += 1
  }

  $unique = New-Object "System.Collections.Generic.HashSet[int]"
  foreach ($id in $pairIds) { [void]$unique.Add($id) }

  $avg = if ($qualities.Count -gt 0) { ($qualities | Measure-Object -Average).Average } else { [double]::NaN }
  $p50 = Percentile $qualities 0.50
  $p90 = Percentile $qualities 0.90

  $topHit = 0
  foreach ($v in $qualities) { if ($v -ge $top20Threshold) { $topHit++ } }
  $topRate = if ($qualities.Count -gt 0) { $topHit / $qualities.Count } else { [double]::NaN }

  $nPairs = $pairIds.Count
  $uniqueRate = if ($nPairs -gt 0) { $unique.Count / $nPairs } else { 0 }

  return [pscustomobject]@{
    samples = $nPairs
    uniquePairs = $unique.Count
    uniquePairRate = [Math]::Round([double]$uniqueRate, 6)
    missingQuality = $missingQuality
    avgQuality = [Math]::Round([double]$avg, 6)
    p50 = [Math]::Round([double]$p50, 6)
    p90 = [Math]::Round([double]$p90, 6)
    top20HitRate = [Math]::Round([double]$topRate, 6)
  }
}

# CSV header
$csvHeader = "gamma,explore,dedupN,dedupPenalty,mode,n,avgQ,p50,p90,top20,avgQLift,top20Lift,uniquePairRate,samplesPerClick"
$csvLines = @($csvHeader)

$results = @()
$totalCombos = $Gammas.Count * $Explores.Count * $DedupNs.Count * $DedupPenalties.Count
$comboIdx = 0

Write-Host "=== Coupled-Pick Parameter Sweep ==="
Write-Host "  Combinations: $totalCombos (gamma=$($Gammas.Count) x explore=$($Explores.Count) x dedupN=$($DedupNs.Count) x dedupPenalty=$($DedupPenalties.Count))"
Write-Host "  Modes: weighted + shuffle per combo = $($totalCombos * 2) runs"
Write-Host "  Target samples/arm: $Samples"
Write-Host "  Pack: $Pack"
Write-Host ""

foreach ($gamma in $Gammas) {
  foreach ($explore in $Explores) {
    foreach ($dedupN in $DedupNs) {
      foreach ($dedupPenalty in $DedupPenalties) {
        $comboIdx++
        $tag = "g${gamma}_e${explore}_d${dedupN}_p${dedupPenalty}"
        Write-Host "--- [$comboIdx/$totalCombos] gamma=$gamma explore=$explore dedupN=$dedupN dedupPenalty=$dedupPenalty ---"

        $armResults = @{}

        foreach ($mode in @("weighted", "shuffle")) {
          $armDir = Join-Path $outPath "$tag/$mode"
          if (-not (Test-Path $armDir)) {
            New-Item -ItemType Directory -Path $armDir -Force | Out-Null
          }

          # Ensure each arm starts clean (avoid mixing runs and avoid eval's outDir warning).
          foreach ($name in @("eval.jsonl", "meta.json", "vite.log")) {
            $p = Join-Path $armDir $name
            if (Test-Path $p) {
              Remove-Item -Force $p -ErrorAction SilentlyContinue
            }
          }

          Write-Host "  Running $mode arm..."
          Push-Location $rootDir
          try {
            $nodeArgs = @(
              $evalScript,
              "--packs", $Pack,
              "--coupledPick", $mode,
              "--outDir", $armDir,
              "--targetSamples", "$Samples",
              "--coupledGamma", "$gamma",
              "--coupledExplore", "$explore",
              "--coupledDedupN", "$dedupN",
              "--coupledDedupPenalty", "$dedupPenalty",
              "--audioMode", $AudioMode,
              "--viewportWidth", "960",
              "--viewportHeight", "540",
              "--deviceScaleFactor", "1.0",
              "--gpuMode", "safe",
              "--maxHours", "0.5"
            )
            if ($AudioMode -eq "file" -and $AudioRoot) {
              $nodeArgs += @("--audioRoot", $AudioRoot)
            }
            if ($Headed) {
              $nodeArgs += @("--headed")
            }
            if ($PairsManifest) {
              $nodeArgs += @("--pairsManifest", $PairsManifest)
            }

            # Windows PowerShell treats native stderr as an error record; under StrictMode + Stop
            # that would terminate the sweep even if node exits 0. Only trust the exit code.
            $prevEap = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            try {
              $output = & node @nodeArgs 2>&1 | Out-String
              $exitCode = $LASTEXITCODE
            }
            finally {
              $ErrorActionPreference = $prevEap
            }
            if ($exitCode -ne 0) {
              Write-Host "  WARNING: eval exited with code $exitCode for $mode (gamma=$gamma explore=$explore dedupN=$dedupN)"
            }
          }
          finally {
            Pop-Location
          }

          $evalPath = Join-Path $armDir "eval.jsonl"
          if (-not (Test-Path $evalPath)) {
            Write-Host "  WARNING: eval.jsonl not found at $evalPath"
            $armResults[$mode] = @{ samples = 0; uniquePairRate = 0; avgQuality = 0; p50 = 0; p90 = 0; top20HitRate = 0 }
            continue
          }

          $stats = Read-EvalStats $evalPath $qualityMap $top20Threshold

          $report = [pscustomobject]@{
            kind = "coupled_sweep_arm.v0"
            pack = $Pack
            mode = $mode
            gamma = $gamma
            explore = $explore
            dedupN = $dedupN
            dedupPenalty = $dedupPenalty
            targetSamples = $Samples
            out = @{ evalPath = "eval.jsonl"; metaPath = "meta.json"; viteLog = "vite.log" }
            selStats = @{
              samplesCollected = [int]$stats.samples
              clicksUsed = [int]$stats.samples
              samplesPerClick = 1
              uniquePairs = [int]$stats.uniquePairs
              uniquePairRate = [double]$stats.uniquePairRate
            }
            dist = @{
              avgQuality = [double]$stats.avgQuality
              p50 = [double]$stats.p50
              p90 = [double]$stats.p90
              top20HitRate = [double]$stats.top20HitRate
              top20Threshold = [double]$top20Threshold
              missingQuality = [int]$stats.missingQuality
            }
          }
          $reportPath = Join-Path $armDir "report.json"
          $report | ConvertTo-Json -Depth 8 | Set-Content -Path $reportPath -Encoding UTF8

          $armResults[$mode] = @{
            samples = [int]$stats.samples
            samplesPerClick = 1
            uniquePairRate = [double]$stats.uniquePairRate
            avgQuality = [double]$stats.avgQuality
            p50 = [double]$stats.p50
            p90 = [double]$stats.p90
            top20HitRate = [double]$stats.top20HitRate
          }

          Write-Host "  $mode : samples=$($stats.samples) uniquePairRate=$($stats.uniquePairRate) avgQ=$($stats.avgQuality) top20=$($stats.top20HitRate)"
        }

        $shuffle = $armResults["shuffle"]
        $weighted = $armResults["weighted"]
        $avgQLift = if ($shuffle.avgQuality -gt 0) { [Math]::Round([double]$weighted.avgQuality / [double]$shuffle.avgQuality, 4) } else { "N/A" }
        $top20Lift = if ($shuffle.top20HitRate -gt 0) { [Math]::Round([double]$weighted.top20HitRate / [double]$shuffle.top20HitRate, 4) } else { "N/A" }

        foreach ($arm in @("shuffle", "weighted")) {
          $stats = $armResults[$arm]
          $uniquePairRate = [double]$stats.uniquePairRate
          $spc = [double]$stats.samplesPerClick
          $csvLines += "$gamma,$explore,$dedupN,$dedupPenalty,$arm,$($stats.samples),$($stats.avgQuality),$($stats.p50),$($stats.p90),$($stats.top20HitRate),$avgQLift,$top20Lift,$uniquePairRate,$spc"

          $results += [pscustomobject]@{
            gamma           = $gamma
            explore         = $explore
            dedupN          = $dedupN
            dedupPenalty    = $dedupPenalty
            mode            = $arm
            n               = $stats.samples
            avgQ            = $stats.avgQuality
            p50             = $stats.p50
            p90             = $stats.p90
            top20           = $stats.top20HitRate
            avgQLift        = $avgQLift
            top20Lift       = $top20Lift
            uniquePairRate  = $uniquePairRate
            samplesPerClick = $spc
          }
        }

        Write-Host "  Result: avgQLift=$avgQLift top20Lift=$top20Lift"

        Write-Host ""
      }
    }
  }
}

# Write CSV
$csvLines -join "`n" | Set-Content -Path $csvPath -Encoding UTF8
Write-Host "CSV: $csvPath"

# Write Markdown summary
$md = @()
$md += "# Coupled-Pick Parameter Sweep Results"
$md += ""
$md += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$md += "Pack: $Pack | Samples/arm: $Samples"
$md += ""
$md += "## Summary Table"
$md += ""
$md += "| gamma | explore | dedupN | penalty | mode | n | avgQ | p50 | p90 | top20 | avgQ lift | top20 lift | uniquePairRate | spc |"
$md += "|-------|---------|--------|---------|------|---|------|-----|-----|-------|-----------|------------|----------------|-----|"

foreach ($r in $results) {
  $md += "| $($r.gamma) | $($r.explore) | $($r.dedupN) | $($r.dedupPenalty) | $($r.mode) | $($r.n) | $($r.avgQ) | $($r.p50) | $($r.p90) | $($r.top20) | $($r.avgQLift) | $($r.top20Lift) | $($r.uniquePairRate) | $($r.samplesPerClick) |"
}

$md += ""
$md += "## Best Configurations (by avgQ lift)"
$md += ""

# Only weighted rows, sorted by avgQLift
$weightedResults = @($results | Where-Object { $_.mode -eq "weighted" -and $_.avgQLift -ne "N/A" } | Sort-Object { [double]$_.avgQLift } -Descending)
if ($weightedResults.Count -gt 0) {
  $md += "| Rank | gamma | explore | dedupN | penalty | avgQ lift | top20 lift | avgQ | uniquePairRate |"
  $md += "|------|-------|---------|--------|---------|-----------|------------|------|----------------|"
  $rank = 0
  foreach ($r in $weightedResults | Select-Object -First 5) {
    $rank++
    $md += "| $rank | $($r.gamma) | $($r.explore) | $($r.dedupN) | $($r.dedupPenalty) | $($r.avgQLift)x | $($r.top20Lift)x | $($r.avgQ) | $($r.uniquePairRate) |"
  }
}

$md += ""
$md += "## Recommendations"
$md += ""
if ($weightedResults.Count -gt 0) {
  $best = $weightedResults[0]
  $md += "**Best configuration**: gamma=$($best.gamma), explore=$($best.explore), dedupN=$($best.dedupN), penalty=$($best.dedupPenalty)"
  $md += "- avgQuality lift: $($best.avgQLift)x"
  $md += "- top20HitRate lift: $($best.top20Lift)x"
  $md += "- uniquePairRate: $($best.uniquePairRate)"
}
else {
  $md += "No valid results to recommend from."
}

$md -join "`n" | Set-Content -Path $mdPath -Encoding UTF8
Write-Host "Markdown: $mdPath"
Write-Host ""
Write-Host "=== Sweep complete: $($results.Count) data points ==="
