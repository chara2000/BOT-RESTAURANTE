# Verifica que el bot Telegram responde y muestra estado del webhook
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"

function Get-EnvValue($name) {
    if (-not (Test-Path $envFile)) { return $null }
    foreach ($line in Get-Content $envFile) {
        if ($line -match "^$name=(.+)$") { return $matches[1].Trim() }
    }
    return $null
}

$token = Get-EnvValue "TELEGRAM_BOT_TOKEN"
if (-not $token) {
    Write-Host "Falta TELEGRAM_BOT_TOKEN en .env.local" -ForegroundColor Red
    exit 1
}

Write-Host "=== Bot Telegram ChefFlow ===" -ForegroundColor Cyan

try {
    $me = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getMe"
    if ($me.ok) {
        Write-Host "Bot: @$($me.result.username) ($($me.result.first_name))" -ForegroundColor Green
        Write-Host "  ID: $($me.result.id)"
    } else {
        Write-Host "getMe fallo: $($me.description)" -ForegroundColor Red
    }
} catch {
    Write-Host "Error getMe: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $wh = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
    if ($wh.ok) {
        $url = $wh.result.url
        if ($url) {
            Write-Host "Webhook activo: $url" -ForegroundColor Green
            Write-Host "  Pendientes: $($wh.result.pending_update_count)"
        } else {
            Write-Host "Sin webhook (n8n Cloud lo configura al activar Workflow 01)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "Error getWebhookInfo: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nPrueba en vivo:" -ForegroundColor Cyan
Write-Host "  1. Abre Telegram y busca @$($me.result.username)"
Write-Host "  2. Escribe: Hola, quiero una hamburguesa"
Write-Host "  3. El Workflow 01 (n8n Cloud) debe responder con Gemini"
Write-Host "  4. El pedido aparece en /pedidos del panel (Realtime Supabase)"
