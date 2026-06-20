# Libera puertos, limpia caché de dev y arranca el servidor
param(
    [ValidateSet('webpack', 'turbo')]
    [string]$Mode = 'webpack'
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

foreach ($port in @(3000, 3001)) {
    $pids = netstat -ano | Select-String ":$port\s" | ForEach-Object {
        if ($_ -match '\s(\d+)\s*$') { [int]$matches[1] }
    } | Sort-Object -Unique

    foreach ($procId in $pids) {
        if ($procId -gt 0) {
            Write-Host "Deteniendo PID $procId (puerto $port)..." -ForegroundColor Yellow
            taskkill /PID $procId /F | Out-Null
        }
    }
}

Start-Sleep -Seconds 2

foreach ($dir in @('.next\dev', '.next\cache')) {
    if (Test-Path $dir) {
        Write-Host "Limpiando $dir..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $dir
    }
}

if (Test-Path '.next\dev\lock') {
    Remove-Item -Force '.next\dev\lock'
}

if ($Mode -eq 'turbo') {
    Write-Host "Iniciando next dev --turbopack en http://localhost:3000" -ForegroundColor Cyan
    npm run dev:turbo
} else {
    Write-Host "Iniciando next dev --webpack en http://localhost:3000" -ForegroundColor Cyan
    npm run dev
}
