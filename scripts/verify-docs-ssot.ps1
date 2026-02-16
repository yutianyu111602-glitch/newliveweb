#!/usr/bin/env pwsh
# SSOT 文档门禁检查脚本
# 用法: .\scripts\verify-docs-ssot.ps1
# 集成: 可挂到 npm run verify:check 之前或 pre-commit

[CmdletBinding()]
param()

$PROJECT_ROOT = "C:\Users\pc\code\newliveweb"
Set-Location $PROJECT_ROOT

$errors = @()
$warnings = @()

Write-Host "=== SSOT Docs Gate ===" -ForegroundColor Cyan

# 1. PLAN_CURRENT.md 必须存在
$planCurrent = "docs\PLAN_CURRENT.md"
if (-not (Test-Path $planCurrent)) {
    $errors += "MISSING: $planCurrent (计划唯一入口)"
} else {
    Write-Host "OK: $planCurrent" -ForegroundColor Green
}

# 2. MASTER_SPEC.zh.md 必须存在
$masterSpec = "docs\MASTER_SPEC.zh.md"
if (-not (Test-Path $masterSpec)) {
    $errors += "MISSING: $masterSpec (SSOT主文档)"
} else {
    Write-Host "OK: $masterSpec" -ForegroundColor Green
    
    # 3. 检查 3 个 deprecated 锚点
    $ssotContent = Get-Content $masterSpec -Raw
    $requiredAnchors = @(
        'id="deprecated-targets"',
        'id="deprecated-root-migration-audit"',
        'id="deprecated-optimization-complete"'
    )
    
    foreach ($anchor in $requiredAnchors) {
        if ($ssotContent -notmatch $anchor) {
            $errors += "MISSING ANCHOR: $anchor in $masterSpec"
        } else {
            Write-Host "OK: Anchor $anchor" -ForegroundColor Green
        }
    }
}

# 4. 检查所有 DEPRECATED 文档的 replacement 格式
Write-Host "`nScanning DEPRECATED docs..." -ForegroundColor Cyan
$deprecatedFiles = Select-String -Path ".\docs\**\*.md" -Pattern '<!--\s*DEPRECATED' -List | ForEach-Object { $_.Path }
$badReplacements = @()

foreach ($f in $deprecatedFiles) {
    $head = Get-Content $f -TotalCount 40 -ErrorAction SilentlyContinue | Out-String
    if ($head -notmatch 'replacement:\s*docs/MASTER_SPEC\.zh\.md#deprecated-') {
        $badReplacements += $f
    }
}

if ($badReplacements.Count -gt 0) {
    $errors += "BAD REPLACEMENT in: $($badReplacements -join ', ')"
}

Write-Host "DEPRECATED docs scanned: $($deprecatedFiles.Count), bad: $($badReplacements.Count)" -ForegroundColor $(if($badReplacements.Count -eq 0){'Green'}else{'Red'})

# 5. 检查是否有残留旧报告引用（警告级别）
Write-Host "`nChecking legacy report references..." -ForegroundColor Cyan
$legacyRefs = Select-String -Path ".\docs\**\*.md" -Pattern 'EXPERT_IMPLEMENTATION_AUDIT\.md' -List | ForEach-Object { $_.Path }
if ($legacyRefs.Count -gt 0) {
    $warnings += "LEGACY REFERENCE: $($legacyRefs -join ', ')"
    Write-Host "WARNING: $($legacyRefs.Count) files still reference old report" -ForegroundColor Yellow
}

# 输出结果
Write-Host "`n=== Result ===" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
    Write-Host "PASS: All SSOT checks passed" -ForegroundColor Green
    if ($warnings.Count -gt 0) {
        Write-Host "WARNINGS:" -ForegroundColor Yellow
        $warnings | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    }
    exit 0
} else {
    Write-Host "FAIL: SSOT validation failed" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  [ERROR] $_" -ForegroundColor Red }
    if ($warnings.Count -gt 0) {
        Write-Host "WARNINGS:" -ForegroundColor Yellow
        $warnings | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    }
    exit 1
}
