<#
.SYNOPSIS
  Force-stage pairs-manifest.filtered.current.json (which lives under a
  gitignored directory) so that the next `git commit` picks it up.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rel = "public/presets/ai_generated_coupled_final/pairs-manifest.filtered.current.json"
$abs = Join-Path $PSScriptRoot ".." $rel

if (-not (Test-Path $abs)) {
  Write-Error "[git-stage] file not found: $rel"
  exit 1
}

git add -f $rel
Write-Host "[git-stage] staged $rel"
git status --porcelain -- $rel
