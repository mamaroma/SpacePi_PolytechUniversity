$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$uiRoot = Join-Path $projectRoot 'ui'
$vitePath = Join-Path $uiRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vitePath)) {
    throw "Vite dependencies not found in $uiRoot\node_modules"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodePath = $nodeCommand.Source
} else {
    $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath)) {
    throw 'Node.js not found. Install Node.js or run from the Codex workspace runtime.'
}

Set-Location -LiteralPath $uiRoot
& $nodePath $vitePath --host 127.0.0.1
