<#
.SYNOPSIS
  Force-stage pairs-manifest.filtered.current.json (which lives under a
  gitignored directory) so that the next `git commit` picks it up.
  Also validates the current file has a version/source stamp.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rel = "public/presets/ai_generated_coupled_final/pairs-manifest.filtered.current.json"
$abs = Join-Path $PSScriptRoot ".." $rel

if (-not (Test-Path $abs)) {
  Write-Error "[git-stage] file not found: $rel"
  exit 1
}

# Validate current manifest has required fields
try {
  $json = Get-Content $abs -Raw | ConvertFrom-Json
  if (-not $json.version) {
    Write-Warning "[git-stage] WARNING: current manifest missing 'version' field"
  }
  if (-not $json.generatedFrom) {
    Write-Warning "[git-stage] WARNING: current manifest missing 'generatedFrom' field"
  }
  Write-Host "[git-stage] validated: version=$($json.version) pairs=$($json.pairs.Count) generatedFrom=$($json.generatedFrom)"
} catch {
  Write-Warning "[git-stage] WARNING: failed to parse current manifest: $($_.Exception.Message)"
}

# Also stage the stamp file if it exists
$stampRel = "public/presets/ai_generated_coupled_final/pairs-manifest.filtered.current.stamp.json"
$stampAbs = Join-Path $PSScriptRoot ".." $stampRel

git add -f $rel
if (Test-Path $stampAbs) {
  git add -f $stampRel
  Write-Host "[git-stage] staged $rel + $stampRel"
} else {
  Write-Host "[git-stage] staged $rel (no stamp file found)"
}
git status --porcelain -- $rel $stampRel
