# guard-git-status.ps1 — Pre-run worktree gate.
# Ensures only "allowed" files are dirty before eval/train/overnight.
# Called automatically by overnight/smoke scripts, or manually:
#   powershell -File scripts/guard-git-status.ps1
#   powershell -File scripts/guard-git-status.ps1 -Strict

param(
  [switch]$Strict,
  [string[]]$AllowedPaths = @(
    "scripts/",
    "docs/",
    "public/presets/*/pairs-manifest*",
    "python/"
  )
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $projectRoot

try {
  $dirty = git status --porcelain 2>&1
  if (!$dirty -or $dirty.Count -eq 0) {
    Write-Host "[guard] worktree clean" -ForegroundColor Green
    exit 0
  }

  # Parse dirty files
  $dirtyFiles = @()
  foreach ($line in $dirty) {
    $s = $line.ToString().Trim()
    if ($s.Length -lt 4) { continue }
    # git status --porcelain: first 2 chars are status, then space, then path
    $filePath = $s.Substring(3).Trim().Trim('"')
    $dirtyFiles += $filePath
  }

  # Check each dirty file against allowed patterns
  $violations = @()
  foreach ($f in $dirtyFiles) {
    $allowed = $false
    foreach ($pattern in $AllowedPaths) {
      if ($f -like $pattern) { $allowed = $true; break }
    }
    # Artifacts dir is always ok (gitignored anyway, but just in case)
    if ($f -like "artifacts/*") { $allowed = $true }
    if (-not $allowed) {
      $violations += $f
    }
  }

  if ($violations.Count -eq 0) {
    Write-Host "[guard] worktree: $($dirtyFiles.Count) dirty file(s), all in allowed paths" -ForegroundColor Green
    exit 0
  }

  Write-Host "[guard] WARNING: $($violations.Count) file(s) outside allowed paths:" -ForegroundColor Yellow
  foreach ($v in $violations) {
    Write-Host "  - $v" -ForegroundColor Yellow
  }
  Write-Host ""
  Write-Host "[guard] Allowed paths: $($AllowedPaths -join ', ')" -ForegroundColor Gray

  if ($Strict) {
    Write-Host "[guard] STRICT mode: blocking execution. Clean worktree first:" -ForegroundColor Red
    Write-Host "  git checkout -- .   (discard all changes)" -ForegroundColor Red
    Write-Host "  git stash           (stash changes)" -ForegroundColor Red
    exit 1
  } else {
    Write-Host "[guard] Non-strict: continuing with warning. Use -Strict to enforce." -ForegroundColor Yellow
    exit 0
  }
} finally {
  Pop-Location
}
