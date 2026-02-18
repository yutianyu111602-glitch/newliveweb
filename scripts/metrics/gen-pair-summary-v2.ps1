param(
  [string]$SweepDir = "artifacts\sweep",
  [string]$OutDir   = "artifacts\_p4"
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot "..\..")

if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# --- Scoring parameters (from P5.1.A percentile analysis) ---
# luma: P25=0.065, P50=0.099, P75=0.142
# motion: P50=1.14e-5, P90=6.62e-4
$lumaLo    = 0.06     # floor (below = too dark)
$lumaHi    = 0.18     # ceiling (above = definitely bright enough)
$motionLo  = 1.5e-5   # floor (≈P55 of sweep)
$motionHi  = 6.0e-4   # ceiling (≈P90 of sweep)
$wLuma     = 0.65     # weight: luma matters more
$wMotion   = 0.35

function Clamp01([double]$x) { [Math]::Max(0, [Math]::Min(1, $x)) }

$evals = Get-ChildItem $SweepDir -Recurse -Filter "eval.jsonl" -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 0 }
Write-Host "Found eval files: $($evals.Count)"

# pair -> aggregation
$rows = @{}

foreach ($f in $evals) {
  foreach ($ln in (Get-Content $f.FullName)) {
    if ([string]::IsNullOrWhiteSpace($ln)) { continue }
    try {
      $j = $ln | ConvertFrom-Json
      $pair = "$($j.pair)"
      if ($pair -eq '' -or $pair -eq $null) { continue }

      $l = [double]$j.vizAvgLuma
      $d = [double]$j.vizAvgFrameDelta

      # Per-sample score
      $ls = Clamp01(($l - $lumaLo) / ($lumaHi - $lumaLo))
      $ms = Clamp01(($d - $motionLo) / ($motionHi - $motionLo))
      $score = $wLuma * $ls + $wMotion * $ms

      if (-not $rows.ContainsKey($pair)) {
        $rows[$pair] = @{
          pair = $pair; n = 0
          sumL = 0.0; sumD = 0.0; sumScore = 0.0
          minL = [double]::MaxValue; minD = [double]::MaxValue
          maxL = 0.0; maxD = 0.0
          reasons = @{}
        }
      }
      $r = $rows[$pair]
      $r.n++
      $r.sumL += $l
      $r.sumD += $d
      $r.sumScore += $score
      if ($l -lt $r.minL) { $r.minL = $l }
      if ($l -gt $r.maxL) { $r.maxL = $l }
      if ($d -lt $r.minD) { $r.minD = $d }
      if ($d -gt $r.maxD) { $r.maxD = $d }

      if ($j.reasons -is [array]) {
        foreach ($reason in $j.reasons) {
          $rs = "$reason".Trim()
          if ($rs -eq '') { continue }
          if (-not $r.reasons.ContainsKey($rs)) { $r.reasons[$rs] = 0 }
          $r.reasons[$rs]++
        }
      }
    } catch {}
  }
}

Write-Host "Unique pairs: $($rows.Count)"

$out = @()
foreach ($k in $rows.Keys) {
  $r = $rows[$k]
  $avgL = $r.sumL / [Math]::Max($r.n, 1)
  $avgD = $r.sumD / [Math]::Max($r.n, 1)
  $avgScore = $r.sumScore / [Math]::Max($r.n, 1)
  $topR = $r.reasons.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1
  $out += [pscustomobject]@{
    pair      = [int]$r.pair
    n         = $r.n
    avgScore  = [Math]::Round($avgScore, 4)
    avgLuma   = [Math]::Round($avgL, 4)
    minLuma   = [Math]::Round($r.minL, 4)
    maxLuma   = [Math]::Round($r.maxL, 4)
    avgMotion = [Math]::Round($avgD, 6)
    minMotion = [Math]::Round($r.minD, 6)
    maxMotion = [Math]::Round($r.maxD, 6)
    topReason = if ($topR) { $topR.Name } else { "" }
    topReasonN = if ($topR) { $topR.Value } else { 0 }
  }
}

$sorted = $out | Sort-Object @{Expression={[double]$_.avgScore};Descending=$true}
$csvPath = Join-Path $OutDir "pair_summary_v2.csv"
$sorted | Export-Csv $csvPath -NoTypeInformation -Encoding UTF8
Write-Host "Wrote: $csvPath (rows: $($sorted.Count))"

# --- Keep filter ---
# Rule 1: n>=2 AND avgScore>=0.55
# Rule 2: avgLuma>=0.10 AND avgMotion>=3e-5 (fallback)
$keep = $sorted | Where-Object {
  ([int]$_.n -ge 2 -and [double]$_.avgScore -ge 0.55) -or
  ([double]$_.avgLuma -ge 0.10 -and [double]$_.avgMotion -ge 3e-5)
}

$keepPath = Join-Path $OutDir "pairs_keep_v2.txt"
$keep | Select-Object -ExpandProperty pair | Set-Content $keepPath -Encoding UTF8
Write-Host "KEEP pairs: $($keep.Count) / $($sorted.Count)"

Write-Host ""
Write-Host "=== TOP 30 by avgScore ==="
$sorted | Select-Object -First 30 | Format-Table pair,n,avgScore,avgLuma,avgMotion,topReason -AutoSize

Write-Host ""
Write-Host "=== KEEP stats ==="
$keepScores = $keep | ForEach-Object { [double]$_.avgScore }
$keepLumas = $keep | ForEach-Object { [double]$_.avgLuma }
Write-Host ("  avgScore range: {0:F4} .. {1:F4}" -f ($keepScores | Measure-Object -Minimum).Minimum, ($keepScores | Measure-Object -Maximum).Maximum)
Write-Host ("  avgLuma range:  {0:F4} .. {1:F4}" -f ($keepLumas | Measure-Object -Minimum).Minimum, ($keepLumas | Measure-Object -Maximum).Maximum)
