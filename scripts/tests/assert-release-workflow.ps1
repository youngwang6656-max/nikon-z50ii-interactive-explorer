$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$buildScript = Join-Path $repositoryRoot 'scripts\build-all.ps1'
$packageScript = Join-Path $repositoryRoot 'scripts\package-release.ps1'
$shell = (Get-Process -Id $PID).Path

function Invoke-ScriptProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Script,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $shell -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    $output | ForEach-Object { Write-Host $_ }
    return [int]$exitCode
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    if (Compare-Object -ReferenceObject @($Expected) -DifferenceObject @($Actual)) {
        throw "$Message`nExpected: $(@($Expected) -join ', ')`nActual: $(@($Actual) -join ', ')"
    }
}

$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("z50ii-release-test-" + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Force -Path $scratch | Out-Null
    $fixture = Join-Path $scratch 'fixture'
    $requiredDirectories = @(
        'dist\assets\models\high', 'dist\assets\models\low',
        'artifacts\textures', 'artifacts\renders', 'artifacts\validation',
        'scripts', 'node_modules\.bin'
    )
    foreach ($relative in $requiredDirectories) {
        New-Item -ItemType Directory -Force -Path (Join-Path $fixture $relative) | Out-Null
    }
    Set-Content -LiteralPath (Join-Path $fixture 'dist\index.html') -Value '<!doctype html>'
    $fixtureManifest = [ordered]@{
        schemaVersion = 1
        modules = @(1..8 | ForEach-Object { [ordered]@{ moduleId = "module-$_"; nameZh = '模块' } })
        parts = @(1..100 | ForEach-Object { [ordered]@{ partId = "part-$_"; nameZh = '零件' } })
    }
    $manifestPath = Join-Path $fixture 'dist\assembly-manifest.json'
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, ($fixtureManifest | ConvertTo-Json -Depth 4), $utf8WithoutBom)
    foreach ($quality in @('high', 'low')) {
        1..8 | ForEach-Object {
            Set-Content -LiteralPath (Join-Path $fixture ("dist\assets\models\$quality\{0:d2}.glb" -f $_)) -Value 'glb'
        }
    }
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\z50ii_master.blend') -Value 'blend'
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\textures\texture.png') -Value 'texture'
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\renders\assembled-studio.png') -Value 'render'
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\renders\exploded-studio.png') -Value 'render'
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\validation\acceptance.md') -Value '# acceptance'
    Set-Content -LiteralPath (Join-Path $fixture 'README.md') -Value '# readme'
    Set-Content -LiteralPath (Join-Path $fixture 'scripts\start-viewer.ps1') -Value 'Write-Output viewer'

    $packageExit = Invoke-ScriptProcess -Script $packageScript -Arguments @('-ProjectRoot', $fixture)
    if ($packageExit -ne 0) { throw "package-release.ps1 exited $packageExit for complete fixture inputs" }
    $staging = Join-Path $fixture 'release\Z50II-Explorer'
    $topLevel = Get-ChildItem -LiteralPath $staging | Sort-Object Name | Select-Object -ExpandProperty Name
    Assert-Equal $topLevel @('acceptance.md', 'dist', 'README.md', 'renders', 'start-viewer.ps1', 'textures', 'z50ii_master.blend') 'Release staging classes differ from the delivery contract.'

    $archive = Join-Path $fixture 'release\Z50II-Explorer.zip'
    if (-not (Test-Path -LiteralPath $archive)) { throw 'Release archive was not created.' }
    $expanded = Join-Path $scratch 'expanded'
    Expand-Archive -LiteralPath $archive -DestinationPath $expanded
    $archiveTop = Get-ChildItem -LiteralPath (Join-Path $expanded 'Z50II-Explorer') | Sort-Object Name | Select-Object -ExpandProperty Name
    Assert-Equal $archiveTop $topLevel 'Archive paths differ from validated staging paths.'
    foreach ($quality in @('high', 'low')) {
        $glbs = Get-ChildItem -LiteralPath (Join-Path $expanded "Z50II-Explorer\dist\assets\models\$quality") -Filter '*.glb'
        if ($glbs.Count -ne 8) { throw "Archive contains $($glbs.Count) $quality GLBs instead of eight." }
    }

    Remove-Item -LiteralPath (Join-Path $fixture 'dist\assets\models\low\08.glb')
    $incompleteExit = Invoke-ScriptProcess -Script $packageScript -Arguments @('-ProjectRoot', $fixture)
    if ($incompleteExit -eq 0) { throw 'package-release.ps1 accepted an incomplete low-detail GLB set.' }

    $log = Join-Path $fixture 'build-order.log'
    $mockRunner = @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$BlenderArgs)
Add-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'build-order.log') -Value ('blender ' + ($BlenderArgs -join ' '))
if ($env:Z50II_FAIL_PATTERN -and (($BlenderArgs -join ' ') -match $env:Z50II_FAIL_PATTERN)) { exit 23 }
exit 0
'@
    $mockPnpm = @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArgs)
$root = Split-Path -Parent $PSScriptRoot
Add-Content -LiteralPath (Join-Path $root 'build-order.log') -Value ('pnpm ' + ($PnpmArgs -join ' '))
if (-not (($env:PATH -split ';') -contains (Join-Path $root 'node_modules\.bin'))) { exit 31 }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { exit 32 }
exit 0
'@
    Set-Content -LiteralPath (Join-Path $fixture 'scripts\run-blender.ps1') -Value $mockRunner
    Set-Content -LiteralPath (Join-Path $fixture 'scripts\pnpm.ps1') -Value $mockPnpm
    $env:Z50II_FAIL_PATTERN = ''
    $buildExit = Invoke-ScriptProcess -Script $buildScript -Arguments @('-ProjectRoot', $fixture)
    if ($buildExit -ne 0) { throw "build-all.ps1 exited $buildExit for successful controlled commands" }
    $expectedOrder = @(
        'blender --background --factory-startup --python blender/build_master.py',
        'blender --background artifacts/z50ii_master.blend --python blender/validate_scene.py',
        'blender --background artifacts/z50ii_master.blend --python blender/render_environment.py',
        'blender --background artifacts/z50ii_master.blend --python blender/render_reference.py',
        'blender --background artifacts/z50ii_master.blend --python blender/export_modules.py',
        'blender --background --factory-startup --python blender/tests/assert_exports.py',
        'pnpm test', 'pnpm build', 'pnpm test:e2e'
    )
    Assert-Equal (Get-Content -LiteralPath $log) $expectedOrder 'One-command build order is incorrect.'

    Clear-Content -LiteralPath $log
    $env:Z50II_FAIL_PATTERN = 'render_reference.py'
    $failedBuildExit = Invoke-ScriptProcess -Script $buildScript -Arguments @('-ProjectRoot', $fixture)
    if ($failedBuildExit -eq 0) { throw 'build-all.ps1 returned success after a controlled render failure.' }
    $stoppedOrder = Get-Content -LiteralPath $log
    if ($stoppedOrder[-1] -notmatch 'render_reference.py' -or $stoppedOrder.Count -ne 4) {
        throw "build-all.ps1 did not stop at the first nonzero command: $($stoppedOrder -join ' | ')"
    }
    Write-Output 'Release workflow behavioral tests passed.'
}
finally {
    Remove-Item Env:Z50II_FAIL_PATTERN -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
