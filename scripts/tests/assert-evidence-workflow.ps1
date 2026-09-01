param(
    [string]$ProjectRoot = (Join-Path $PSScriptRoot '..\..'),
    [switch]$SkipNormalE2E,
    [switch]$SkipBuildAll,
    [switch]$SkipRefreshProof
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$pnpmRunner = Join-Path $ProjectRoot 'scripts\pnpm.ps1'
$buildRunner = Join-Path $ProjectRoot 'scripts\build-all.ps1'
$performanceEvidence = Join-Path $ProjectRoot 'artifacts\validation\performance.json'
$visualBaseline = Join-Path $ProjectRoot 'tests\e2e\__screenshots__\z50ii-assembled-studio.png'
Push-Location $ProjectRoot
try {
    $trackedScreenshotEvidence = @(& git ls-files `
        '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/*.png' |
        ForEach-Object { Join-Path $ProjectRoot $_ })
    if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate committed screenshot evidence.' }
    $trackedBuildOutputs = @(& git ls-files `
        'artifacts/z50ii_master.blend' `
        'artifacts/renders/assembled-studio.png' `
        'artifacts/renders/exploded-studio.png' `
        'public/assets/models/high/*.glb' `
        'public/assets/models/low/*.glb' |
        ForEach-Object { Join-Path $ProjectRoot $_ })
    if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate tracked build outputs.' }
}
finally {
    Pop-Location
}
$refreshableEvidence = @($performanceEvidence, $visualBaseline) + $trackedScreenshotEvidence
$filesToRestore = @($refreshableEvidence + $trackedBuildOutputs | Sort-Object -Unique)

function ConvertTo-RepositoryPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $absolutePath = [System.IO.Path]::GetFullPath($Path)
    $rootPrefix = $ProjectRoot.TrimEnd('\') + '\'
    if (-not $absolutePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the repository: $absolutePath"
    }
    return $absolutePath.Substring($rootPrefix.Length).Replace('\', '/')
}

function Get-TrackedHashes {
    $hashes = @{}
    Push-Location $ProjectRoot
    try {
        $trackedPaths = @(& git ls-files)
        if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate tracked files.' }
        foreach ($relativePath in $trackedPaths) {
            $absolutePath = Join-Path $ProjectRoot $relativePath
            if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
                $hashes[$relativePath] = '<missing>'
                continue
            }
            $hashes[$relativePath] = (Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash
        }
    }
    finally {
        Pop-Location
    }
    return $hashes
}

function Assert-TrackedHashesEqual {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Before,
        [Parameter(Mandatory = $true)][hashtable]$After,
        [Parameter(Mandatory = $true)][string]$Label,
        [string[]]$AllowedChanges = @()
    )
    $allowed = @{}
    foreach ($path in $AllowedChanges) {
        $relative = ConvertTo-RepositoryPath $path
        $allowed[$relative] = $true
    }
    $allPaths = @($Before.Keys + $After.Keys | Sort-Object -Unique)
    $unexpected = @($allPaths | Where-Object {
        -not $allowed.ContainsKey($_) -and $Before[$_] -ne $After[$_]
    })
    if ($unexpected.Count -gt 0) {
        throw "$Label changed tracked files outside the allowed evidence set: $($unexpected -join ', ')"
    }
}

function Assert-PathsEqual {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Before,
        [Parameter(Mandatory = $true)][hashtable]$After,
        [Parameter(Mandatory = $true)][string[]]$Paths,
        [Parameter(Mandatory = $true)][string]$Label
    )
    $changed = @($Paths | ForEach-Object {
        $relative = ConvertTo-RepositoryPath $_
        if ($Before[$relative] -ne $After[$relative]) { $relative }
    })
    if ($changed.Count -gt 0) {
        throw "$Label changed committed evidence: $($changed -join ', ')"
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    Write-Output "[evidence-workflow] $Label"
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

foreach ($path in $filesToRestore) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing committed evidence file: $path"
    }
}
$savedFiles = @{}
foreach ($path in $filesToRestore) {
    $savedFiles[$path] = [System.IO.File]::ReadAllBytes($path)
}

try {
    if (-not $SkipNormalE2E) {
        $beforeE2E = Get-TrackedHashes
        Invoke-Checked 'Run normal E2E command' { & $pnpmRunner test:e2e }
        $afterE2E = Get-TrackedHashes
        Assert-TrackedHashesEqual -Before $beforeE2E -After $afterE2E -Label 'Normal E2E command'
    }

    if (-not $SkipBuildAll) {
        $beforeBuild = Get-TrackedHashes
        Invoke-Checked 'Run normal complete build' {
            & powershell -ExecutionPolicy Bypass -File $buildRunner -ProjectRoot $ProjectRoot
        }
        $afterBuild = Get-TrackedHashes
        Assert-PathsEqual `
            -Before $beforeBuild `
            -After $afterBuild `
            -Paths $refreshableEvidence `
            -Label 'Normal complete build'
    }

    if (-not $SkipRefreshProof) {
        $beforeRefresh = Get-TrackedHashes
        Invoke-Checked 'Run explicit evidence refresh' { & $pnpmRunner evidence:refresh }
        $afterRefresh = Get-TrackedHashes
        Assert-TrackedHashesEqual `
            -Before $beforeRefresh `
            -After $afterRefresh `
            -Label 'Explicit evidence refresh' `
            -AllowedChanges $refreshableEvidence
        $relativePerformance = ConvertTo-RepositoryPath $performanceEvidence
        if ($beforeRefresh[$relativePerformance] -eq $afterRefresh[$relativePerformance]) {
            throw 'Explicit evidence refresh did not update performance.json.'
        }
    }

    if ($SkipRefreshProof) {
        Write-Output '[evidence-workflow] PASS: normal E2E preserved every tracked file and the complete build preserved committed evidence.'
    }
    else {
        Write-Output '[evidence-workflow] PASS: normal commands preserved tracked files and refresh was scoped.'
    }
}
finally {
    foreach ($path in $filesToRestore) {
        [System.IO.File]::WriteAllBytes($path, $savedFiles[$path])
    }
}
