#Requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Native.Common.ps1')
$process=Get-OwnedMinioProcess
Write-Host ('MinIO proyek: '+$(if($process){'berjalan'}else{'tidak berjalan'}))
foreach($entry in @(@{Name='PostgreSQL';Port=5432},@{Name='Redis/Memurai';Port=6379},@{Name='SMTP lokal';Port=1025},@{Name='ClamAV';Port=3310},@{Name='MinIO API default';Port=9000},@{Name='MinIO console';Port=9001})){
 Write-Host ($entry.Name+' ('+$entry.Port+'): '+$(if(Test-NativePort $entry.Port){'port terbuka'}else{'belum tersedia'}))
}
Write-Host 'Status port hanya pemeriksaan listener, bukan verifikasi autentikasi/protokol.'
