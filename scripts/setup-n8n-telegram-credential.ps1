# Crea credencial Telegram en n8n (solo necesaria para Workflow 01 con webhook/ngrok)
$envFile = Join-Path $PSScriptRoot "..\.env.docker"
$token = (Get-Content $envFile | Where-Object { $_ -match '^TELEGRAM_BOT_TOKEN=' }) -replace 'TELEGRAM_BOT_TOKEN=',''

if (-not $token) {
    Write-Host "TELEGRAM_BOT_TOKEN vacio en .env.docker" -ForegroundColor Red
    exit 1
}

$credId = "c0000000-0000-4000-8000-000000000001"
$credJson = @"
[
  {
    "id": "$credId",
    "name": "Telegram ChefFlow Bot",
    "type": "telegramApi",
    "data": {
      "accessToken": "$token"
    }
  }
]
"@

$tempFile = Join-Path $env:TEMP "chefflow-telegram-cred.json"
[System.IO.File]::WriteAllText($tempFile, $credJson, [System.Text.UTF8Encoding]::new($false))

docker cp $tempFile chefflow-n8n:/tmp/telegram-cred.json
docker exec chefflow-n8n n8n import:credentials --input=/tmp/telegram-cred.json 2>&1
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Credencial Telegram importada (id: $credId)" -ForegroundColor Green
Write-Host "Solo necesaria si usas Workflow 01 (webhook + HTTPS/ngrok)." -ForegroundColor Gray
Write-Host "Para local usa Workflow 01b - no requiere credenciales." -ForegroundColor Cyan
