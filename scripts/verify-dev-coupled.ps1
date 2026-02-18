# verify-dev-coupled.ps1 — Smoke test for coupled pairs eval pipeline.
# Default maxHours is 0.15 (9 min), supports env override via COUPLED_SMOKE_MAX_HOURS.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-dev-coupled.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-dev-coupled.ps1 -Pack ai_generated_coupled_final -TargetSamples 5 -MaxHours 0.2

param(
  [string]$Pack = "ai_generated_coupled_final",
  [string]$HostName = "127.0.0.1",
  [string]$VitePort = "auto",
  [string]$OutDir = "",
  [int]$TargetSamples = 5,
  [double]$MaxHours = 0.15,
  [string]$AudioMode = "click",
  [string]$PairsManifest = "",
  [double]$MotionMin = 0,
  [double]$LumaMin = 0,
  [switch]$Headed = $false
)

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir "..")

# Allow env override for maxHours (CI/automation friendly)
if ($env:COUPLED_SMOKE_MAX_HOURS) {
  try {
    $MaxHours = [double]$env:COUPLED_SMOKE_MAX_HOURS
    Write-Host "[verify:dev coupled] maxHours overridden by env: $MaxHours"
  } catch {
    Write-Host "[verify:dev coupled] WARNING: invalid COUPLED_SMOKE_MAX_HOURS='$($env:COUPLED_SMOKE_MAX_HOURS)'; using default $MaxHours"
  }
}
if ($env:COUPLED_SMOKE_PAIRS_MANIFEST -and -not $PairsManifest) {
  $PairsManifest = $env:COUPLED_SMOKE_PAIRS_MANIFEST
  Write-Host "[verify:dev coupled] pairsManifest overridden by env: $PairsManifest"
}
if ($env:COUPLED_SMOKE_MOTION_MIN -and $MotionMin -eq 0) {
  try {
    $MotionMin = [double]$env:COUPLED_SMOKE_MOTION_MIN
    Write-Host "[verify:dev coupled] motionMin overridden by env: $MotionMin"
  } catch {}
}
if ($env:COUPLED_SMOKE_LUMA_MIN -and $LumaMin -eq 0) {
  try {
    $LumaMin = [double]$env:COUPLED_SMOKE_LUMA_MIN
    Write-Host "[verify:dev coupled] lumaMin overridden by env: $LumaMin"
  } catch {}
}

# Default outDir with timestamp
if (-not $OutDir) {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $OutDir = Join-Path $rootDir "artifacts/_smoke_coupled_$ts"
}

$evalScript = Join-Path $rootDir "scripts/headless-eval-coupled-pairs.mjs"
if (-not (Test-Path $evalScript)) {
  Write-Host "[verify:dev coupled] FAIL: eval script not found: $evalScript"
  exit 1
}

Write-Host "[verify:dev coupled] smoke: maxHours input=$MaxHours pack=$Pack targetSamples=$TargetSamples"
Write-Host "[verify:dev coupled] outDir=$OutDir"

try {
  Push-Location $rootDir

  $nodeArgs = @(
    $evalScript,
    "--pack", $Pack,
    "--host", $HostName,
    "--vitePort", $VitePort,
    "--targetSamples", "$TargetSamples",
    "--maxHours", "$MaxHours",
    "--audioMode", $AudioMode,
    "--viewportWidth", "960",
    "--viewportHeight", "540",
    "--deviceScaleFactor", "1",
    "--gpuMode", "safe",
    "--outDir", $OutDir
  )
  if ($Headed) {
    $nodeArgs += "--headed"
    $nodeArgs += "--startMaximized"
  }
  if ($PairsManifest) {
    $nodeArgs += @("--pairsManifest", $PairsManifest)
  }
  if ($MotionMin -gt 0) {
    $nodeArgs += @("--motionMin", "$MotionMin")
  }
  if ($LumaMin -gt 0) {
    $nodeArgs += @("--lumaMin", "$LumaMin")
  }

  & node @nodeArgs
  $code = $LASTEXITCODE

  Pop-Location

  # Read meta.json for summary
  $metaPath = Join-Path $OutDir "meta.json"
  if (Test-Path $metaPath) {
    $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
    $budget = $meta.budget
    $timing = $meta.timing
    $progress = $meta.progress.$Pack

    $inputH = if ($null -ne $budget.inputMaxHours) { $budget.inputMaxHours } else { "?" }
    $effectiveH = if ($null -ne $budget.effectiveMaxHours) { $budget.effectiveMaxHours } else { "?" }
    $clamped = if ($null -ne $budget.wasClamped) { $budget.wasClamped } else { "?" }
    $elapsed = if ($null -ne $timing.elapsedSec) { [Math]::Round($timing.elapsedSec, 1) } else { "?" }
    $navTimeout = if ($null -ne $timing.navTimeoutCount) { $timing.navTimeoutCount } else { 0 }
    $navMs = if ($null -ne $timing.navTotalMs) { $timing.navTotalMs } else { 0 }
    $restarts = if ($null -ne $timing.browserRestartCount) { $timing.browserRestartCount } else { 0 }
    $restartMs = if ($null -ne $timing.restartTotalMs) { $timing.restartTotalMs } else { 0 }
    $samples = if ($null -ne $progress.iter) { $progress.iter } else { 0 }
    $target = if ($null -ne $progress.target) { $progress.target } else { $TargetSamples }
    $done = if ($null -ne $progress.done) { $progress.done } else { $false }

    Write-Host ""
    Write-Host "[verify:dev coupled] === SUMMARY ==="
    Write-Host "  samples=$samples/$target elapsed=${elapsed}s navTimeout=$navTimeout (${navMs}ms) restarts=$restarts (${restartMs}ms)"
    Write-Host "  budget: input=$inputH effective=$effectiveH clamped=$clamped"
    Write-Host "  done=$done"
  }

  if ($code -ne 0) {
    Write-Host "[verify:dev coupled] FAILED exit=$code"
    exit 1
  }

  Write-Host "[verify:dev coupled] OK"
  exit 0
} catch {
  Write-Host "[verify:dev coupled] ERROR $($_.Exception.Message)"
  exit 1
}
