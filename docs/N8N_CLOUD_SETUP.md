# n8n Cloud — ChefFlow

ChefFlow usa **n8n Cloud** (web), no Docker local.

## 1. Credenciales en `.env.local`

Pega tus datos de n8n Cloud:

```env
# Instancia ChefFlow
N8N_WEBHOOK_URL=https://juanchara.app.n8n.cloud
N8N_API_URL=https://juanchara.app.n8n.cloud/rest
N8N_API_KEY=tu-public-api-key
N8N_MCP_URL=https://juanchara.app.n8n.cloud/mcp-server/http
N8N_MCP_TOKEN=tu-token-mcp-bearer
```

**Dos tokens distintos:**
| Token | Para qué | Dónde obtenerlo |
|-------|----------|-----------------|
| `N8N_MCP_TOKEN` | Cursor MCP (`mcp.json`) | Settings → MCP Server |
| `N8N_API_KEY` | Scripts PowerShell / REST | Settings → **n8n API** → Public API Key |

**Reinicia** Cursor (MCP) y `npm run dev` (webhooks) después de guardar.

---

## 2. Variables de entorno en n8n Cloud

En tu instancia n8n Cloud → **Settings** → **Variables** (o Environments), crea:

| Variable | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://jeuvobmjhuyskxepdbmt.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (de Supabase Dashboard) |
| `GEMINI_API_KEY` | (Google AI Studio) |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `TELEGRAM_BOT_TOKEN` | (BotFather) |

---

## 3. Credencial Telegram en n8n Cloud

1. **Credentials** → **Add credential** → **Telegram API**
2. Nombre: `Telegram ChefFlow Bot`
3. Access Token: tu `TELEGRAM_BOT_TOKEN`
4. En el Workflow **01**, nodo **Telegram Trigger** → selecciona esa credencial

---

## 4. Importar workflows

```powershell
.\scripts\import-n8n-cloud.ps1
.\scripts\activar-n8n-cloud.ps1
```

O importa manualmente desde `n8n/workflows/*.json` en la UI.

---

## 5. Workflows recomendados en Cloud

| Workflow | Usar en Cloud |
|----------|---------------|
| **01** Telegram + Gemini + Supabase | **Sí** (HTTPS incluido) |
| **01b** Polling local | **No** (solo Docker sin HTTPS) |
| **02–05** Webhooks y cron | **Sí** |

---

## 6. Webhooks (URLs para la app)

```
POST {N8N_WEBHOOK_URL}/webhook/chefflow-order-status
POST {N8N_WEBHOOK_URL}/webhook/chefflow-new-order
```

La app Next.js llama automáticamente al cambiar pedidos en el Kanban.

---

## 7. MCP Cursor

Ya configurado en `~/.cursor/mcp.json`:

```json
"n8n-mcp": {
  "type": "http",
  "url": "https://juanchara.app.n8n.cloud/mcp-server/http",
  "headers": {
    "Authorization": "Bearer TU_N8N_MCP_TOKEN"
  }
}
```

Reinicia Cursor para activar el MCP.

---

## Docker n8n (legacy)

El contenedor Docker ya no es necesario. Si existe, no lo inicies:

```powershell
docker compose --profile local-n8n down
```
