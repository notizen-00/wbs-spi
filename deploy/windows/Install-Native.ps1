#Requires -Version 5.1
[CmdletBinding()]
param([switch]$Start)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Native.Common.ps1')
$paths = Get-NativePaths
$go = Get-Command go.exe -ErrorAction SilentlyContinue
if (-not $go) { throw 'Go 1.24+ diperlukan. Pasang Go dari https://go.dev/dl/ lalu buka terminal baru dan ulangi installer.' }
New-Item -ItemType Directory -Force -Path $paths.Bin, $paths.Data, $paths.Logs | Out-Null
$settings = @{ GOBIN=$paths.Bin; GOPATH=(Join-Path $paths.Root 'go'); GOCACHE=(Join-Path $paths.Root 'go-cache'); GOMODCACHE=(Join-Path $paths.Root 'go-mod'); CGO_ENABLED='0' }
$previous = @{}
try {
    foreach ($key in $settings.Keys) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process'); [Environment]::SetEnvironmentVariable($key,$settings[$key],'Process') }
    $packages = @(
        @{ Name='minio'; Module='github.com/minio/minio@RELEASE.2025-09-07T16-13-09Z' },
        @{ Name='mc'; Module='github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z' }
    )
    foreach ($package in $packages) {
        $target = Join-Path $paths.Bin ($package.Name + '.exe')
        if (Test-Path -LiteralPath $target) { Write-Host ($package.Name + ' sudah tersedia; tidak ditimpa.'); continue }
        Write-Host ('Membangun ' + $package.Name + ' dari source resmi. Build pertama dapat memerlukan beberapa menit...')
        & $go.Source install -trimpath -ldflags '-s -w' $package.Module
        if ($LASTEXITCODE -ne 0) { throw ('Build '+$package.Name+' gagal. Periksa output Go dan akses jaringan.') }
        if (-not (Test-Path -LiteralPath $target)) { throw ('Binary '+$package.Name+' tidak ditemukan setelah build.') }
    }
    $manifest = foreach ($package in $packages) { $exe=Join-Path $paths.Bin ($package.Name+'.exe'); [pscustomobject]@{name=$package.Name;source=$package.Module;sha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash} }
    $manifest | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $paths.Root 'binaries.json')
} finally {
    foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
}
Write-Host 'Installer native selesai. Binary dan data berada di .local/windows; tidak memerlukan Docker.'
if ($Start) { & (Join-Path $PSScriptRoot 'Start-Native.ps1') }
