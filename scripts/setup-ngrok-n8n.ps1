# Configurar ngrok + reiniciar n8n para Telegram webhook HTTPS
param(
    [string]$NgrokUrl = ""
)

$envFile = Join-Path $PSScriptRoot "..\.env.docker"
$projectDir = Join-Path $PSScriptRoot ".."

if (-not $NgrokUrl) {
    Write-Host "Obteniendo URL de ngrok (http://127.0.0.1:4040/api/tunnels)..." -ForegroundColor Cyan
    try {
        $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
        $NgrokUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
    } catch {
        Write-Host "ERROR: ngrok no esta corriendo." -ForegroundColor Red
        Write-Host "1. Instala ngrok: https://ngrok.com/download" -ForegroundColor Yellow
        Write-Host "2. En otra terminal: ngrok http 5678" -ForegroundColor Yellow
        Write-Host "3. Vuelve a ejecutar este script" -ForegroundColor Yellow
        exit 1
    }
}

if (-not $NgrokUrl) {
    Write-Host "ERROR: No se encontro tunel HTTPS de ngrok." -ForegroundColor Red
    exit 1
}

$hostName = ([Uri]$NgrokUrl).Host
$content = Get-Content $envFile -Raw

$content = $content -replace '(?m)^N8N_HOST=.*', "N8N_HOST=$hostName"
$content = $content -replace '(?m)^N8N_PROTOCOL=.*', "N8N_PROTOCOL=https"
$content = $content -replace '(?m)^WEBHOOK_URL=.*', "WEBHOOK_URL=$NgrokUrl/"
if ($content -notmatch 'N8N_EDITOR_BASE_URL=') {
    $content += "`nN8N_EDITOR_BASE_URL=$NgrokUrl/`n"
} else {
    $content = $content -replace '(?m)^N8N_EDITOR_BASE_URL=.*', "N8N_EDITOR_BASE_URL=$NgrokUrl/"
}

Set-Content -Path $envFile -Value $content.TrimEnd() -NoNewline
Add-Content -Path $envFile -Value ""

Write-Host "Actualizado .env.docker:" -ForegroundColor Green
Write-Host "  WEBHOOK_URL=$NgrokUrl/" -ForegroundColor White

Write-Host "Reiniciando n8n..." -ForegroundColor Cyan
Push-Location $projectDir
docker compose up -d --force-recreate n8n
Pop-Location

Write-Host "`nListo. Ahora en n8n:" -ForegroundColor Green
Write-Host "  1. Desactiva y reactiva el Workflow 01 (Telegram Trigger)" -ForegroundColor White
Write-Host "  2. Accede a n8n via: $NgrokUrl" -ForegroundColor White
