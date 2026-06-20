# Configuración Supabase + n8n — ChefFlow

## Supabase (conectado vía MCP)

**Proyecto:** AUTOMATIZACIONES RESTAURANTES  
**ID:** `jeuvobmjhuyskxepdbmt`  
**URL:** https://jeuvobmjhuyskxepdbmt.supabase.co

### Migraciones aplicadas
1. `chefflow_initial_schema` — 18 tablas + enums
2. `chefflow_triggers_indexes_rls` — triggers, índices, RLS base
3. `chefflow_extensions` — settings, chat, promociones, auditoría, realtime

### Datos seed
- Tenant: **ChefFlow Restaurante** (`chefflow`)
- Sucursal: Sede El Poblado
- 3 categorías, 3 productos, 2 clientes, 2 items inventario

### Variables (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://jeuvobmjhuyskxepdbmt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ya configurada>
SUPABASE_SERVICE_ROLE_KEY=<obtener en Dashboard → Settings → API>
```

> **Importante:** Copia la `service_role key` desde [Supabase Dashboard](https://supabase.com/dashboard/project/jeuvobmjhuyskxepdbmt/settings/api) a `.env.local` y `.env.docker`.

---

## n8n Cloud (activo)

ChefFlow usa **n8n Cloud**, no Docker local. Guía completa: [N8N_CLOUD_SETUP.md](./N8N_CLOUD_SETUP.md)

### Variables (.env.local)
```env
N8N_WEBHOOK_URL=https://tu-instancia.app.n8n.cloud
N8N_API_URL=https://tu-instancia.app.n8n.cloud/api/v1
N8N_API_KEY=<API Key de n8n Cloud → Settings → n8n API>
```

### Importar workflows
```powershell
.\scripts\import-n8n-cloud.ps1
.\scripts\activar-n8n-cloud.ps1
```

### MCP Cursor
Actualiza `mcp.json` con `N8N_API_URL` y `N8N_API_KEY` de tu instancia Cloud.

---

## n8n Docker (legacy, opcional)

```bash
docker compose --profile local-n8n --env-file .env.docker up -d
```

UI: http://localhost:5678

### MCP n8n en Cursor
```json
"n8n": {
  "command": "npx",
  "args": ["-y", "n8n-mcp"],
  "env": {
    "N8N_API_URL": "http://localhost:5678/api/v1",
    "N8N_API_KEY": "tu-api-key"
  }
}
```

### Credenciales en n8n (workflows Telegram)
| Credencial | Valor |
|-----------|-------|
| Supabase URL | `https://jeuvobmjhuyskxepdbmt.supabase.co` |
| Supabase Key | `service_role` key |
| Google Gemini | Tu `GEMINI_API_KEY` de [AI Studio](https://aistudio.google.com/apikey) |
| Telegram | Tu `TELEGRAM_BOT_TOKEN` |

Importar workflows desde `n8n/workflows.json`.

---

## Verificar

```bash
# n8n corriendo
docker ps --filter name=chefflow-n8n

# App Next.js
npm run dev
```

Dashboard Supabase: https://supabase.com/dashboard/project/jeuvobmjhuyskxepdbmt/editor
