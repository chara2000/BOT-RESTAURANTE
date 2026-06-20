# Importar workflows ChefFlow a n8n Cloud via API REST
# Requiere: N8N_API_URL y N8N_API_KEY en .env.local

$root = Join-Path $PSScriptRoot ".."
$envFile = Join-Path $root ".env.local"

function Get-EnvValue($name) {
    if (-not (Test-Path $envFile)) { return $null }
    $line = Get-Content $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace "^$name=", "").Trim()
}

$apiUrl = Get-EnvValue "N8N_API_URL"
$apiKey = Get-EnvValue "N8N_API_KEY"

if (-not $apiUrl -or -not $apiKey) {
    Write-Host "Configura en .env.local:" -ForegroundColor Red
    Write-Host "  N8N_API_URL=https://tu-instancia.app.n8n.cloud/api/v1"
    Write-Host "  N8N_API_KEY=tu-api-key"
    exit 1
}

$headers = @{
    "X-N8N-API-KEY" = $apiKey
    "Content-Type"  = "application/json"
}

$workflowsDir = Join-Path $root "n8n\workflows"
# En Cloud (HTTPS) usar Workflow 01; 01b es solo para local sin HTTPS
$files = @(
    "01-telegram-gemini-pedidos.json",
    "02-webhook-estado-pedido.json",
    "03-alerta-stock-bajo.json",
    "04-reporte-ventas-diario.json",
    "05-webhook-nuevo-pedido.json"
)

Write-Host "Importando workflows a n8n Cloud..." -ForegroundColor Cyan
Write-Host "  API: $apiUrl" -ForegroundColor Gray

foreach ($file in $files) {
    $path = Join-Path $workflowsDir $file
    if (-not (Test-Path $path)) {
        Write-Host "  SKIP $file (no existe)" -ForegroundColor Yellow
        continue
    }

    $wf = Get-Content $path -Raw | ConvertFrom-Json
    $wfId = $wf.id
    $payload = @{
        name        = $wf.name
        nodes       = $wf.nodes
        connections = $wf.connections
        settings    = $wf.settings
    }
    if ($wf.tags) { $payload.tags = $wf.tags }

    $body = $payload | ConvertTo-Json -Depth 100 -Compress

    Write-Host "  -> $($wf.name)" -ForegroundColor Yellow

    try {
        $existing = Invoke-RestMethod -Uri "$apiUrl/workflows/$wfId" -Headers $headers -Method GET -ErrorAction SilentlyContinue
        if ($existing) {
            Invoke-RestMethod -Uri "$apiUrl/workflows/$wfId" -Headers $headers -Method PUT -Body $body | Out-Null
            Write-Host "     Actualizado (id: $wfId)" -ForegroundColor Green
        }
    } catch {
        try {
            $created = Invoke-RestMethod -Uri "$apiUrl/workflows" -Headers $headers -Method POST -Body $body
            Write-Host "     Creado (id: $($created.id))" -ForegroundColor Green
        } catch {
            Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`nImportacion completada." -ForegroundColor Green
Write-Host "Siguiente: activa workflows en tu panel n8n Cloud y configura variables de entorno." -ForegroundColor Gray
