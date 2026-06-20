# Activar Telegram polling local (sin HTTPS/ngrok)
$envFile = Join-Path $PSScriptRoot "..\.env.docker"
$token = (Get-Content $envFile | Where-Object { $_ -match '^TELEGRAM_BOT_TOKEN=' }) -replace 'TELEGRAM_BOT_TOKEN=',''

Write-Host "1. Eliminando webhook de Telegram (requerido para polling)..." -ForegroundColor Cyan
$r = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/deleteWebhook?drop_pending_updates=true"
if ($r.ok) { Write-Host "   Webhook eliminado OK" -ForegroundColor Green }
else { Write-Host "   Error: $($r.description)" -ForegroundColor Red }

Write-Host "`n2. Importando credencial Telegram (Workflow 01)..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "setup-n8n-telegram-credential.ps1")

Write-Host "`n3. Importando workflows..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "import-n8n-workflows.ps1")

Write-Host "`n4. Activando workflows en n8n..." -ForegroundColor Cyan
$activate = @(
    "a1111111-1111-4111-8111-111111111106",
    "a1111111-1111-4111-8111-111111111102",
    "a1111111-1111-4111-8111-111111111103",
    "a1111111-1111-4111-8111-111111111104",
    "a1111111-1111-4111-8111-111111111105"
)
$deactivate = @("a1111111-1111-4111-8111-111111111101")

foreach ($id in $deactivate) {
    docker exec chefflow-n8n n8n unpublish:workflow --id=$id 2>&1 | Out-Null
    Write-Host "   Desactivado: $id (Workflow 01 webhook - requiere credencial + HTTPS)" -ForegroundColor Yellow
}
foreach ($id in $activate) {
    docker exec chefflow-n8n n8n publish:workflow --id=$id 2>&1 | Out-Null
    Write-Host "   Activado: $id" -ForegroundColor Green
}

Write-Host "`n5. Reiniciando n8n para aplicar cambios..." -ForegroundColor Cyan
docker compose -f (Join-Path $PSScriptRoot "..\docker-compose.yml") restart n8n | Out-Null
Start-Sleep -Seconds 8

Write-Host "`n=== LISTO ===" -ForegroundColor Green
Write-Host "Escribe a @mi_restaurante_prueba_bot en Telegram" -ForegroundColor White
Write-Host "El bot responde cada ~15 segundos (Workflow 01b)" -ForegroundColor White
Write-Host "Panel n8n: http://localhost:5678" -ForegroundColor White
