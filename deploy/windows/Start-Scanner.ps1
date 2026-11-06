#Requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Native.Common.ps1')
$paths = Get-NativePaths
if (Test-NativePort 3310) { Write-Host 'Port ClamAV sudah aktif. Verifikasi dengan npm run scanner:check.'; return }
$scannerRoot = Join-Path $paths.Root 'clamav'
$engine = Get-ChildItem -LiteralPath $scannerRoot -Filter clamd.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$config = Join-Path $scannerRoot 'clamd.conf'
if (-not $engine -or -not (Test-Path -LiteralPath $config)) { throw 'Jalankan npm run native:scanner:install terlebih dahulu.' }
New-Item -ItemType Directory -Force -Path $paths.Logs | Out-Null
$process = Start-Process -FilePath $engine.FullName -ArgumentList ('--config-file="'+$config+'"') -WorkingDirectory $engine.DirectoryName -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $paths.Logs 'clamd.stdout.log') -RedirectStandardError (Join-Path $paths.Logs 'clamd.stderr.log')
Write-Host ('ClamAV dimulai dengan PID '+$process.Id+'. Tunggu pemuatan definisi, lalu jalankan npm run scanner:check. Log: .local/windows/logs/clamd.log')
