$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pythonPath = Join-Path $projectRoot 'venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Python environment not found: $pythonPath"
}

Set-Location -LiteralPath $projectRoot
$env:DATABASE_URL = 'sqlite:///./venv/telemetry-local.db'
& $pythonPath (Join-Path $PSScriptRoot 'dev_api.py')
