# coupled-negative-manifest-mismatch.ps1 — Negative test: proves MANIFEST_MISMATCH fires.
# Creates a bad manifest (one pair removed), starts eval, swaps file mid-flight,
# and verifies the assertion fires.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\coupled-negative-manifest-mismatch.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\coupled-negative-manifest-mismatch.ps1 -RemovedPair 1644

param(
  [int]$RemovedPair = 68,
  [int]$TargetSamples = 30,
  [double]$MotionMin = 0.00001,
  [double]$LumaMin = 0.06,
  [string]$AudioRoot = "D:\CloudMusic",
  [double]$MaxHours = 0.25
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  Write-Host "[negative-test] Removing leftover node processes..."
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 2

  # Generate bad manifest (missing $RemovedPair)
  $v4Path = "public/presets/ai_generated_coupled_final/pairs-manifest.filtered.v4.json"
  $badPath = "public/presets/ai_generated_coupled_final/pairs-manifest.filtered.bad.json"

  $env:_NEG_REMOVED = "$RemovedPair"
  node -e "
    const fs = require('fs');
    const removed = parseInt(process.env._NEG_REMOVED, 10);
    const orig = JSON.parse(fs.readFileSync('$($v4Path -replace '\\','/')','utf8'));
    const bad = { ...orig, pairs: orig.pairs.filter(p => p.pair !== removed), keptPairs: orig.pairs.length - 1, generatedFrom: 'NEGATIVE TEST: removed pair ' + removed };
    fs.writeFileSync('$($badPath -replace '\\','/')', JSON.stringify(bad));
    console.log('[negative-test] bad.json: pairs=' + bad.pairs.length + ' removed=' + removed);
  "
  Remove-Item $env:_NEG_REMOVED -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force artifacts\_smoke_manifest_bad -ErrorAction SilentlyContinue

  # Start eval in background job (reads bad.json -> allowedPairIds = N-1)
  Write-Host "[negative-test] Starting eval with bad manifest..."
  $job = Start-Job -ScriptBlock {
    param($r, $ts, $mm, $lm, $ar, $mh)
    Push-Location $r
    & node scripts/headless-eval-coupled-pairs.mjs `
      --pack ai_generated_coupled_final `
      --pairsManifest pairs-manifest.filtered.bad.json `
      --motionMin $mm --lumaMin $lm `
      --targetSamples $ts --maxHours $mh `
      --audioMode file --audioRoot $ar `
      --headed `
      --outDir "artifacts/_smoke_manifest_bad"
  } -ArgumentList $root, $TargetSamples, $MotionMin, $LumaMin, $AudioRoot, $MaxHours

  # Wait 4s for eval to read manifest, then swap file to full v4 (31 pairs)
  Start-Sleep 4
  Copy-Item $v4Path $badPath -Force
  Write-Host "[negative-test] Swapped bad.json -> full v4 on disk at $(Get-Date -Format HH:mm:ss)"

  # Wait for eval to sample and (hopefully) hit the removed pair
  $maxWaitSec = 180
  $elapsed = 0
  $found = $false
  Write-Host "[negative-test] Waiting up to ${maxWaitSec}s for MANIFEST_MISMATCH..."

  while ($elapsed -lt $maxWaitSec) {
    Start-Sleep 10
    $elapsed += 10

    $viteLog = "artifacts\_smoke_manifest_bad\vite.log"
    if (Test-Path $viteLog) {
      $match = Select-String -Path $viteLog -Pattern "MANIFEST_MISMATCH" -SimpleMatch -ErrorAction SilentlyContinue
      if ($match) {
        Write-Host ""
        Write-Host "[negative-test] PASS: MANIFEST_MISMATCH fired after ${elapsed}s"
        Write-Host $match.Line
        $found = $true
        break
      }
    }

    # Check if job already finished (either crash or completed without mismatch)
    if ($job.State -eq "Completed" -or $job.State -eq "Failed") {
      $jobOut = Receive-Job $job -ErrorAction SilentlyContinue
      if ($jobOut) { Write-Host $jobOut }
      break
    }

    if ($elapsed % 30 -eq 0) {
      $evalLines = 0
      if (Test-Path "artifacts\_smoke_manifest_bad\eval.jsonl") {
        $evalLines = (Get-Content "artifacts\_smoke_manifest_bad\eval.jsonl" | Measure-Object).Count
      }
      Write-Host "[negative-test] ...waiting (${elapsed}s, samples=$evalLines)"
    }
  }

  # Cleanup
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  Remove-Item $badPath -Force -ErrorAction SilentlyContinue

  if ($found) {
    Write-Host "[negative-test] RESULT: PASS — assertion works"
    exit 0
  } else {
    Write-Host "[negative-test] RESULT: INCONCLUSIVE — pair $RemovedPair was not picked within ${maxWaitSec}s (probabilistic; retry or use a different pair)"
    exit 2
  }
} finally {
  Pop-Location
}
