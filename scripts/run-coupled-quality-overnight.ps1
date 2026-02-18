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
  [switch]$CleanupStale
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
  Write-Host "[eval] multi-pack or non-coupled-final → skipping v4 env injection (packs=$($packsList -join ','))"
}

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
  if ($LASTEXITCODE -ne 0) { throw "verify:dev failed exit=$LASTEXITCODE" }
} finally {
  if ($hadVerifyGpu) { $env:VERIFY_GPU = $prevVerifyGpu } else { Remove-Item Env:VERIFY_GPU -ErrorAction SilentlyContinue }
  if ($hadVerifyGpuMode) { $env:VERIFY_GPU_MODE = $prevVerifyGpuMode } else { Remove-Item Env:VERIFY_GPU_MODE -ErrorAction SilentlyContinue }
  if ($hadVerifyMuteAudio) { $env:VERIFY_MUTE_AUDIO = $prevVerifyMuteAudio } else { Remove-Item Env:VERIFY_MUTE_AUDIO -ErrorAction SilentlyContinue }
}

Write-Host "[overnight] OK"
