param(
    [string]$ProjectRoot = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path

$inputs = [ordered]@{
    'dist/index.html' = Join-Path $ProjectRoot 'dist\index.html'
    'dist/assembly-manifest.json' = Join-Path $ProjectRoot 'dist\assembly-manifest.json'
    'start-viewer.ps1' = Join-Path $ProjectRoot 'scripts\start-viewer.ps1'
    'z50ii_master.blend' = Join-Path $ProjectRoot 'artifacts\z50ii_master.blend'
    'textures/' = Join-Path $ProjectRoot 'artifacts\textures'
    'renders/' = Join-Path $ProjectRoot 'artifacts\renders'
    'README.md' = Join-Path $ProjectRoot 'README.md'
    'acceptance.md' = Join-Path $ProjectRoot 'artifacts\validation\acceptance.md'
}
foreach ($entry in $inputs.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $entry.Value)) {
        throw "Cannot package release: missing required input $($entry.Key) at $($entry.Value)"
    }
}

$manifestText = [System.IO.File]::ReadAllText(
    $inputs['dist/assembly-manifest.json'],
    [System.Text.Encoding]::UTF8
)
$manifest = $manifestText | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or @($manifest.modules).Count -ne 8 -or @($manifest.parts).Count -ne 100) {
    throw 'Cannot package release: dist/assembly-manifest.json must use schema 1 and contain eight modules and 100 parts.'
}
foreach ($quality in @('high', 'low')) {
    $modelDirectory = Join-Path $ProjectRoot "dist\assets\models\$quality"
    $glbs = @(Get-ChildItem -LiteralPath $modelDirectory -Filter '*.glb' -File -ErrorAction SilentlyContinue)
    if ($glbs.Count -ne 8) {
        throw "Cannot package release: expected eight $quality GLBs in $modelDirectory, found $($glbs.Count)."
    }
}

$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot 'release'))
$staging = [System.IO.Path]::GetFullPath((Join-Path $releaseRoot 'Z50II-Explorer'))
$archive = [System.IO.Path]::GetFullPath((Join-Path $releaseRoot 'Z50II-Explorer.zip'))
if (-not $staging.StartsWith($releaseRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe release staging path: $staging"
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Copy-Item -LiteralPath (Join-Path $ProjectRoot 'dist') -Destination (Join-Path $staging 'dist') -Recurse
Copy-Item -LiteralPath $inputs['start-viewer.ps1'] -Destination (Join-Path $staging 'start-viewer.ps1')
Copy-Item -LiteralPath $inputs['z50ii_master.blend'] -Destination (Join-Path $staging 'z50ii_master.blend')
Copy-Item -LiteralPath $inputs['textures/'] -Destination (Join-Path $staging 'textures') -Recurse
Copy-Item -LiteralPath $inputs['renders/'] -Destination (Join-Path $staging 'renders') -Recurse
Copy-Item -LiteralPath $inputs['README.md'] -Destination (Join-Path $staging 'README.md')
Copy-Item -LiteralPath $inputs['acceptance.md'] -Destination (Join-Path $staging 'acceptance.md')

$expectedTopLevel = @('acceptance.md', 'dist', 'README.md', 'renders', 'start-viewer.ps1', 'textures', 'z50ii_master.blend')
$actualTopLevel = @(Get-ChildItem -LiteralPath $staging | Sort-Object Name | Select-Object -ExpandProperty Name)
if (Compare-Object -ReferenceObject $expectedTopLevel -DifferenceObject $actualTopLevel) {
    throw "Release staging contains unexpected delivery classes: $($actualTopLevel -join ', ')"
}

Compress-Archive -LiteralPath $staging -DestinationPath $archive -CompressionLevel Optimal
$expanded = Join-Path $releaseRoot ('.archive-validation-' + [guid]::NewGuid().ToString('N'))
try {
    Expand-Archive -LiteralPath $archive -DestinationPath $expanded
    $expandedRoot = Join-Path $expanded 'Z50II-Explorer'
    $archiveTopLevel = @(Get-ChildItem -LiteralPath $expandedRoot | Sort-Object Name | Select-Object -ExpandProperty Name)
    if (Compare-Object -ReferenceObject $expectedTopLevel -DifferenceObject $archiveTopLevel) {
        throw "Release archive paths do not match staging: $($archiveTopLevel -join ', ')"
    }
    foreach ($quality in @('high', 'low')) {
        $archiveGlbs = @(Get-ChildItem -LiteralPath (Join-Path $expandedRoot "dist\assets\models\$quality") -Filter '*.glb' -File)
        if ($archiveGlbs.Count -ne 8) { throw "Release archive lost $quality GLBs." }
    }
}
finally {
    if (Test-Path -LiteralPath $expanded) { Remove-Item -LiteralPath $expanded -Recurse -Force }
}

$archiveFile = Get-Item -LiteralPath $archive
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "Release staged: $staging"
Write-Output "Release archive: $archive"
Write-Output "Archive bytes: $($archiveFile.Length)"
Write-Output "Archive SHA256: $hash"
