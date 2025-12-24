param(
  [int]$Port = 5174,
  [string]$HostIp = "127.0.0.1",
  [string[]]$CaptureModes = @("direct"),
  [int]$BaselineDurationSec = 60,
  [int]$BaselineWarmupSec = 6,
  [int]$BaselineSampleIntervalMs = 1000,
  [string]$BaselineVideoSrc = "",
  [string]$BaselineS5DepthSource = "ws",
  [switch]$StartInBackground
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$runId = (Get-Date).ToString("yyyy-MM-ddTHH-mm-ss")
$outRoot = Join-Path $projectRoot (Join-Path "artifacts" (Join-Path "headless-runs" $runId))
$verifyDir = Join-Path $outRoot "verify"
$baselineRoot = Join-Path $outRoot "baseline-a0"
$logDir = Join-Path $outRoot "logs"

New-Item -ItemType Directory -Force -Path $verifyDir | Out-Null
New-Item -ItemType Directory -Force -Path $baselineRoot | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$jobLog = Join-Path $logDir "job.log"
$jobErr = Join-Path $logDir "job.err.log"
if (-not (Test-Path $jobLog)) { New-Item -ItemType File -Force -Path $jobLog | Out-Null }
if (-not (Test-Path $jobErr)) { New-Item -ItemType File -Force -Path $jobErr | Out-Null }

function Test-ViteServer {
  param([string]$Url)
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 400) { return $false }
    return ($resp.Content -match "@vite/client")
  }
  catch {
    return $false
  }
}

function Wait-ViteServer {
  param([string]$Url, [int]$TimeoutSec = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-ViteServer -Url $Url) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

$baseUrl = "http://$HostIp`:$Port/"

$scriptBlock = {
  param(
    [string]$ProjectRoot,
    [string]$BaseUrl,
    [string]$VerifyDir,
    [string]$BaselineRoot,
    [string]$LogDir,
    [string]$JobLog,
    [string]$JobErr,
    [string[]]$CaptureModes,
    [int]$BaselineDurationSec,
    [int]$BaselineWarmupSec,
    [int]$BaselineSampleIntervalMs,
    [string]$BaselineVideoSrc,
    [string]$BaselineS5DepthSource,
    [int]$Port,
    [string]$HostIp
  )

  $ErrorActionPreference = "Stop"

  function Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date).ToString("s"), $Msg
    Write-Host $line
    try { Add-Content -Path $JobLog -Value $line } catch {}
  }

  function Run-Step {
    param(
      [string]$Label,
      [scriptblock]$Cmd
    )

    Log "BEGIN: $Label"
    try {
      & $Cmd 1>> $JobLog 2>> $JobErr
    } finally {
      Log "END: $Label (exit=$LASTEXITCODE)"
    }
  }

  function Test-ViteServer {
    param([string]$Url)
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 400) { return $false }
      return ($resp.Content -match "@vite/client")
    }
    catch {
      return $false
    }
  }

  function Wait-ViteServer {
    param([string]$Url, [int]$TimeoutSec = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
      if (Test-ViteServer -Url $Url) { return $true }
      Start-Sleep -Milliseconds 500
    }
    return $false
  }

  $npmCmd = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
  if (-not $npmCmd) { $npmCmd = (Get-Command "npm" -ErrorAction Stop).Source }

  $reuseServer = $false
  if (Test-ViteServer -Url $BaseUrl) {
    $reuseServer = $true
    Log "Reusing existing Vite dev server: $BaseUrl"
  }

  $serverPid = $null
  if (-not $reuseServer) {
    Log "Spawning Vite dev server: $BaseUrl"

    # Spawn Vite via Node entrypoint (avoid cmd.exe prompts / npm indirection).
    $outLog = Join-Path $LogDir "dev-server.out.log"
    $errLog = Join-Path $LogDir "dev-server.err.log"

    $nodeCmd = (Get-Command "node.exe" -ErrorAction SilentlyContinue).Source
    if (-not $nodeCmd) { $nodeCmd = (Get-Command "node" -ErrorAction Stop).Source }

    $viteCli = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"
    if (-not (Test-Path $viteCli)) {
      throw "Vite CLI not found at $viteCli (did you run npm install?)"
    }

    $proc = Start-Process -FilePath $nodeCmd `
      -WorkingDirectory $ProjectRoot `
      -ArgumentList @(
        $viteCli,
        "--host", $HostIp,
        "--port", "$Port",
        "--strictPort"
      ) `
      -RedirectStandardOutput $outLog `
      -RedirectStandardError $errLog `
      -NoNewWindow `
      -PassThru

    $serverPid = $proc.Id
    Log "Spawned dev server pid=$serverPid"

    Log "Waiting for Vite to become ready..."
    if (-not (Wait-ViteServer -Url $BaseUrl -TimeoutSec 60)) {
      throw "Timed out waiting for Vite dev server at $BaseUrl (see $outLog / $errLog)"
    }
  }

  try {
    # --- Headless verify (Playwright) ---
    Log "Running headless verify (Playwright)"
    $env:VERIFY_URL = $BaseUrl
    $env:VERIFY_OUT_DIR = $VerifyDir
    $env:HEADLESS_ARTIFACTS_DIR = $VerifyDir

    Run-Step -Label "npm run verify:headless" -Cmd { & $npmCmd --prefix $ProjectRoot run verify:headless }
    $verifyExit = $LASTEXITCODE
    Log "verify:headless exit=$verifyExit"

    # --- verify:check (artifact assertions) ---
    Log "Running verify:check"
    Run-Step -Label "npm run verify:check" -Cmd { & $npmCmd --prefix $ProjectRoot run verify:check }
    $checkExit = $LASTEXITCODE
    Log "verify:check exit=$checkExit"

    # --- A0 baseline ---
    if (-not (Test-ViteServer -Url $BaseUrl)) {
      throw "Vite dev server is not reachable at $BaseUrl before baseline (see logs in $LogDir)"
    }
    foreach ($mode in $CaptureModes) {
      $m = [string]$mode
      if ([string]::IsNullOrWhiteSpace($m)) { continue }
      $dir = Join-Path $BaselineRoot $m
      New-Item -ItemType Directory -Force -Path $dir | Out-Null

      Log "Running A0 baseline (mode=$m)"
      $env:BASELINE_URL = $BaseUrl
      $env:BASELINE_OUT_DIR = $dir
      $env:BASELINE_CAPTURE_MODE = $m
      $env:BASELINE_DURATION_SEC = [string]$BaselineDurationSec
      $env:BASELINE_WARMUP_SEC = [string]$BaselineWarmupSec
      $env:BASELINE_SAMPLE_INTERVAL_MS = [string]$BaselineSampleIntervalMs
      $env:BASELINE_VIDEO_SRC = [string]$BaselineVideoSrc
      $env:BASELINE_S5_DEPTH_SOURCE = [string]$BaselineS5DepthSource

      Run-Step -Label "node scripts\\baseline-a0-s1-s7.mjs (mode=$m)" -Cmd { & node (Join-Path $ProjectRoot "scripts\baseline-a0-s1-s7.mjs") }
      $baselineExit = $LASTEXITCODE
      Log "baseline-a0 exit=$baselineExit (mode=$m)"
    }

    if ($verifyExit -ne 0 -or $checkExit -ne 0) {
      throw "Headless validation failed (verifyExit=$verifyExit, checkExit=$checkExit)"
    }

    Log "All headless validations completed successfully. Artifacts: $VerifyDir"
  }
  finally {
    if ($serverPid -and ($serverPid -gt 0)) {
      Log "Stopping dev server pid=$serverPid"
      try {
        # Kill process tree to avoid orphaned node/vite children.
        & taskkill /PID $serverPid /T /F 1>> $JobLog 2>> $JobErr
      }
      catch {
        try { Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue } catch {}
      }
    }
  }
}

if ($StartInBackground) {
  $job = Start-Job -ScriptBlock $scriptBlock -ArgumentList @(
    $projectRoot,
    $baseUrl,
    $verifyDir,
    $baselineRoot,
    $logDir,
    $jobLog,
    $jobErr,
    $CaptureModes,
    $BaselineDurationSec,
    $BaselineWarmupSec,
    $BaselineSampleIntervalMs,
    $BaselineVideoSrc,
    $BaselineS5DepthSource,
    $Port,
    $HostIp
  )

  Write-Host "started headless validation job id=$($job.Id)"
  Write-Host "runId=$runId"
  Write-Host "logs: $logDir"
  Write-Host "verify artifacts: $verifyDir"
  Write-Host "baseline artifacts: $baselineRoot"
  Write-Host "To watch output: Receive-Job -Id $($job.Id) -Keep"
  Write-Host "To wait: Wait-Job -Id $($job.Id); Receive-Job -Id $($job.Id)"
  return
}

# Foreground execution (still non-interactive; it will return when done)
& $scriptBlock $projectRoot $baseUrl $verifyDir $baselineRoot $logDir $jobLog $jobErr $CaptureModes $BaselineDurationSec $BaselineWarmupSec $BaselineSampleIntervalMs $BaselineVideoSrc $BaselineS5DepthSource $Port $HostIp
