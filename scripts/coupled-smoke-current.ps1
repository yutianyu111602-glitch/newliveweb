# coupled-smoke-current.ps1 — "Zero-brain" entry point for coupled smoke test.
# Uses pairs-manifest.filtered.current.json with v4 defaults.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\coupled-smoke-current.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\coupled-smoke-current.ps1 -TargetSamples 120

param(
  [int]$TargetSamples = 60,
  [double]$MotionMin = 0.00001,
  [double]$LumaMin = 0.06,
  [string]$PairsManifest = "pairs-manifest.filtered.current.json",
  [string]$AudioMode = "file",
  [string]$AudioRoot = "D:\CloudMusic",
  [string]$ViteHost = "127.0.0.1",
  [int]$GotoTimeoutMs = 30000,
  [int]$ViteReadyTimeoutMs = 90000,
  [switch]$Headed = $true,
  [switch]$KillStale = $true,
  [double]$MaxHours = 0.4
)

$ErrorActionPreference = "Stop"

# Kill stale vite/node/chromium from previous runs
if ($KillStale) {
  $staleProcs = Get-Process -Name "node","chromium" -ErrorAction SilentlyContinue |
    Where-Object { $_.Id -ne $PID }
  if ($staleProcs) {
    Write-Host "[smoke] Killing $($staleProcs.Count) stale process(es): $($staleProcs.Name -join ', ')"
    $staleProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
}

$env:COUPLED_SMOKE_PAIRS_MANIFEST = $PairsManifest
$env:COUPLED_SMOKE_MOTION_MIN     = ("{0:0.############}" -f $MotionMin)
$env:COUPLED_SMOKE_LUMA_MIN       = ("{0:0.############}" -f $LumaMin)

$headedArgs = @()
if ($Headed) {
  $headedArgs = @("-Headed")
}

# --- Attempt 1: primary host ---
Write-Host "[smoke] Attempt 1: host=$ViteHost gotoTimeoutMs=$GotoTimeoutMs viteReadyTimeoutMs=$ViteReadyTimeoutMs"
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-dev-coupled.ps1" `
  -AudioMode $AudioMode `
  -AudioRoot $AudioRoot `
  -HostName $ViteHost `
  -GotoTimeoutMs $GotoTimeoutMs `
  -ViteReadyTimeoutMs $ViteReadyTimeoutMs `
  -TargetSamples $TargetSamples `
  -MaxHours $MaxHours @headedArgs
$attempt1 = $LASTEXITCODE

if ($attempt1 -ne 0) {
  # Check error code from the latest _release evidence
  $latestRelease = Get-ChildItem "$PSScriptRoot\..\artifacts\_release_*" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
  $errorCode = ""
  if ($latestRelease) {
    $relMeta = Join-Path $latestRelease.FullName "meta.json"
    if (Test-Path $relMeta) {
      try {
        $m = Get-Content $relMeta -Raw | ConvertFrom-Json
        $errorCode = if ($m.error -and $m.error.code) { $m.error.code } else { "" }
        Write-Host "[smoke] Attempt 1 failed: error.code=$errorCode" -ForegroundColor Yellow
      } catch {}
    }
  }

  # Auto-retry with alternate host if it looks like a connectivity issue
  $altHost = if ($ViteHost -eq "127.0.0.1") { "localhost" } elseif ($ViteHost -eq "localhost") { "127.0.0.1" } else { "" }
  $retryable = $errorCode -match "GOTO_TIMEOUT|VITE_NOT_READY|PLAYWRIGHT_CRASH|UNKNOWN"
  if ($altHost -and $retryable) {
    Write-Host "[smoke] Auto-retry: switching host $ViteHost -> $altHost" -ForegroundColor Cyan

    # Kill stale processes before retry
    $staleRetry = Get-Process -Name "node","chromium" -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -ne $PID }
    if ($staleRetry) {
      $staleRetry | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
    }

    powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-dev-coupled.ps1" `
      -AudioMode $AudioMode `
      -AudioRoot $AudioRoot `
      -HostName $altHost `
      -GotoTimeoutMs $GotoTimeoutMs `
      -ViteReadyTimeoutMs $ViteReadyTimeoutMs `
      -TargetSamples $TargetSamples `
      -MaxHours $MaxHours @headedArgs
    $attempt2 = $LASTEXITCODE

    if ($attempt2 -ne 0) {
      Write-Host "[smoke] Both attempts failed. Running diagnostics..." -ForegroundColor Red
      powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\diagnose-vite-connection.ps1" -Port 5174 2>&1 |
        Tee-Object -FilePath (Join-Path $latestRelease.FullName "diagnostics.txt") -ErrorAction SilentlyContinue
      exit 1
    }
  } else {
    Write-Host "[smoke] Not retryable (error.code=$errorCode). Running diagnostics..." -ForegroundColor Red
    if ($latestRelease) {
      powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\diagnose-vite-connection.ps1" -Port 5174 2>&1 |
        Tee-Object -FilePath (Join-Path $latestRelease.FullName "diagnostics.txt") -ErrorAction SilentlyContinue
    }
    exit 1
  }
}

Write-Host "[smoke] PASS" -ForegroundColor Green

# --- Fixed summary block (copy-paste friendly) ---
$finalRelease = Get-ChildItem "$PSScriptRoot\..\artifacts\_release_*" -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if ($finalRelease) {
  $fMeta = $null
  $fMetaPath = Join-Path $finalRelease.FullName "meta.json"
  if (Test-Path $fMetaPath) {
    try { $fMeta = Get-Content $fMetaPath -Raw | ConvertFrom-Json } catch {}
  }
  $fCode     = if ($fMeta -and $fMeta.error) { $fMeta.error.code } else { "none" }
  $fRenderer = if ($fMeta -and $fMeta.runtime -and $fMeta.runtime.webgl) { $fMeta.runtime.webgl.renderer } else { "unknown" }
  $fNavTO    = if ($fMeta -and $fMeta.timing) { $fMeta.timing.navTimeoutCount } else { 0 }
  $fRestart  = if ($fMeta -and $fMeta.timing) { $fMeta.timing.browserRestartCount } else { 0 }
  $fElapsed  = if ($fMeta -and $fMeta.timing -and $fMeta.timing.elapsedSec) { [Math]::Round($fMeta.timing.elapsedSec, 1) } else { "?" }
  # Count eval lines
  $fEvalPath = Join-Path $finalRelease.FullName "eval.jsonl"
  $fSamples  = 0
  $fOkCount  = 0
  if (Test-Path $fEvalPath) {
    $evalLines = Get-Content $fEvalPath -ErrorAction SilentlyContinue | Where-Object { $_ -match "^\{" }
    $fSamples = $evalLines.Count
    foreach ($line in $evalLines) {
      try { $obj = $line | ConvertFrom-Json; if ($obj.okHeuristic -eq $true) { $fOkCount++ } } catch {}
    }
  }
  $fOkRate = if ($fSamples -gt 0) { [Math]::Round($fOkCount / $fSamples, 3) } else { 0 }
  Write-Host ""
  Write-Host "========== SMOKE SUMMARY ==========" -ForegroundColor Cyan
  Write-Host "  result:           PASS"
  Write-Host "  error.code:       $fCode"
  Write-Host "  vitePort:         5174"
  Write-Host "  host:             $ViteHost"
  Write-Host "  webgl.renderer:   $fRenderer"
  Write-Host "  samples:          $fSamples (okRate=$fOkRate)"
  Write-Host "  navTimeoutCount:  $fNavTO"
  Write-Host "  browserRestarts:  $fRestart"
  Write-Host "  elapsed:          ${fElapsed}s"
  Write-Host "  evidenceDir:      $($finalRelease.FullName)"
  Write-Host "===================================" -ForegroundColor Cyan
}
