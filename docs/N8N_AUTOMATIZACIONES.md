# Automatizaciones n8n — ChefFlow

> **Instancia Cloud:** https://juanchara.app.n8n.cloud  
> Setup completo: [N8N_CLOUD_SETUP.md](./N8N_CLOUD_SETUP.md)

## Estado actual (Cloud)

| # | Workflow | ID Cloud | Trigger | Estado |
|---|----------|----------|---------|--------|
| 01 | Telegram + Gemini + Supabase | `I4ndLDmfp8qxSbgi` | Telegram | Activo |
| 02 | Webhook Cambio Estado Pedido | `B6LT5k3pWMRQK1Lk` | POST webhook | Activo |
| 03 | Alerta Stock Bajo | `XX2cA0o2qfeY7IHT` | Cada 2 h | Activo |
| 04 | Reporte Ventas Diario Gemini | `ltl5Qpbv7cR7BsuQ` | Cron 22:00 | Activo |
| 05 | Webhook Nuevo Pedido Panel | `GVQi1jJn9dPsrA6R` | POST webhook | Activo |

**Desactivar manualmente** workflows viejos de Telegram que entren en conflicto con el 01.

---

## Error: "can't listen for test executions at the same time as production"

Aparece al pulsar **Test workflow** / **Execute workflow** en el editor mientras el Workflow **01** está **Publicado (Active)**.

Telegram solo permite **un modo a la vez**:
- **Producción** (Publicado) → el bot responde mensajes reales en Telegram
- **Prueba** (Despublicado) → puedes ejecutar manualmente en el editor

### Qué hacer según tu objetivo

| Objetivo | Acción |
|----------|--------|
| **Usar el bot en Telegram** (normal) | Deja el workflow **Publicado**. **No uses "Test workflow"**. Escribe a `@mi_restaurante_prueba_bot`. |
| **Depurar en el editor** | 1. **Unpublish** el workflow 01 → 2. Test en editor → 3. **Publish** de nuevo al terminar |

En n8n Cloud: abre [Workflow 01](https://juanchara.app.n8n.cloud/workflow/I4ndLDmfp8qxSbgi) → menú **⋯** → **Unpublish** (solo mientras pruebas).

Verifica bot en producción:

```powershell
npm run test:telegram
```

---

## Flujo Web ↔ n8n ↔ Supabase

```
Panel ChefFlow (Kanban /pedidos)
    ↓ PATCH /api/orders/:id/status
Supabase (orders.status) + n8n webhook chefflow-order-status
    ↓ Workflow 02
Telegram al cliente + chat_messages en BD

Telegram → Workflow 01 → Gemini → INSERT pedido Supabase
    ↓ Realtime
Panel recibe pedido nuevo automáticamente

Workflow 03 (cada 2h) → inventario bajo → audit_logs + chat_messages
Workflow 04 (22:00) → ventas del día → Gemini → audit_logs
```

---

## Webhooks (URLs producción)

```
POST https://juanchara.app.n8n.cloud/webhook/chefflow-order-status
Body: { "order_id": "uuid", "status": "preparing" }

POST https://juanchara.app.n8n.cloud/webhook/chefflow-new-order
Body: { "order": { ... }, "items": [ ... ] }
```

La app **no llama n8n desde el navegador**. Usa API routes server-side:

| Ruta Next.js | Acción |
|--------------|--------|
| `PATCH /api/orders/[id]/status` | Actualiza Supabase + dispara Workflow 02 |
| `POST /api/orders` | Crea pedido vía Workflow 05 |

`.env.local`:
```env
N8N_WEBHOOK_URL=https://juanchara.app.n8n.cloud
```

---

## Variables requeridas en n8n Cloud

Settings → **Variables**:

| Variable | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://jeuvobmjhuyskxepdbmt.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (Supabase Dashboard) |
| `GEMINI_API_KEY` | (Google AI Studio) |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `TELEGRAM_BOT_TOKEN` | (BotFather) |

---

## Desarrollo local

```powershell
npm run dev          # Webpack (estable)
npm run dev:turbo    # Turbopack (experimental en Windows)
npm run dev:clean    # Libera puerto 3000 y arranca limpio
```

Docker n8n local queda como legacy (`docker compose --profile local-n8n`). En Cloud no hace falta.

---

## SDK / re-desplegar workflows

Código fuente en `n8n/sdk/chefflow-*.js`. Desplegar vía MCP Cursor (`user-n8n-mcp`) o:

```powershell
node n8n/sdk/deploy-04-05.mjs
```

---

## Flujo completo Telegram → Pedido

```
Cliente escribe en Telegram
    ↓
Menú numérico (1 pedir | 2 seguimiento | 3 ayuda | 0 inicio)
    ↓
Consulta pedidos activos en Supabase (mismo estado que /pedidos)
    ↓
INSERT customers + orders + order_items + chat_messages
    ↓
Panel ChefFlow (Realtime Supabase)
    ↓
Cambio estado en /pedidos → WF 02 → notificación Telegram con progreso
```

Bot activo: menú por **números**, seguimiento **sincronizado con BD**.

Re-desplegar lógica del bot:
```powershell
npm run deploy:bot
```

### Bot CRM — menú numérico

| Opción | Acción |
|--------|--------|
| **1** | Hacer pedido (categorías → carrito → dirección → pago → confirmar) |
| **2** | Ver menú / categorías |
| **3** | Seguimiento en vivo (desde Supabase, mismo estado que `/pedidos`) |
| **4** | Promociones activas (CRM) |
| **5** | Actualizar dirección guardada |
| **6** | Escalar a asesor humano |
| **0** | Menú principal |

Lógica en `n8n/bot/crm-assistant.logic.js`.

---

## Prueba Telegram en vivo

```powershell
.\scripts\test-telegram-bot.ps1
```

Bot activo: **@mi_restaurante_prueba_bot** (webhook → n8n Cloud Workflow 01)

1. Abre Telegram y escribe: *"Hola, quiero ver el menú"*
2. Gemini responde con productos de Supabase
3. Completa pedido (dirección + pago) → INSERT en Supabase
4. Aparece en **`/pedidos`** del panel (Realtime)

## Venta POS → Workflow 05

En **`/caja`**, sección **Venta POS**:

1. Abre la caja
2. Agrega productos al carrito
3. Elige tipo (mesa / llevar / domicilio) y método de pago
4. **Cobrar y crear pedido** → `POST /api/orders` → n8n Workflow 05 → Supabase
5. Si n8n falla, la API inserta directo en Supabase (fallback automático)
6. El pedido aparece en `/pedidos` y suma ingreso en movimientos de caja
