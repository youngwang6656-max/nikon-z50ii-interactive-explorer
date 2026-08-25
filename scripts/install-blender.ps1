$ErrorActionPreference = 'Stop'
$version = '4.5.12'
$toolsRoot = Join-Path $PSScriptRoot '..\tools'
$archive = Join-Path $toolsRoot "blender-$version-windows-x64.zip"
$checksumFile = Join-Path $toolsRoot "blender-$version.sha256"
$installDir = Join-Path $toolsRoot "blender-$version-windows-x64"
$base = "https://download.blender.org/release/Blender4.5"

New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
Invoke-WebRequest "$base/blender-$version-windows-x64.zip" -OutFile $archive
Invoke-WebRequest "$base/blender-$version.sha256" -OutFile $checksumFile
$expected = (Select-String -Path $checksumFile -Pattern "blender-$version-windows-x64.zip").Line.Split(' ')[0].Trim()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
if ($actual -ne $expected.ToLowerInvariant()) { throw "Blender archive checksum mismatch" }
Expand-Archive -LiteralPath $archive -DestinationPath $toolsRoot -Force
& (Join-Path $installDir 'blender.exe') --version
