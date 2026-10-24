# Used by START_DEMO.bat: makes sure both database services are running,
# installs and builds if needed, starts the server on port 4000 and opens
# the browser.

$ErrorActionPreference = "Stop"
$app = Split-Path -Parent $PSScriptRoot
Set-Location $app

function Test-Port($port) {
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect("127.0.0.1", $port); $true } catch { $false } finally { $c.Close() }
}

foreach ($svc in @("postgresql-17", "MongoDB")) {
    $s = Get-Service $svc -ErrorAction SilentlyContinue
    if (-not $s) { Write-Host "Service $svc is not installed." -ForegroundColor Red; exit 1 }
    if ($s.Status -ne "Running") {
        Write-Host "Starting $svc (needs administrator)..."
        Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -Command Start-Service $svc"
    }
}
if (-not (Test-Port 5432)) { Write-Host "PostgreSQL is not answering on 5432." -ForegroundColor Red; exit 1 }
if (-not (Test-Port 27017)) { Write-Host "MongoDB is not answering on 27017." -ForegroundColor Red; exit 1 }
Write-Host "PostgreSQL and MongoDB are up."

if (-not (Test-Path "$app\node_modules")) { npm install --no-audit --no-fund }
if (-not (Test-Path "$app\web\dist\index.html")) { npm run build }

if (Test-Port 4000) {
    Write-Host "The app is already running."
} else {
    Start-Process -WindowStyle Minimized -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory $app
    for ($i = 0; $i -lt 30 -and -not (Test-Port 4000); $i++) { Start-Sleep -Milliseconds 500 }
}
$h = Invoke-RestMethod "http://localhost:4000/api/health"
Write-Host ("postgres: {0}   mongo: {1}   interactions: {2}" -f $h.postgres, $h.mongo, $h.interactions)
Start-Process "http://localhost:4000/#dispense"
