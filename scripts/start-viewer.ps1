param(
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$hostAddress = '127.0.0.1'
$port = 4173
$url = "http://${hostAddress}:$port"
$dist = Join-Path $PSScriptRoot 'dist'

if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) {
    throw "Packaged viewer was not found at $dist. Keep start-viewer.ps1 beside the dist directory."
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($hostAddress), $port)
try {
    $listener.Start()
}
catch {
    throw "Port $port on $hostAddress is unavailable. Close the process using it, then run this launcher again."
}
finally {
    $listener.Stop()
}

$python = $null
foreach ($candidate in @(
    [pscustomobject]@{ Name = 'py.exe'; Prefix = @('-3') },
    [pscustomobject]@{ Name = 'python.exe'; Prefix = @() },
    [pscustomobject]@{ Name = 'python3.exe'; Prefix = @() }
)) {
    $command = Get-Command $candidate.Name -ErrorAction SilentlyContinue
    if (-not $command) { continue }
    & $command.Source @($candidate.Prefix) -c 'import sys; assert sys.version_info >= (3, 8)' 2>$null
    if ($LASTEXITCODE -eq 0) {
        $python = [pscustomobject]@{ Executable = $command.Source; Prefix = @($candidate.Prefix) }
        break
    }
}

if (-not $python) {
    throw 'Python 3.8 or newer was not found. Install Python, then run start-viewer.ps1 again; Node.js is not required.'
}

Write-Output "Serving the offline Nikon Z50II Explorer at $url"
Write-Output 'Press Ctrl+C in this window to stop the viewer.'
if (-not $NoOpen) {
    Start-Process $url
}
& $python.Executable @($python.Prefix) -m http.server $port --bind $hostAddress --directory $dist
exit $LASTEXITCODE
