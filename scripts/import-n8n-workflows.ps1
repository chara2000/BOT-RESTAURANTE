# Importar workflows ChefFlow a n8n Docker
$workflowsDir = Join-Path $PSScriptRoot "..\n8n\workflows"
$container = "chefflow-n8n"

Write-Host "Importando workflows ChefFlow a n8n..." -ForegroundColor Cyan

$files = Get-ChildItem "$workflowsDir\*.json" | Sort-Object Name
foreach ($file in $files) {
    $containerPath = "/import/workflows/$($file.Name)"
    Write-Host "  -> $($file.Name)" -ForegroundColor Yellow
    docker exec $container n8n import:workflow --input=$containerPath 2>&1
}

Write-Host "`nWorkflows importados. Abre http://localhost:5678" -ForegroundColor Green
Write-Host "Activa los workflows y configura credencial Telegram si aplica." -ForegroundColor Gray
