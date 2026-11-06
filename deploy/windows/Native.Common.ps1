Set-StrictMode -Version Latest
function Get-NativePaths {
    $project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $root = Join-Path $project '.local/windows'
    return [pscustomobject]@{Project=$project;Root=$root;Bin=(Join-Path $root 'bin');Data=(Join-Path $root 'minio-data');Logs=(Join-Path $root 'logs');State=(Join-Path $root 'minio-process.json')}
}
function Read-NativeEnvironment {
    $paths=Get-NativePaths
    $json = & node (Join-Path $PSScriptRoot 'read-env.cjs') $paths.Project
    if ($LASTEXITCODE -ne 0) { throw 'Tidak dapat membaca konfigurasi lokal. Pastikan Node.js dan npm ci tersedia.' }
    return ($json | ConvertFrom-Json)
}
function Get-OwnedMinioProcess {
    $paths=Get-NativePaths
    if (-not (Test-Path -LiteralPath $paths.State)) { return $null }
    $state=Get-Content -LiteralPath $paths.State -Raw | ConvertFrom-Json
    $process=Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    $expected=[IO.Path]::GetFullPath((Join-Path $paths.Bin 'minio.exe'))
    if ($process.Path -ne $expected -or $process.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.startedTicks) { throw 'PID bukan proses MinIO milik proyek ini; tidak akan dihentikan atau dipakai ulang.' }
    return $process
}
function Test-NativePort([int]$Port) {
    $socket=New-Object Net.Sockets.TcpClient
    try { $pending=$socket.BeginConnect('127.0.0.1',$Port,$null,$null); if(-not $pending.AsyncWaitHandle.WaitOne(500)){return $false};$socket.EndConnect($pending);return $true } catch { return $false } finally { $socket.Dispose() }
}
