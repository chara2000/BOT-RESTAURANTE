# ChefFlow IA — Sistema SaaS para Restaurantes

Plataforma profesional de gestión para restaurantes con IA, domicilios, caja POS y automatización Telegram/WhatsApp.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| UI | Lucide Icons, Framer Motion, Recharts, @hello-pangea/dnd |
| Backend | Supabase (PostgreSQL, RLS, Realtime, Storage) |
| Automatización | n8n |
| IA | Google Gemini (AI Studio) |
| Mapas | Leaflet (Google Maps ready) |
| Pagos | Wompi, Nequi, Daviplata, Transferencia |

## Módulos

- **Dashboard** — KPIs, gráficos, órdenes recientes, GPS en vivo
- **Pedidos** — Kanban drag & drop con 7 estados
- **Menú** — CRUD productos, categorías, disponibilidad
- **Inventario** — Stock, alertas, historial de movimientos
- **Caja POS** — Apertura, movimientos, arqueo, cierre
- **Clientes** — CRM con segmentación VIP
- **Domicilios** — Despacho, repartidores, mapa GPS
- **Mensajes** — Conversaciones Telegram/WhatsApp
- **IA & Bots** — Asistente virtual con capacidades de negocio
- **Reportes** — Ventas, exportación CSV/PDF
- **Configuración** — Roles, pagos, horarios, bots

## Estructura

```
src/
├── app/(dashboard)/     # Rutas por módulo
├── components/
│   ├── layout/          # Sidebar, Topbar, AppLayout
│   └── ui/              # StatCard, etc.
├── config/              # Navegación, permisos
├── context/             # Theme, AppData (estado global)
├── hooks/               # useOrders, useProducts, etc.
├── lib/                 # Utils, Supabase client
├── providers/           # React Query, Theme
├── services/            # API, seed data
└── types/               # TypeScript types
supabase/
├── schema.sql           # Schema completo multi-tenant
└── migrations/          # Extensiones
n8n/
└── workflows.json       # 5 workflows de automatización
```

## Inicio Rápido

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Supabase

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ejecutar `supabase/schema.sql` en el SQL Editor
3. Ejecutar `supabase/migrations/002_extensions.sql`
4. Configurar variables en `.env.local`

## n8n

Importar workflows desde `n8n/workflows.json`. Configurar credenciales:
- Telegram Bot API
- Supabase (URL + Service Role Key)
- Google Gemini API Key ([AI Studio](https://aistudio.google.com/apikey))

## Roles

| Rol | Permisos |
|-----|----------|
| Super Admin | Acceso total |
| Admin | Todos los módulos |
| Operador | Pedidos, menú, caja, clientes |
| Cocina | Solo pedidos |
| Repartidor | Pedidos y domicilios |

## Despliegue

```bash
npm run build
npm start
```

Recomendado: Vercel (frontend) + Supabase (backend) + n8n Cloud o self-hosted.
