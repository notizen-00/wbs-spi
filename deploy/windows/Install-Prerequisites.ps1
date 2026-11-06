#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('Node','Go','PostgreSQL','Redis','Mailpit')][string[]]$Component)
$ErrorActionPreference='Stop'
if(-not (Get-Command winget.exe -ErrorAction SilentlyContinue)){throw 'Pasang Microsoft App Installer (winget) terlebih dahulu.'}
$packages=@{Node='OpenJS.NodeJS.LTS';Go='GoLang.Go';PostgreSQL='PostgreSQL.PostgreSQL.17';Redis='Memurai.MemuraiDeveloper';Mailpit='axllent.mailpit'}
foreach($name in $Component){
 Write-Host ('Menjalankan installer '+$name+'. Selesaikan dialog vendor bila diminta.')
 & winget.exe install --id $packages[$name] --exact --source winget --interactive
 if($LASTEXITCODE -ne 0){throw ('Installer '+$name+' belum selesai. Periksa keluaran winget.')}
}
Write-Host 'Buka terminal baru agar PATH diperbarui. Konfigurasi/database yang sudah ada tidak diubah oleh script WBS.'
