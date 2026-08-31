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
        'dist\assets\environment', 'dist\assets\textures', 'dist\assets\draco',
        'artifacts\textures', 'artifacts\renders', 'artifacts\validation',
        'artifacts\renders\silhouette',
        'scripts', 'node_modules\.bin'
    )
    foreach ($relative in $requiredDirectories) {
        New-Item -ItemType Directory -Force -Path (Join-Path $fixture $relative) | Out-Null
    }
    Set-Content -LiteralPath (Join-Path $fixture 'dist\index.html') -Value '<!doctype html>'
    $fixtureManifest = [ordered]@{
        schemaVersion = 1
        modules = @(1..8 | ForEach-Object {
            $number = '{0:d2}' -f $_
            [ordered]@{
                moduleId = "module-$number"
                nameZh = '模块'
                urls = [ordered]@{
                    high = "assets/models/high/$number.glb"
                    low = "assets/models/low/$number.glb"
                }
            }
        })
        parts = @(1..100 | ForEach-Object {
            [ordered]@{
                partId = "part-$_"
                moduleId = 'module-{0:d2}' -f ((($_ - 1) % 8) + 1)
                nameZh = '零件'
            }
        })
    }
    $manifestPath = Join-Path $fixture 'dist\assembly-manifest.json'
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    function Write-FixtureManifest {
        param($Value)
        [System.IO.File]::WriteAllText($manifestPath, ($Value | ConvertTo-Json -Depth 8), $utf8WithoutBom)
    }
    Write-FixtureManifest $fixtureManifest
    foreach ($quality in @('high', 'low')) {
        1..8 | ForEach-Object {
            Set-Content -LiteralPath (Join-Path $fixture ("dist\assets\models\$quality\{0:d2}.glb" -f $_)) -Value 'glb'
        }
    }
    Set-Content -LiteralPath (Join-Path $fixture 'dist\assets\index-fixture.js') -Value 'console.log("fixture")'
    Set-Content -LiteralPath (Join-Path $fixture 'dist\assets\index-fixture.css') -Value 'body { color: white; }'
    Set-Content -LiteralPath (Join-Path $fixture 'dist\assets\environment\studio-neutral-1k.hdr') -Value 'hdr'
    Set-Content -LiteralPath (Join-Path $fixture 'dist\assets\textures\texture.png') -Value 'texture'
    foreach ($decoder in @('draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js')) {
        Set-Content -LiteralPath (Join-Path $fixture "dist\assets\draco\$decoder") -Value 'decoder'
    }
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\z50ii_master.blend') -Value 'blend'
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\textures\texture.png') -Value 'texture'
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\renders\assembled-studio.png') -Value 'render'
    Set-Content -LiteralPath (Join-Path $fixture 'artifacts\renders\exploded-studio.png') -Value 'render'
    foreach ($view in @('front', 'left', 'rear', 'right', 'three-quarter', 'top')) {
        Set-Content -LiteralPath (Join-Path $fixture "artifacts\renders\silhouette\$view.png") -Value 'render'
    }
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
    $firstHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    $secondPackageExit = Invoke-ScriptProcess -Script $packageScript -Arguments @('-ProjectRoot', $fixture)
    if ($secondPackageExit -ne 0) { throw "Second identical package run exited $secondPackageExit" }
    $secondHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    if ($firstHash -ne $secondHash) {
        throw "Identical package inputs produced different SHA-256 values: $firstHash then $secondHash"
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archiveReader = [System.IO.Compression.ZipFile]::OpenRead($archive)
    try {
        $timestamps = @($archiveReader.Entries | ForEach-Object { $_.LastWriteTime.DateTime.ToString('yyyy-MM-ddTHH:mm:ss') } | Sort-Object -Unique)
        Assert-Equal $timestamps @('2000-01-01T00:00:00') 'ZIP entry timestamps were not normalized.'
        $entryNames = @($archiveReader.Entries | ForEach-Object FullName)
        $ordinalNames = [System.Collections.Generic.List[string]]::new()
        $entryNames | ForEach-Object { $ordinalNames.Add($_) }
        $ordinalNames.Sort([System.StringComparer]::Ordinal)
        for ($index = 0; $index -lt $entryNames.Count; $index++) {
            if ($entryNames[$index] -cne $ordinalNames[$index]) {
                throw "ZIP entries are not in ordinal path order at index $index."
            }
        }
    }
    finally {
        $archiveReader.Dispose()
    }
    $expanded = Join-Path $scratch 'expanded'
    Expand-Archive -LiteralPath $archive -DestinationPath $expanded
    $archiveTop = Get-ChildItem -LiteralPath (Join-Path $expanded 'Z50II-Explorer') | Sort-Object Name | Select-Object -ExpandProperty Name
    Assert-Equal $archiveTop $topLevel 'Archive paths differ from validated staging paths.'
    foreach ($quality in @('high', 'low')) {
        $glbs = Get-ChildItem -LiteralPath (Join-Path $expanded "Z50II-Explorer\dist\assets\models\$quality") -Filter '*.glb'
        if ($glbs.Count -ne 8) { throw "Archive contains $($glbs.Count) $quality GLBs instead of eight." }
    }

    $fixtureManifest.modules[1].moduleId = $fixtureManifest.modules[0].moduleId
    Write-FixtureManifest $fixtureManifest
    if ((Invoke-ScriptProcess -Script $packageScript -Arguments @('-ProjectRoot', $fixture)) -eq 0) {
        throw 'package-release.ps1 accepted duplicate module IDs.'
    }
    $fixtureManifest.modules[1].moduleId = 'module-02'

    $fixtureManifest.parts[1].partId = $fixtureManifest.parts[0].partId
    Write-FixtureManifest $fixtureManifest
    if ((Invoke-ScriptProcess -Script $packageScript -Arguments @('-ProjectRoot', $fixture)) -eq 0) {
        throw 'package-release.ps1 accepted duplicate part IDs.'
    }
    $fixtureManifest.parts[1].partId = 'part-2'

    $fixtureManifest.modules[0].urls.high = 'assets/models/high/not-the-module.glb'
    Write-FixtureManifest $fixtureManifest
    if ((Invoke-ScriptProcess -Script $packageScript -Arguments @('-ProjectRoot', $fixture)) -eq 0) {
        throw 'package-release.ps1 accepted a manifest-to-GLB URL mismatch.'
    }
    $fixtureManifest.modules[0].urls.high = 'assets/models/high/01.glb'
    Write-FixtureManifest $fixtureManifest

    Clear-Content -LiteralPath (Join-Path $fixture 'dist\assets\index-fixture.js')
    if ((Invoke-ScriptProcess -Script $packageScript -Arguments @('-ProjectRoot', $fixture)) -eq 0) {
        throw 'package-release.ps1 accepted an empty built JavaScript stub.'
    }
    Set-Content -LiteralPath (Join-Path $fixture 'dist\assets\index-fixture.js') -Value 'console.log("fixture")'

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

    $previousPath = $env:PATH
    try {
        $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
        $pnpmOutput = & (Join-Path $repositoryRoot 'scripts\pnpm.ps1') exec node --version 2>&1
        $pnpmExit = $LASTEXITCODE
    }
    finally {
        $env:PATH = $previousPath
    }
    $pnpmOutput | ForEach-Object { Write-Host $_ }
    if ($pnpmExit -ne 0 -or ($pnpmOutput -join "`n") -notmatch '^v24\.19\.0') {
        throw "scripts/pnpm.ps1 did not self-provision bundled Node from a fresh PATH (exit $pnpmExit)."
    }
    Write-Output 'Release workflow behavioral tests passed.'
}
finally {
    Remove-Item Env:Z50II_FAIL_PATTERN -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
