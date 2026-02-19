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

powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-dev-coupled.ps1" `
  -AudioMode $AudioMode `
  -AudioRoot $AudioRoot `
  -HostName $ViteHost `
  -GotoTimeoutMs $GotoTimeoutMs `
  -ViteReadyTimeoutMs $ViteReadyTimeoutMs `
  -Headed:$Headed `
  -TargetSamples $TargetSamples `
  -MaxHours $MaxHours
