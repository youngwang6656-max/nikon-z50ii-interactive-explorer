param([Parameter(ValueFromRemainingArguments = $true)][string[]]$BlenderArgs)
$blender = Join-Path $PSScriptRoot '..\tools\blender-4.5.12-windows-x64\blender.exe'
if (-not (Test-Path -LiteralPath $blender)) { throw 'Run scripts/install-blender.ps1 first.' }
$effectiveArgs = @('--python-exit-code', '1') + @($BlenderArgs)
& $blender @effectiveArgs
exit $LASTEXITCODE
