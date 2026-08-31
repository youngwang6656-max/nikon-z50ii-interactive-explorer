param(
    [string]$ProjectRoot = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$blenderRunner = Join-Path $ProjectRoot 'scripts\run-blender.ps1'
$pnpmRunner = Join-Path $ProjectRoot 'scripts\pnpm.ps1'
$localBin = Join-Path $ProjectRoot 'node_modules\.bin'
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'

foreach ($required in @($blenderRunner, $pnpmRunner, $localBin, (Join-Path $bundledNode 'node.exe'))) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required build dependency is missing: $required"
    }
}

function Invoke-BuildStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Script,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    Write-Output "[build-all] $Name"
    & $Script @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Build step '$Name' failed with exit code $LASTEXITCODE."
    }
}

$originalPath = $env:PATH
$env:PATH = "$bundledNode;$localBin;$originalPath"
Push-Location $ProjectRoot
try {
    Invoke-BuildStep 'Build Blender master scene' $blenderRunner @('--background', '--factory-startup', '--python', 'blender/build_master.py')
    Invoke-BuildStep 'Validate Blender scene' $blenderRunner @('--background', 'artifacts/z50ii_master.blend', '--python', 'blender/validate_scene.py')
    Invoke-BuildStep 'Assert internal geometry' $blenderRunner @('--background', 'artifacts/z50ii_master.blend', '--python', 'blender/tests/assert_internal_geometry.py')
    Invoke-BuildStep 'Assert removal motion' $blenderRunner @('--background', 'artifacts/z50ii_master.blend', '--python', 'blender/tests/assert_removal_motion.py')
    Invoke-BuildStep 'Render HDR environment' $blenderRunner @('--background', 'artifacts/z50ii_master.blend', '--python', 'blender/render_environment.py')
    Invoke-BuildStep 'Render assembled and exploded references' $blenderRunner @('--background', 'artifacts/z50ii_master.blend', '--python', 'blender/render_reference.py')
    Invoke-BuildStep 'Export GLBs and manifest' $blenderRunner @('--background', 'artifacts/z50ii_master.blend', '--python', 'blender/export_modules.py')
    Invoke-BuildStep 'Assert Blender exports' $blenderRunner @('--background', '--factory-startup', '--python', 'blender/tests/assert_exports.py')
    Invoke-BuildStep 'Run unit tests' $pnpmRunner @('test')
    Invoke-BuildStep 'Build production viewer' $pnpmRunner @('build')
    Invoke-BuildStep 'Run Chrome and Edge acceptance tests' $pnpmRunner @('test:e2e')
    Write-Output '[build-all] All build and acceptance steps completed.'
}
finally {
    Pop-Location
    $env:PATH = $originalPath
}
