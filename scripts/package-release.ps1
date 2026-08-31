param(
    [string]$ProjectRoot = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path

function Assert-NonEmptyFile {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$Label = $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Cannot package release: missing required file $Label at $Path"
    }
    if ((Get-Item -LiteralPath $Path).Length -le 0) {
        throw "Cannot package release: required file $Label is empty at $Path"
    }
}

function Get-NonEmptyFiles {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [string]$Filter = '*'
    )
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $Directory -Filter $Filter -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt 0 })
}

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
foreach ($fileKey in @(
    'dist/index.html', 'dist/assembly-manifest.json', 'start-viewer.ps1',
    'z50ii_master.blend', 'README.md', 'acceptance.md'
)) {
    Assert-NonEmptyFile -Path $inputs[$fileKey] -Label $fileKey
}

$manifestText = [System.IO.File]::ReadAllText(
    $inputs['dist/assembly-manifest.json'],
    [System.Text.Encoding]::UTF8
)
$manifest = $manifestText | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or @($manifest.modules).Count -ne 8 -or @($manifest.parts).Count -ne 100) {
    throw 'Cannot package release: dist/assembly-manifest.json must use schema 1 and contain eight modules and 100 parts.'
}
$moduleIds = @($manifest.modules | ForEach-Object { [string]$_.moduleId })
$partIds = @($manifest.parts | ForEach-Object { [string]$_.partId })
if (@($moduleIds | Where-Object { $_ } | Sort-Object -Unique).Count -ne 8) {
    throw 'Cannot package release: manifest module IDs must be eight nonempty unique values.'
}
if (@($partIds | Where-Object { $_ } | Sort-Object -Unique).Count -ne 100) {
    throw 'Cannot package release: manifest part IDs must be 100 nonempty unique values.'
}
$unknownPartModules = @($manifest.parts | Where-Object { $moduleIds -notcontains [string]$_.moduleId })
if ($unknownPartModules.Count -gt 0) {
    throw 'Cannot package release: every manifest part must reference one of the eight module IDs.'
}
foreach ($quality in @('high', 'low')) {
    $modelDirectory = Join-Path $ProjectRoot "dist\assets\models\$quality"
    $glbs = Get-NonEmptyFiles -Directory $modelDirectory -Filter '*.glb'
    if ($glbs.Count -ne 8) {
        throw "Cannot package release: expected eight $quality GLBs in $modelDirectory, found $($glbs.Count)."
    }
    $actualUrls = @($glbs | ForEach-Object { "assets/models/$quality/$($_.Name)" } | Sort-Object)
    $manifestUrls = @($manifest.modules | ForEach-Object {
        $url = [string]$_.urls.$quality
        if (
            -not $url -or $url -match '^[a-zA-Z][a-zA-Z0-9+.-]*:' -or
            $url.StartsWith('/') -or $url.Contains('\') -or
            @($url.Split('/')) -contains '..'
        ) {
            throw "Cannot package release: invalid $quality model URL '$url'."
        }
        $url
    } | Sort-Object)
    if (@($manifestUrls | Sort-Object -Unique).Count -ne 8) {
        throw "Cannot package release: manifest $quality model URLs must be unique."
    }
    if (Compare-Object -ReferenceObject $actualUrls -DifferenceObject $manifestUrls) {
        throw "Cannot package release: manifest $quality URLs do not correspond exactly to the eight packaged GLBs."
    }
}

$distAssets = Join-Path $ProjectRoot 'dist\assets'
foreach ($assetContract in @(
    [pscustomobject]@{ Directory = $distAssets; Filter = 'index-*.js'; Label = 'built JavaScript' },
    [pscustomobject]@{ Directory = $distAssets; Filter = 'index-*.css'; Label = 'built CSS' },
    [pscustomobject]@{ Directory = (Join-Path $distAssets 'textures'); Filter = '*'; Label = 'built textures' },
    [pscustomobject]@{ Directory = (Join-Path $ProjectRoot 'artifacts\textures'); Filter = '*'; Label = 'source textures' }
)) {
    if ((Get-NonEmptyFiles -Directory $assetContract.Directory -Filter $assetContract.Filter).Count -eq 0) {
        throw "Cannot package release: no nonempty $($assetContract.Label) were found in $($assetContract.Directory)."
    }
}
Assert-NonEmptyFile -Path (Join-Path $distAssets 'environment\studio-neutral-1k.hdr') -Label 'studio HDR'
foreach ($decoder in @('draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js')) {
    Assert-NonEmptyFile -Path (Join-Path $distAssets "draco\$decoder") -Label "Draco runtime $decoder"
}
foreach ($render in @('assembled-studio.png', 'exploded-studio.png')) {
    Assert-NonEmptyFile -Path (Join-Path $ProjectRoot "artifacts\renders\$render") -Label "reference render $render"
}
foreach ($view in @('front', 'left', 'rear', 'right', 'three-quarter', 'top')) {
    Assert-NonEmptyFile -Path (Join-Path $ProjectRoot "artifacts\renders\silhouette\$view.png") -Label "silhouette render $view"
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

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fixedTimestamp = [System.DateTimeOffset]::new(
    2000, 1, 1, 0, 0, 0,
    [System.TimeSpan]::Zero
)
$archiveStream = [System.IO.File]::Open(
    $archive,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
)
try {
    $zip = New-Object System.IO.Compression.ZipArchive(
        $archiveStream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    try {
        $stagingPrefixLength = $staging.Length + 1
        $relativePaths = [System.Collections.Generic.List[string]]::new()
        Get-ChildItem -LiteralPath $staging -Recurse -File | ForEach-Object {
            $relativePaths.Add($_.FullName.Substring($stagingPrefixLength).Replace('\', '/'))
        }
        $relativePaths.Sort([System.StringComparer]::Ordinal)
        foreach ($relativePath in $relativePaths) {
            $filePath = Join-Path $staging $relativePath.Replace('/', '\')
            $zipEntry = $zip.CreateEntry(
                "Z50II-Explorer/$relativePath",
                [System.IO.Compression.CompressionLevel]::Optimal
            )
            $zipEntry.LastWriteTime = $fixedTimestamp
            $zipEntry.ExternalAttributes = 0
            $sourceStream = [System.IO.File]::OpenRead($filePath)
            $entryStream = $zipEntry.Open()
            try {
                $sourceStream.CopyTo($entryStream)
            }
            finally {
                $entryStream.Dispose()
                $sourceStream.Dispose()
            }
        }
    }
    finally {
        $zip.Dispose()
    }
}
finally {
    $archiveStream.Dispose()
}
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
