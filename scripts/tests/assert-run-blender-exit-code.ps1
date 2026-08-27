$ErrorActionPreference = 'Stop'

$runner = Join-Path $PSScriptRoot '..\run-blender.ps1'
& $runner --background --factory-startup --python-expr "raise RuntimeError('intentional runner smoke failure')"
$failureExit = $LASTEXITCODE
if ($failureExit -eq 0) {
    throw 'run-blender.ps1 returned zero for an intentional Blender Python exception'
}

& $runner --background --factory-startup --python-expr "print('runner success smoke')"
$successExit = $LASTEXITCODE
if ($successExit -ne 0) {
    throw "run-blender.ps1 returned $successExit for a successful Blender Python expression"
}

Write-Output "Blender runner exit-code smoke passed: failure=$failureExit success=$successExit"
