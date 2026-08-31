param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArgs)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDependencies = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeBin = Join-Path $runtimeDependencies 'node\bin'
$pnpmExe = Join-Path $runtimeDependencies 'bin\fallback\pnpm.cmd'
$localBin = Join-Path $repositoryRoot 'node_modules\.bin'

foreach ($required in @(
    (Join-Path $nodeBin 'node.exe'),
    $pnpmExe,
    $localBin
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required repository runtime path was not found: $required"
    }
}

$env:PATH = "$nodeBin;$localBin;$env:PATH"
& $pnpmExe @PnpmArgs
exit $LASTEXITCODE
