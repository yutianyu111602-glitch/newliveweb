#!/usr/bin/env pwsh
# Watch the latest headless run without touching the terminal running the validation.

param(
  [int]$IntervalSec = 5
)

$root = "c:\Users\pc\code\newliveweb\artifacts\headless-runs"

function Get-VerifySummary {
  param([object]$Report)

  function To-DoubleOrNull($v) {
    try {
      if ($null -eq $v) { return $null }
      return [double]$v
    } catch {
      return $null
    }
  }

  $framesRendered = $Report.checks.projectMFramesRendered.framesRendered
  $tMs = $Report.checks.projectMFramesRendered.lastRenderTimeMs
  $pageErrors = $Report.counts.pageErrors

  $framesD = To-DoubleOrNull $framesRendered
  $tMsD = To-DoubleOrNull $tMs

  $framesOk = ($null -ne $framesD) -and ($framesD -ge 3)
  $criticalOk =
    [bool]$Report.checks.canvasAttached -and
    $framesOk -and
    [bool]$Report.checks.finalOutputNonEmpty -and
    [bool]$Report.checks.finalOutputChanges -and
    [bool]$Report.checks.projectMCanvasNonEmpty -and
    [bool]$Report.checks.projectMCanvasChanges

  $exitCode = 1
  $pageErrorsD = To-DoubleOrNull $pageErrors
  if (($null -ne $pageErrorsD) -and ($pageErrorsD -gt 0)) { $exitCode = 2 }
  elseif ($criticalOk) { $exitCode = 0 }

  $fps = $null
  if (($null -ne $framesD) -and ($null -ne $tMsD) -and ($tMsD -gt 0)) {
    $fps = [math]::Round(($framesD / ($tMsD / 1000)), 2)
  }

  return [pscustomobject]@{
    dsf = $Report.deviceScaleFactor
    framesRendered = $framesRendered
    tMs = $tMs
    fps = $fps
    pageErrors = $pageErrors
    criticalOk = $criticalOk
    exitCode = $exitCode
  }
}

function Get-BaselineStatus {
  param([string]$BaselineModeDir)

  if (-not (Test-Path $BaselineModeDir)) {
    return [pscustomobject]@{ state = 'pending' }
  }

  $latestRunDir = Get-ChildItem $BaselineModeDir -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1

  if (-not $latestRunDir) {
    return [pscustomobject]@{ state = 'empty'; dir = $BaselineModeDir }
  }

  $jsonFiles = @(Get-ChildItem $latestRunDir.FullName -Recurse -File -Filter "*.json" -ErrorAction SilentlyContinue)
  $stages = @()
  for ($i = 1; $i -le 7; $i++) {
    $stageDir = Join-Path $latestRunDir.FullName ("S" + $i)
    if (-not (Test-Path $stageDir)) { continue }
    $stageFiles = @(Get-ChildItem $stageDir -File -Filter "*.json" -ErrorAction SilentlyContinue)
    if ($stageFiles.Count -gt 0) { $stages += ("S" + $i) }
  }

  $latestFile = $null
  if ($jsonFiles.Count -gt 0) {
    $latestFile = $jsonFiles | Sort-Object LastWriteTime | Select-Object -Last 1
  }

  return [pscustomobject]@{
    state = 'ok'
    runDirName = $latestRunDir.Name
    runDir = $latestRunDir.FullName
    jsonCount = $jsonFiles.Count
    stagesDone = $stages
    latestFile = $latestFile
  }
}

while ($true) {
  $latest = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1

  Clear-Host
  Write-Host ("=== Headless Run Watch (" + (Get-Date -Format 'HH:mm:ss') + ") ===")

  if (-not $latest) {
    Write-Host "No headless-runs found yet."
    Start-Sleep -Seconds $IntervalSec
    continue
  }

  Write-Host ("RunId: " + $latest.Name)

  $logDir = Join-Path $latest.FullName 'logs'
  $verifyDir = Join-Path $latest.FullName 'verify'
  $baselineDir = Join-Path $latest.FullName 'baseline-a0\direct'

  $report = Join-Path $verifyDir 'report.json'
  if (Test-Path $report) {
    try {
      $r = Get-Content $report -Raw | ConvertFrom-Json
      $s = Get-VerifySummary -Report $r
      $fpsText = "N/A"
      if ($null -ne $s.fps) { $fpsText = [string]$s.fps }

      Write-Host (
        "Verify: exitCode=" + $s.exitCode +
        " criticalOk=" + $s.criticalOk +
        " pageErrors=" + $s.pageErrors +
        " frames=" + $s.framesRendered +
        " fps=" + $fpsText
      )
    } catch {
      Write-Host "Verify: report.json exists (parse failed)"
    }
  } else {
    Write-Host "Verify: running (report.json not yet present)"
  }

  $b = Get-BaselineStatus -BaselineModeDir $baselineDir
  if ($b.state -eq 'pending') {
    Write-Host "Baseline: pending"
  }
  elseif ($b.state -eq 'empty') {
    Write-Host "Baseline: started (no timestamped run dir yet)"
  }
  else {
    $stagesText = if ($b.stagesDone.Count -gt 0) { ($b.stagesDone -join ',') } else { 'none' }
    Write-Host ("Baseline: " + $b.jsonCount + " snapshot json (" + $stagesText + ")")
    Write-Host ("  runDir: " + $b.runDirName)
    if ($b.latestFile) {
      Write-Host ("  latest: " + $b.latestFile.Name + " (" + [math]::Round($b.latestFile.Length/1KB,1) + " KB)")
    }
  }

  Write-Host ""
  Write-Host "-- dev-server.err.log (tail) --"
  $err = Join-Path $logDir 'dev-server.err.log'
  if (Test-Path $err) { Get-Content $err -Tail 20 } else { Write-Host "(missing)" }

  Write-Host ""
  Write-Host "-- dev-server.out.log (tail) --"
  $out = Join-Path $logDir 'dev-server.out.log'
  if (Test-Path $out) { Get-Content $out -Tail 10 } else { Write-Host "(missing)" }

  Write-Host "\n(Press Ctrl+C to stop)"
  Start-Sleep -Seconds $IntervalSec
}
