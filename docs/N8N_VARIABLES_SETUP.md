# Guía: Configuración n8n Cloud (ChefFlow)

n8n Cloud **bloquea** `$env.*` en nodos HTTP (`N8N_BLOCK_ENV_ACCESS_IN_NODE`).
Las **Variables** (`$vars`) requieren plan Pro en n8n Cloud.

## Solución aplicada (Starter / sin Variables)

Los workflows ChefFlow usan **valores inline** leídos de `.env.local` (URL Supabase, claves API, token Telegram).

Para actualizar todos los workflows en n8n Cloud:

```powershell
node scripts/fix-n8n-inline-config.mjs
```

Requiere `N8N_MCP_TOKEN` en `.env.local`.

## Alternativa: Variables n8n (solo plan Pro)

Si tienes plan Pro, puedes usar `$vars` en lugar de valores inline:

1. Settings → Variables → crear: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TELEGRAM_BOT_TOKEN`
2. Ejecutar: `node scripts/fix-n8n-env-to-vars.mjs`

## Probar el bot

**No uses "Test workflow"** con el bot publicado (error de Telegram Trigger).

1. Abre Telegram → `@mi_restaurante_prueba_bot`
2. Escribe: `Hola, quiero ver el menú`
3. Verifica ejecución en n8n → Workflow 01 → Executions

```powershell
npm run test:telegram
```

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `access to env vars denied` | Nodos usan `$env` | `node scripts/fix-n8n-inline-config.mjs` |
| `can't listen for test and production` | Test workflow con bot activo | Escribe al bot en Telegram, no uses Test |
| Bot no responde | Workflow falló en ejecución | Revisa Executions en n8n Cloud |
