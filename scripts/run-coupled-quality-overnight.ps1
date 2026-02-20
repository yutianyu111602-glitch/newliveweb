param(
  [string]$Packs = "ai_generated_coupled_final,ai_generated_coupled",
  [string]$RunStamp = "",
  [string]$SrcBase = "D:\\aidata",
  [switch]$Sync,
  [switch]$CleanDest,

  [string]$EliteDir = "D:\\aidata\\AIVJ_FINAL_ELITE",

  # Headless eval
  [double]$TargetCoverage = 0.99,
  [double]$MaxHours = 10,
  [int]$ReloadEvery = 800,
  [ValidateSet("random","shuffle","weighted")]
  [string]$EvalPickMode = "shuffle",
  [int]$DownsampleSize = 12,
  [int]$IntervalMs = 250,
  [int]$WarmupSamples = 2,
  [int]$MeasureSamples = 6,
  [ValidateSet("off","safe","force-d3d11")]
  [string]$GpuMode = "safe",
  [switch]$Headed,
  [switch]$ResumeEval,

  # Training
  [int]$Epochs = 20,
  [int]$BatchSize = 256,
  [double]$LearningRate = 0.001,
  [double]$ExtraEvalWeight = 0.35,
  [int]$NegSamples = 50000,
  [double]$NegWeight = 0.20,
  [int]$NegMinPairDistance = 50,
  [double]$MinQualityStd = 0.03,

  # Verify
  [string]$HostName = "127.0.0.1",
  [string]$Port = "auto",
  [string]$VerifyPack = "ai_generated_coupled_final",
  [int]$HardTimeoutMs = 900000,
  [switch]$SkipVerify,
  [switch]$CleanupStale,
  [switch]$DryRun,
  [switch]$EvalOnly
)

$ErrorActionPreference = "Stop"

function Split-CsvUnique([string]$s) {
  return @($s -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packsList = Split-CsvUnique $Packs
if (!$packsList.Count) { throw "No packs specified" }

$stamp = if ($RunStamp) { $RunStamp } else { Get-Date -Format "yyyy-MM-dd_HHmmss" }
Write-Host "[overnight] stamp=$stamp"

$syncScript = Join-Path $projectRoot "scripts\\sync-aidata-packs.mjs"
$evalScript = Join-Path $projectRoot "scripts\\headless-eval-coupled-pairs.mjs"
$trainer = Join-Path $projectRoot "python\\unified_coupling_trainer.py"
$cleanupScript = Join-Path $projectRoot "scripts\\kill-stale-headless-browsers.ps1"

if (!(Test-Path $trainer)) { throw "Missing trainer: $trainer" }
if (!(Test-Path $evalScript)) { throw "Missing eval script: $evalScript" }

# P0: Git worktree guard — warn if unexpected files are dirty
try {
  $guardScript = Join-Path $PSScriptRoot "guard-git-status.ps1"
  if (Test-Path $guardScript) {
    & $guardScript
  }
} catch {
  Write-Host "[overnight] WARNING: git guard check failed: $_" -ForegroundColor Yellow
}

Write-Host "[overnight] projectRoot=$projectRoot"
Write-Host "[overnight] packs=$($packsList -join ',')"
if ($CleanupStale) {
  if (Test-Path $cleanupScript) {
    Write-Host "[overnight] cleanup stale headless browsers"
    & $cleanupScript
  } else {
    Write-Host "[overnight] WARNING: cleanup script missing: $cleanupScript"
  }
}

if ($Sync) {
  if (!(Test-Path $syncScript)) { throw "Missing sync script: $syncScript" }
  $destBase = Join-Path $projectRoot "public\\presets"
  foreach ($pack in $packsList) {
    $srcManifest = Join-Path (Join-Path $SrcBase $pack) "manifest.jsonl"
    if (!(Test-Path $srcManifest)) { throw "Missing source manifest.jsonl: $srcManifest" }
  }

  Push-Location $projectRoot
  try {
    foreach ($pack in $packsList) {
      Write-Host "[sync] pack=$pack srcBase=$SrcBase destBase=$destBase cleanDest=$CleanDest"
      $args = @($syncScript, "--srcBase", $SrcBase, "--destBase", $destBase, "--pack", $pack)
      if ($CleanDest) { $args += "--cleanDest" }
      node @args
      if ($LASTEXITCODE -ne 0) { throw "sync-aidata-packs failed exit=$LASTEXITCODE pack=$pack" }
    }
  } finally {
    Pop-Location
  }
} else {
  foreach ($pack in $packsList) {
    $pairsManifest = Join-Path $projectRoot ("public\\presets\\{0}\\pairs-manifest.v0.json" -f $pack)
    if (!(Test-Path $pairsManifest)) { throw "Missing pairs manifest (run with -Sync): $pairsManifest" }
  }
}

$outDir = Join-Path $projectRoot ("artifacts\\coupled-eval\\overnight-{0}" -f $stamp)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "[eval] outDir=$outDir"
Write-Host "[eval] targetCoverage=$TargetCoverage maxHours=$MaxHours reloadEvery=$ReloadEvery"
Write-Host "[eval] coupledPick=$EvalPickMode"
if ($GpuMode -ne "off" -and -not $Headed) {
  Write-Host "[eval] WARNING: headless Chromium on Windows often falls back to SwiftShader (CPU). Use -Headed for real RTX GPU rendering."
}

# v4 hardened defaults: only inject when running the single coupled-final pack
# and the caller hasn't already set overrides via env
$isCoupledFinalOnly = ($packsList.Count -eq 1 -and $packsList[0] -eq "ai_generated_coupled_final")
if ($isCoupledFinalOnly) {
  if (-not $env:COUPLED_SMOKE_PAIRS_MANIFEST) {
    $env:COUPLED_SMOKE_PAIRS_MANIFEST = "pairs-manifest.filtered.current.json"
  }
  if (-not $env:COUPLED_SMOKE_MOTION_MIN) {
    $env:COUPLED_SMOKE_MOTION_MIN = "0.00001"
  }
  if (-not $env:COUPLED_SMOKE_LUMA_MIN) {
    $env:COUPLED_SMOKE_LUMA_MIN = "0.06"
  }
  Write-Host "[eval] v4 env: manifest=$($env:COUPLED_SMOKE_PAIRS_MANIFEST) motionMin=$($env:COUPLED_SMOKE_MOTION_MIN) lumaMin=$($env:COUPLED_SMOKE_LUMA_MIN)"
} else {
  Write-Host "[eval] multi-pack or non-coupled-final → skipping v4 env injection (packs=$($packsList -join ','))"  if (!$DryRun -and $packsList.Count -gt 1) {
    Write-Host "[eval] NOTE: multi-pack mode uses default pairs-manifest.v0.json. Pass -PairsManifest env to override." -ForegroundColor Yellow
  }
}

# --- DryRun: print plan and exit ---
if ($DryRun) {
  Write-Host ""
  Write-Host "========== DRY RUN PLAN ==========" -ForegroundColor Cyan
  Write-Host "  stamp:            $stamp"
  Write-Host "  packs:            $($packsList -join ',')"
  Write-Host "  outDir:           $outDir"
  Write-Host "  isCoupledFinal:   $isCoupledFinalOnly"
  Write-Host "  v4 env injected:  $isCoupledFinalOnly"
  Write-Host "  manifest:         $(if ($env:COUPLED_SMOKE_PAIRS_MANIFEST) { $env:COUPLED_SMOKE_PAIRS_MANIFEST } else { 'pairs-manifest.v0.json' })"
  Write-Host "  motionMin:        $(if ($env:COUPLED_SMOKE_MOTION_MIN) { $env:COUPLED_SMOKE_MOTION_MIN } else { 'default' })"
  Write-Host "  lumaMin:          $(if ($env:COUPLED_SMOKE_LUMA_MIN) { $env:COUPLED_SMOKE_LUMA_MIN } else { 'default' })"
  Write-Host "  targetCoverage:   $TargetCoverage"
  Write-Host "  maxHours:         $MaxHours"
  Write-Host "  gpuMode:          $GpuMode"
  Write-Host "  headed:           $Headed"
  Write-Host "  evalPickMode:     $EvalPickMode"
  Write-Host "  trainer:          $trainer"
  Write-Host "  epochs:           $Epochs"
  Write-Host "  skipVerify:       $SkipVerify"
  Write-Host "  evalOnly:         $EvalOnly"
  Write-Host "  verifyPack:       $VerifyPack"
  foreach ($pack in $packsList) {
    $pm = Join-Path $projectRoot ("public\\presets\\{0}\\pairs-manifest.v0.json" -f $pack)
    $exists = Test-Path $pm
    Write-Host "  manifest[$pack]:  $pm (exists=$exists)"
  }
  Write-Host "===================================" -ForegroundColor Cyan
  Write-Host "[overnight] DryRun complete — no eval/train/verify executed."
  exit 0}

Push-Location $projectRoot
try {
  $evalArgs = @(
    $evalScript,
    "--packs", ($packsList -join ","),
    "--host", $HostName,
    "--vitePort", [string]$Port,
    "--coupledPick", $EvalPickMode,
    "--gpuMode", $GpuMode,
    "--targetCoverage", [string]$TargetCoverage,
    "--maxHours", [string]$MaxHours,
    "--outDir", $outDir,
    "--reloadEvery", [string]$ReloadEvery,
    "--downsampleSize", [string]$DownsampleSize,
    "--intervalMs", [string]$IntervalMs,
    "--warmupSamples", [string]$WarmupSamples,
    "--measureSamples", [string]$MeasureSamples,
    "--audioRoot", "D:/CloudMusic",
    "--requireAudio"
  )
  if ($ResumeEval) {
    $evalArgs += "--resume"
    Write-Host "[eval] resume=1 (continue in existing outDir)"
  }
  if ($Headed) {
    $evalArgs += "--headed"
    # Headed runs are for real GPU WebGL; maximize so the canvas fills the display and is easy to monitor.
    $evalArgs += "--startMaximized"
  }
  node @evalArgs
  if ($LASTEXITCODE -ne 0) { throw "headless eval failed exit=$LASTEXITCODE" }
} finally {
  Pop-Location
}

$evalJsonl = Join-Path $outDir "eval.jsonl"
if (!(Test-Path $evalJsonl)) { throw "Missing eval jsonl: $evalJsonl" }

# --- P3: Generate run-summary.json (eval gate — fail stops training) ---
$summaryPath = Join-Path $outDir "run-summary.json"
$metaPath = Join-Path $outDir "meta.json"
$evalMeta = $null
$evalFailed = $false
try {
  if (Test-Path $metaPath) {
    $evalMeta = Get-Content $metaPath -Raw | ConvertFrom-Json
  }
} catch {}

$summary = [ordered]@{
  generatedAt     = (Get-Date -Format "o")
  stamp           = $stamp
  inputs          = [ordered]@{
    packs           = $packsList
    manifestFile    = if ($env:COUPLED_SMOKE_PAIRS_MANIFEST) { $env:COUPLED_SMOKE_PAIRS_MANIFEST } else { "pairs-manifest.v0.json" }
    motionMin       = if ($env:COUPLED_SMOKE_MOTION_MIN) { [double]$env:COUPLED_SMOKE_MOTION_MIN } else { 0.000015 }
    lumaMin         = if ($env:COUPLED_SMOKE_LUMA_MIN) { [double]$env:COUPLED_SMOKE_LUMA_MIN } else { 0.06 }
    viteHost        = $HostName
    vitePortMode    = $Port
    gpuMode         = $GpuMode
    headed          = [bool]$Headed
    coupledPick     = $EvalPickMode
    targetCoverage  = $TargetCoverage
    maxHours        = $MaxHours
  }
  env             = [ordered]@{
    nodeVersion       = & { try { (node --version) } catch { "unknown" } }
    playwrightVersion = & { try { (node -e "console.log(require('@playwright/test/package.json').version)") } catch { "unknown" } }
    webglRenderer     = if ($evalMeta -and $evalMeta.runtime -and $evalMeta.runtime.webgl) { $evalMeta.runtime.webgl.renderer } else { "unknown" }
    os                = [System.Environment]::OSVersion.VersionString
  }
}

# Read eval.jsonl to compute quality metrics
$evalLines = @()
try {
  $evalLines = Get-Content $evalJsonl -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\{" } |
    ForEach-Object { $_ | ConvertFrom-Json }
} catch {}

if ($evalLines.Count -gt 0) {
  $okCount = ($evalLines | Where-Object { $_.okHeuristic -eq $true }).Count
  $tooDark = ($evalLines | Where-Object { $_.reasons -and ($_.reasons -contains "too-dark") }).Count
  $lowMotion = ($evalLines | Where-Object { $_.reasons -and ($_.reasons -contains "low-motion") }).Count
  $total = $evalLines.Count
  $summary["outputs"] = [ordered]@{
    totalSamples  = $total
    okRate        = [Math]::Round($okCount / $total, 4)
    tooDarkPct    = [Math]::Round($tooDark / $total, 4)
    lowMotionPct  = [Math]::Round($lowMotion / $total, 4)
    evalExitCode  = 0
  }
} else {
  $evalFailed = $true
  $summary["outputs"] = [ordered]@{
    totalSamples = 0
    okRate       = 0
    tooDarkPct   = 0
    lowMotionPct = 0
    evalExitCode = 1
  }
}

# Check for eval failure
if ($evalMeta -and $evalMeta.error) {
  $evalFailed = $true
  $summary["failure"] = [ordered]@{
    code    = $evalMeta.error.code
    message = if ($evalMeta.error.message) { $evalMeta.error.message.Substring(0, [Math]::Min(500, $evalMeta.error.message.Length)) } else { "" }
    lastUrl = $evalMeta.error.lastUrl
  }
}

# Write summary
$summary | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryPath -Encoding UTF8
Write-Host "[overnight] run-summary.json written: $summaryPath"

# Quality gate: abort if eval failed or okRate is too low
if ($evalFailed) {
  Write-Host "[overnight] GATE FAILED: eval produced an error. Skipping training." -ForegroundColor Red
  Write-Host "[overnight] error.code = $($evalMeta.error.code)" -ForegroundColor Red
  exit 1
}

$okRate = $summary["outputs"]["okRate"]
if ($okRate -lt 0.10) {
  Write-Host "[overnight] GATE FAILED: okRate=$okRate < 0.10. Eval quality too low for training." -ForegroundColor Red
  exit 1
}
Write-Host "[overnight] GATE PASSED: okRate=$okRate" -ForegroundColor Green

# --- EvalOnly: stop after eval + gate ---
if ($EvalOnly) {
  Write-Host "[overnight] EvalOnly mode \u2014 skipping training and verify."
  Write-Host "[overnight] run-summary.json: $summaryPath"
  exit 0
}

$scoreManifests = @()
foreach ($pack in $packsList) {
  $pairsManifest = Join-Path $projectRoot ("public\\presets\\{0}\\pairs-manifest.v0.json" -f $pack)
  if (!(Test-Path $pairsManifest)) { throw "Missing pairs manifest: $pairsManifest" }
  $scoreManifests += $pairsManifest
}
$scoreManifestsCsv = ($scoreManifests -join ",")

Write-Host "[train] epochs=$Epochs batch=$BatchSize lr=$LearningRate"
Write-Host "[train] extraEvalWeight=$ExtraEvalWeight negSamples=$NegSamples negWeight=$NegWeight negMinPairDistance=$NegMinPairDistance"
Write-Host "[train] minQualityStd=$MinQualityStd"

Push-Location $projectRoot
try {
  python $trainer `
    --elite-dir $EliteDir `
    --output-dir (Join-Path $projectRoot "outputs\\coupling") `
    --epochs $Epochs `
    --batch-size $BatchSize `
    --learning-rate $LearningRate `
    --extra-eval-jsonl $evalJsonl `
    --extra-eval-weight $ExtraEvalWeight `
    --neg-samples $NegSamples `
    --neg-weight $NegWeight `
    --neg-min-pair-distance $NegMinPairDistance `
    --score-manifests $scoreManifestsCsv `
    --min-quality-std $MinQualityStd `
    --project-root $projectRoot
  if ($LASTEXITCODE -ne 0) { throw "trainer failed exit=$LASTEXITCODE" }
} finally {
  Pop-Location
}

if ($SkipVerify) {
  Write-Host "[verify] skip"
  Write-Host "[overnight] OK"
  exit 0
}

$verifyOutDir = Join-Path $projectRoot ("artifacts\\headless-coupled\\overnight-{0}" -f $stamp)
New-Item -ItemType Directory -Force -Path $verifyOutDir | Out-Null

$base = "http://${HostName}:${Port}/"
$env:VERIFY_URL = "${base}?coupled=1&coupledPack=${VerifyPack}"
$env:VERIFY_OUT_DIR = $verifyOutDir
$env:VERIFY_HARD_TIMEOUT_MS = [string]$HardTimeoutMs

Write-Host "[verify] VERIFY_URL=$($env:VERIFY_URL)"
Write-Host "[verify] VERIFY_OUT_DIR=$($env:VERIFY_OUT_DIR)"
Write-Host "[verify] VERIFY_HARD_TIMEOUT_MS=$($env:VERIFY_HARD_TIMEOUT_MS)"


# If eval ran in headed GPU mode, also run verify in headed GPU mode.
# This avoids SwiftShader (software WebGL) on some Windows desktops.
$hadVerifyGpu = Test-Path Env:VERIFY_GPU
$prevVerifyGpu = $env:VERIFY_GPU
$hadVerifyGpuMode = Test-Path Env:VERIFY_GPU_MODE
$prevVerifyGpuMode = $env:VERIFY_GPU_MODE
$hadVerifyMuteAudio = Test-Path Env:VERIFY_MUTE_AUDIO
$prevVerifyMuteAudio = $env:VERIFY_MUTE_AUDIO
try {
  if ($Headed) {
    $env:VERIFY_GPU = "1"
    $env:VERIFY_GPU_MODE = "safe"
    $env:VERIFY_MUTE_AUDIO = "1"
    Write-Host "[verify] GPU enabled (VERIFY_GPU=1 VERIFY_GPU_MODE=safe) because -Headed was set"
  }

  npm --prefix $projectRoot run verify:dev
  $verifyExitCode = $LASTEXITCODE
  if ($verifyExitCode -ne 0) { Write-Host "[verify] verify:dev failed exit=$verifyExitCode" -ForegroundColor Yellow }
} finally {
  if ($hadVerifyGpu) { $env:VERIFY_GPU = $prevVerifyGpu } else { Remove-Item Env:VERIFY_GPU -ErrorAction SilentlyContinue }
  if ($hadVerifyGpuMode) { $env:VERIFY_GPU_MODE = $prevVerifyGpuMode } else { Remove-Item Env:VERIFY_GPU_MODE -ErrorAction SilentlyContinue }
  if ($hadVerifyMuteAudio) { $env:VERIFY_MUTE_AUDIO = $prevVerifyMuteAudio } else { Remove-Item Env:VERIFY_MUTE_AUDIO -ErrorAction SilentlyContinue }
}

# --- P3: Update run-summary.json with training+verify results ---
try {
  if (Test-Path $summaryPath) {
    $finalSummary = Get-Content $summaryPath -Raw | ConvertFrom-Json
  } else {
    $finalSummary = [ordered]@{}
  }
  $finalSummary | Add-Member -NotePropertyName "completedAt" -NotePropertyValue (Get-Date -Format "o") -Force
  $finalSummary | Add-Member -NotePropertyName "training" -NotePropertyValue ([ordered]@{
    epochs   = $Epochs
    batchSize = $BatchSize
    lr       = $LearningRate
    exitCode = 0
  }) -Force
  $finalSummary | Add-Member -NotePropertyName "verify" -NotePropertyValue ([ordered]@{
    pack     = $VerifyPack
    exitCode = $verifyExitCode
    outDir   = $verifyOutDir
  }) -Force

  # Overall gate decision
  $gateOkRate = if ($finalSummary.outputs -and $finalSummary.outputs.okRate) { $finalSummary.outputs.okRate } else { 0 }
  $gatePassed = ($gateOkRate -ge 0.10) -and ($verifyExitCode -eq 0)
  $finalSummary | Add-Member -NotePropertyName "gate" -NotePropertyValue ([ordered]@{
    passed   = $gatePassed
    okRate   = $gateOkRate
    verifyOk = ($verifyExitCode -eq 0)
  }) -Force

  $finalSummary | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryPath -Encoding UTF8
  Write-Host "[overnight] run-summary.json updated with training+verify results"
} catch {
  Write-Host "[overnight] WARNING: failed to update run-summary.json: $_" -ForegroundColor Yellow
}

if ($verifyExitCode -ne 0) {
  Write-Host "[overnight] DONE with verify failure (exit=$verifyExitCode)" -ForegroundColor Yellow
  exit $verifyExitCode
}

Write-Host "[overnight] OK"
