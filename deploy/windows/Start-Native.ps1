#Requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Native.Common.ps1')
$paths=Get-NativePaths
$exe=Join-Path $paths.Bin 'minio.exe'
if(-not (Test-Path -LiteralPath $exe)){throw 'Jalankan npm.cmd run native:install terlebih dahulu.'}
$settings=Read-NativeEnvironment
$endpoint=[uri]$settings.endpoint
if($endpoint.Scheme -ne 'http' -or $endpoint.Host -notin @('localhost','127.0.0.1') -or $endpoint.AbsolutePath -ne '/'){throw 'Launcher native hanya untuk endpoint HTTP localhost/127.0.0.1 tanpa path. MinIO remote tetap dapat dipakai langsung oleh API.'}
$port=$endpoint.Port
$existing=Get-OwnedMinioProcess
if(-not $existing){
 if((Test-NativePort $port) -or (Test-NativePort 9001)){throw 'Port API atau console sudah terpakai. Hentikan layanan terkait atau gunakan MinIO yang sudah berjalan.'}
 New-Item -ItemType Directory -Force -Path $paths.Data,$paths.Logs|Out-Null
 $oldUser=[Environment]::GetEnvironmentVariable('MINIO_ROOT_USER','Process');$oldPassword=[Environment]::GetEnvironmentVariable('MINIO_ROOT_PASSWORD','Process')
 try{
  $env:MINIO_ROOT_USER=$settings.rootUser;$env:MINIO_ROOT_PASSWORD=$settings.rootPassword
  $arguments=@('--quiet','server',('"'+$paths.Data+'"'),'--address',('127.0.0.1:'+$port),'--console-address','127.0.0.1:9001')
  $process=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $paths.Root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $paths.Logs 'minio.stdout.log') -RedirectStandardError (Join-Path $paths.Logs 'minio.stderr.log')
  $process.Refresh()
  [pscustomobject]@{pid=$process.Id;startedTicks=$process.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath $paths.State
 }finally{[Environment]::SetEnvironmentVariable('MINIO_ROOT_USER',$oldUser,'Process');[Environment]::SetEnvironmentVariable('MINIO_ROOT_PASSWORD',$oldPassword,'Process')}
}
$ready=$false
for($attempt=0;$attempt -lt 40;$attempt++){
 try{$response=Invoke-WebRequest -Uri ($settings.endpoint.TrimEnd('/')+'/minio/health/live') -UseBasicParsing -TimeoutSec 2;if($response.StatusCode -eq 200){$ready=$true;break}}catch{}
 if(-not (Get-OwnedMinioProcess)){throw 'MinIO berhenti saat startup. Periksa .local/windows/logs.'}
 Start-Sleep -Milliseconds 500
}
if(-not $ready){throw 'MinIO belum siap. Periksa .local/windows/logs sebelum mencoba kembali.'}
& node (Join-Path $PSScriptRoot 'initialize-minio.cjs') $paths.Project
if($LASTEXITCODE -ne 0){throw 'Inisialisasi bucket MinIO gagal. Proses server tetap tersedia untuk pemeriksaan.'}
Write-Host ('MinIO native aktif: '+$settings.endpoint+' | Console: http://127.0.0.1:9001')
