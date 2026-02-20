# coupled-set-current.ps1 — Switch "current" manifest pointer with audit trail.
# Copies pairs-manifest.filtered.vN.json -> pairs-manifest.filtered.current.json
# and stamps version/source metadata.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\coupled-set-current.ps1 -Version v4
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\coupled-set-current.ps1 -Version v4 -Pack ai_generated_coupled_final

param(
  [Parameter(Mandatory=$true)]
  [string]$Version,       # e.g. "v4", "v3"
  [string]$Pack = "ai_generated_coupled_final"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir   = Resolve-Path (Join-Path $scriptDir "..")
$packDir   = Join-Path $rootDir "public\presets\$Pack"

# Validate source manifest exists
$srcFile = "pairs-manifest.filtered.$Version.json"
$srcPath = Join-Path $packDir $srcFile
if (-not (Test-Path $srcPath)) {
  $available = Get-ChildItem $packDir -Filter "pairs-manifest.filtered.v*.json" -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Name -replace 'pairs-manifest\.filtered\.(.+)\.json','$1' }
  Write-Host "[set-current] ERROR: $srcFile not found in $packDir" -ForegroundColor Red
  Write-Host "[set-current] Available versions: $($available -join ', ')" -ForegroundColor Yellow
  exit 1
}

# Read source
$srcContent = Get-Content $srcPath -Raw -Encoding UTF8
$srcJson = $srcContent | ConvertFrom-Json

# Validate it has the expected structure
if (-not $srcJson.pairs -or $srcJson.pairs.Count -eq 0) {
  Write-Host "[set-current] ERROR: $srcFile has no pairs array or is empty" -ForegroundColor Red
  exit 1
}

# Stamp metadata
$stamp = @{
  currentVersion      = $Version
  currentSetAt        = (Get-Date -Format "o")
  currentSetBy        = "coupled-set-current.ps1"
  sourceFile          = $srcFile
  sourceGeneratedFrom = if ($srcJson.generatedFrom) { $srcJson.generatedFrom } else { "unknown" }
  sourceKeptPairs     = if ($srcJson.keptPairs) { $srcJson.keptPairs } else { $srcJson.pairs.Count }
}

# Write current file (pretty-printed for readability)
$dstPath = Join-Path $packDir "pairs-manifest.filtered.current.json"
$dstJson = $srcJson | ConvertTo-Json -Depth 10 -Compress
Set-Content -Path $dstPath -Value $dstJson -Encoding UTF8 -NoNewline

# Write stamp file (audit trail)
$stampPath = Join-Path $packDir "pairs-manifest.filtered.current.stamp.json"
$stamp | ConvertTo-Json -Depth 5 | Set-Content -Path $stampPath -Encoding UTF8

# Summary
$prevVersion = ""
if (Test-Path $stampPath) {
  try {
    $prevStamp = Get-Content $stampPath -Raw | ConvertFrom-Json
    if ($prevStamp.currentVersion -and $prevStamp.currentVersion -ne $Version) {
      $prevVersion = $prevStamp.currentVersion
    }
  } catch {}
}

Write-Host "[set-current] OK" -ForegroundColor Green
Write-Host "  version:   $Version"
Write-Host "  source:    $srcFile"
Write-Host "  pairs:     $($srcJson.pairs.Count)"
Write-Host "  generatedFrom: $($srcJson.generatedFrom)"
Write-Host "  stampFile: $stampPath"
if ($prevVersion) {
  Write-Host "  previous:  $prevVersion" -ForegroundColor Yellow
}
