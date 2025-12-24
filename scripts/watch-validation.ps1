#!/usr/bin/env pwsh
# watch-validation.ps1 - Monitor validation progress without blocking

param(
  [int]$IntervalSec = 30,
  [int]$MaxWaitMin = 20
)

$deadline = (Get-Date).AddMinutes($MaxWaitMin)

Write-Host "Monitoring validation progress (max ${MaxWaitMin}min, check every ${IntervalSec}s)..."
Write-Host ""

while ((Get-Date) -lt $deadline) {
  $latest = Get-ChildItem "c:\Users\pc\code\newliveweb\artifacts\headless-runs" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1

  if ($latest) {
    $runId = $latest.Name
    $reportJson = Join-Path $latest.FullName "verify\report.json"
    $baselineDir = Join-Path $latest.FullName "baseline-a0\direct"

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Latest run: $runId"

    if (Test-Path $reportJson) {
      Write-Host "  ✓ verify/report.json exists"
      try {
        $report = Get-Content $reportJson | ConvertFrom-Json
        Write-Host "    criticalOk=$($report.criticalOk), framesRendered=$($report.framesRendered)"
      } catch {
        Write-Host "    (parsing failed)"
      }
    } else {
      Write-Host "  - verify/report.json not yet written"
    }

    if (Test-Path $baselineDir) {
      $baselineFiles = Get-ChildItem $baselineDir -File | Measure-Object
      Write-Host "  ✓ baseline-a0/direct/ exists ($($baselineFiles.Count) files)"
    } else {
      Write-Host "  - baseline-a0/direct/ not yet created"
    }
  } else {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] No runs found yet"
  }

  Write-Host ""
  Start-Sleep -Seconds $IntervalSec
}

Write-Host "Watch timeout reached."
