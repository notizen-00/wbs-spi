#Requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Native.Common.ps1')
$paths = Get-NativePaths
$scannerRoot = Join-Path $paths.Root 'clamav'
$downloads = Join-Path $paths.Root 'downloads'
New-Item -ItemType Directory -Force -Path $scannerRoot,$downloads | Out-Null
$archive = Join-Path $downloads 'clamav-1.5.4.win.x64.zip'
if (-not (Test-Path -LiteralPath $archive)) {
  & curl.exe -L --fail --output ($archive + '.part') 'https://www.clamav.net/downloads/production/clamav-1.5.4.win.x64.zip'
  if ($LASTEXITCODE -ne 0) { throw 'Unduhan ClamAV gagal. Unduh ZIP resmi dan simpan ke .local/windows/downloads, lalu ulangi.' }
  Move-Item -LiteralPath ($archive + '.part') -Destination $archive -Force
}
if (-not (Get-ChildItem -LiteralPath $scannerRoot -Filter clamd.exe -Recurse | Select-Object -First 1)) {
  Expand-Archive -LiteralPath $archive -DestinationPath $scannerRoot -Force
}
$engine = Get-ChildItem -LiteralPath $scannerRoot -Filter clamd.exe -Recurse | Select-Object -First 1
if (-not $engine) { throw 'clamd.exe tidak ditemukan dalam ZIP resmi.' }
$database = Join-Path $scannerRoot 'database'
New-Item -ItemType Directory -Force -Path $database,$paths.Logs | Out-Null
$dbPath = $database.Replace('\','/')
$logPath = (Join-Path $paths.Logs 'freshclam.log').Replace('\','/')
@"
DatabaseDirectory "$dbPath"
DatabaseMirror database.clamav.net
UpdateLogFile "$logPath"
"@ | Set-Content -LiteralPath (Join-Path $scannerRoot 'freshclam.conf') -Encoding Ascii
$clamLog = (Join-Path $paths.Logs 'clamd.log').Replace('\','/')
@"
DatabaseDirectory "$dbPath"
TCPAddr 127.0.0.1
TCPSocket 3310
StreamMaxLength 25M
MaxFileSize 25M
MaxScanSize 100M
AlertExceedsMax yes
LogFile "$clamLog"
Foreground yes
"@ | Set-Content -LiteralPath (Join-Path $scannerRoot 'clamd.conf') -Encoding Ascii
& (Join-Path $engine.DirectoryName 'freshclam.exe') --quiet ('--config-file=' + (Join-Path $scannerRoot 'freshclam.conf'))
if ($LASTEXITCODE -ne 0) { throw 'Update definisi virus gagal. Periksa .local/windows/logs/freshclam.log, lalu ulangi installer. Jangan menonaktifkan pemindaian.' }
& (Join-Path $PSScriptRoot 'Start-Scanner.ps1')
