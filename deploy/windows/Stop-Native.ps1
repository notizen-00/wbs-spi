#Requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Native.Common.ps1')
$paths=Get-NativePaths
$process=Get-OwnedMinioProcess
if($process){Stop-Process -Id $process.Id;[void]$process.WaitForExit(10000);Write-Host 'MinIO native dihentikan. Data dan bucket tetap tersimpan.'}else{Write-Host 'Tidak ada proses MinIO proyek ini yang aktif.'}
if(Test-Path -LiteralPath $paths.State){Remove-Item -LiteralPath $paths.State}
