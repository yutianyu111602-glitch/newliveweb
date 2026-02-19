# diagnose-vite-connection.ps1 — Quick diagnostic for Vite connection issues.
# Run this when page.goto times out to understand WHY.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\diagnose-vite-connection.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\diagnose-vite-connection.ps1 -Port 5175

param(
  [int]$Port = 5174,
  [string]$Host_ = "127.0.0.1"
)

$ErrorActionPreference = "Continue"

Write-Host "=== Vite Connection Diagnostics ===" -ForegroundColor Cyan
Write-Host "  Target: http://${Host_}:${Port}/"
Write-Host "  Time:   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# 1. Check if port is listening
Write-Host "--- 1. Port check ---" -ForegroundColor Yellow
$tcpCheck = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($tcpCheck) {
  foreach ($conn in $tcpCheck) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  Port $Port LISTENING pid=$($conn.OwningProcess) process=$($proc.Name) state=$($conn.State) localAddr=$($conn.LocalAddress)"
  }
} else {
  Write-Host "  Port $Port NOT listening" -ForegroundColor Red
}

# 2. HTTP fetch test
Write-Host ""
Write-Host "--- 2. HTTP fetch ---" -ForegroundColor Yellow
foreach ($testHost in @($Host_, "localhost", "127.0.0.1", "::1")) {
  $url = "http://${testHost}:${Port}/"
  try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $resp = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $sw.Stop()
    Write-Host "  $url => $($resp.StatusCode) (${sw.ElapsedMilliseconds}ms)" -ForegroundColor Green
  } catch {
    Write-Host "  $url => FAIL: $($_.Exception.Message)" -ForegroundColor Red
  }
}

# 3. DNS / hosts file check
Write-Host ""
Write-Host "--- 3. DNS resolution ---" -ForegroundColor Yellow
foreach ($name in @("localhost")) {
  try {
    $resolved = [System.Net.Dns]::GetHostAddresses($name)
    $addrs = ($resolved | ForEach-Object { $_.IPAddressToString }) -join ", "
    Write-Host "  $name => $addrs"
  } catch {
    Write-Host "  $name => FAIL: $($_.Exception.Message)" -ForegroundColor Red
  }
}

# 4. Proxy environment variables
Write-Host ""
Write-Host "--- 4. Proxy env vars ---" -ForegroundColor Yellow
$proxyVars = @("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy")
$anyProxy = $false
foreach ($v in $proxyVars) {
  $val = [Environment]::GetEnvironmentVariable($v)
  if ($val) {
    Write-Host "  $v = $val" -ForegroundColor Red
    $anyProxy = $true
  }
}
if (-not $anyProxy) {
  Write-Host "  (none set)" -ForegroundColor Green
}

# 5. System proxy (WinINET)
Write-Host ""
Write-Host "--- 5. System proxy (registry) ---" -ForegroundColor Yellow
try {
  $proxyEnabled = Get-ItemPropertyValue "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -ErrorAction SilentlyContinue
  $proxyServer = Get-ItemPropertyValue "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyServer -ErrorAction SilentlyContinue
  Write-Host "  ProxyEnable = $proxyEnabled"
  if ($proxyServer) {
    Write-Host "  ProxyServer = $proxyServer" -ForegroundColor $(if ($proxyEnabled) { "Red" } else { "Gray" })
  }
} catch {
  Write-Host "  (could not read)" -ForegroundColor Gray
}

# 6. IPv6 check
Write-Host ""
Write-Host "--- 6. IPv6 status ---" -ForegroundColor Yellow
$ipv6 = Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue |
  Where-Object { $_.Enabled } | Select-Object -First 3
if ($ipv6) {
  foreach ($a in $ipv6) {
    Write-Host "  IPv6 ENABLED on $($a.Name)"
  }
} else {
  Write-Host "  IPv6 disabled or not found"
}

# 7. Hosts file
Write-Host ""
Write-Host "--- 7. hosts file entries for localhost ---" -ForegroundColor Yellow
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
  $entries = Get-Content $hostsPath | Where-Object { $_ -match "localhost" -and $_ -notmatch "^\s*#" }
  if ($entries) {
    foreach ($e in $entries) { Write-Host "  $e" }
  } else {
    Write-Host "  (no uncommented localhost entries)"
  }
}

# 8. Node processes
Write-Host ""
Write-Host "--- 8. Node/Chromium processes ---" -ForegroundColor Yellow
$procs = Get-Process -Name "node","chromium" -ErrorAction SilentlyContinue
if ($procs) {
  foreach ($p in $procs) {
    Write-Host "  pid=$($p.Id) name=$($p.Name) cpu=$([Math]::Round($p.CPU, 1))s ws=$([Math]::Round($p.WorkingSet64/1MB, 1))MB"
  }
} else {
  Write-Host "  (no node/chromium processes)"
}

Write-Host ""
Write-Host "=== Diagnostics complete ===" -ForegroundColor Cyan
