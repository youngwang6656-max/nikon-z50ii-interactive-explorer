param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArgs)
$pnpmExe = 'C:\Users\WangYan\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
if (-not (Test-Path -LiteralPath $pnpmExe)) { throw 'Bundled pnpm runtime was not found.' }
& $pnpmExe @PnpmArgs
exit $LASTEXITCODE
