$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$browserSource = Join-Path $env:LOCALAPPDATA "ms-playwright"
$resourceRoot = Join-Path $root "electron-resources"
$standalone = Join-Path $root ".next\standalone"
if (-not (Test-Path $browserSource)) { throw "Playwright Chromium is not installed. Run: npx playwright install chromium" }
if (-not (Test-Path (Join-Path $standalone "server.js"))) { throw "The Next standalone build is missing. Run npm.cmd run build first." }
if (Test-Path $resourceRoot) { Remove-Item -LiteralPath $resourceRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $resourceRoot | Out-Null

# Stage the server and its traced modules separately. electron-builder removes
# directories named node_modules from extraResources, so runtime_modules keeps
# the dependencies intact and NODE_PATH points Node at them on launch.
$appDestination = Join-Path $resourceRoot "app"
New-Item -ItemType Directory -Force -Path $appDestination | Out-Null
Get-ChildItem -LiteralPath $standalone -Force | Where-Object { $_.Name -ne "node_modules" } | Copy-Item -Destination $appDestination -Recurse -Force
$runtimeModules = Join-Path $resourceRoot "runtime_modules"
New-Item -ItemType Directory -Force -Path $runtimeModules | Out-Null
Copy-Item -Path (Join-Path $standalone "node_modules\*") -Destination $runtimeModules -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $resourceRoot "app\.next") | Out-Null
Copy-Item -LiteralPath (Join-Path $root ".next\static") -Destination (Join-Path $resourceRoot "app\.next\static") -Recurse -Force
Copy-Item -LiteralPath $browserSource -Destination (Join-Path $resourceRoot "browsers") -Recurse -Force
Copy-Item -LiteralPath (Get-Command node.exe -ErrorAction Stop).Source -Destination (Join-Path $resourceRoot "node.exe") -Force
