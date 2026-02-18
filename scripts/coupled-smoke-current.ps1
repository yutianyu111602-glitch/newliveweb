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
  [switch]$Headed = $true,
  [double]$MaxHours = 0.4
)

$ErrorActionPreference = "Stop"

$env:COUPLED_SMOKE_PAIRS_MANIFEST = $PairsManifest
$env:COUPLED_SMOKE_MOTION_MIN     = ("{0:0.############}" -f $MotionMin)
$env:COUPLED_SMOKE_LUMA_MIN       = ("{0:0.############}" -f $LumaMin)

powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-dev-coupled.ps1" `
  -AudioMode $AudioMode `
  -AudioRoot $AudioRoot `
  -Headed:$Headed `
  -TargetSamples $TargetSamples `
  -MaxHours $MaxHours
