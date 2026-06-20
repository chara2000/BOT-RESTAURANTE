# Activar workflows ChefFlow en n8n Cloud via MCP (IDs reales desplegados)
param(
    [string[]]$Activate = @(
        "I4ndLDmfp8qxSbgi",
        "B6LT5k3pWMRQK1Lk",
        "XX2cA0o2qfeY7IHT",
        "ltl5Qpbv7cR7BsuQ",
        "GVQi1jJn9dPsrA6R"
    ),
    [string[]]$Deactivate = @(
        "BPSPFNlNLUzuyTwG",
        "RrJwDC0f8QbnJN3M"
    )
)

$envFile = Join-Path $PSScriptRoot "..\.env.local"

function Get-EnvValue($name) {
    if (-not (Test-Path $envFile)) { return $null }
    $line = Get-Content $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace "^$name=", "").Trim()
}

$apiUrl = Get-EnvValue "N8N_API_URL"
$apiKey = Get-EnvValue "N8N_API_KEY"

if (-not $apiUrl -or -not $apiKey) {
    Write-Host "Configura N8N_API_URL y N8N_API_KEY en .env.local" -ForegroundColor Red
    exit 1
}

$headers = @{ "X-N8N-API-KEY" = $apiKey }

function Invoke-WorkflowAction($id, $action) {
    Write-Host "$action workflow $id..." -ForegroundColor Cyan
    try {
        Invoke-RestMethod -Uri "$apiUrl/workflows/$id/$action" -Headers $headers -Method POST | Out-Null
        Write-Host "  OK" -ForegroundColor Green
    } catch {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

foreach ($id in $Deactivate) { Invoke-WorkflowAction $id "deactivate" }
foreach ($id in $Activate) { Invoke-WorkflowAction $id "activate" }

Write-Host "`nWorkflows configurados en n8n Cloud." -ForegroundColor Green
