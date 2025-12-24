param(
  [int]$Port = 5174,
  [string]$HostIp = "127.0.0.1"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$outLog = Join-Path $projectRoot "artifacts/headless/dev-server-live.log"
$errLog = Join-Path $projectRoot "artifacts/headless/dev-server-live.err.log"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outLog) | Out-Null

$npmCmd = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { $npmCmd = (Get-Command "npm" -ErrorAction Stop).Source }

Start-Process -FilePath $npmCmd `
  -WorkingDirectory $projectRoot `
  -ArgumentList @(
    "--prefix", $projectRoot,
    "run", "dev",
    "--",
    "--host", $HostIp,
    "--port", "$Port",
    "--strictPort"
  ) `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -NoNewWindow `
  -PassThru | ForEach-Object {
    Write-Host "spawned dev server on ${HostIp}:$Port (pid=$($_.Id))"
    $_
  }
