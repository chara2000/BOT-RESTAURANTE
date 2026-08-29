-- ============================================================
-- 011_delivery_events.sql
-- Historial completo de eventos, reasignaciones y auditoria
-- ============================================================

-- 1. Tabla de eventos de pedido (timeline completo)
CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Historial de reasignaciones de repartidor
CREATE TABLE IF NOT EXISTS public.rider_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  prev_rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  prev_rider_name TEXT,
  new_rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_rider_name TEXT,
  changed_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Auditoria general
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Indices para rendimiento
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON public.order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_tenant_id ON public.order_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON public.order_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_assignments_order_id ON public.rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_rider_assignments_created_at ON public.rider_assignments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON public.audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

-- 5. Habilitar RLS
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 6. Politicas RLS
DROP POLICY IF EXISTS "order_events_select" ON public.order_events;
CREATE POLICY "order_events_select" ON public.order_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "order_events_insert" ON public.order_events;
CREATE POLICY "order_events_insert" ON public.order_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "rider_assignments_select" ON public.rider_assignments;
CREATE POLICY "rider_assignments_select" ON public.rider_assignments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "rider_assignments_insert" ON public.rider_assignments;
CREATE POLICY "rider_assignments_insert" ON public.rider_assignments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
CREATE POLICY "audit_log_select" ON public.audit_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Agregar columnas extra a rider_profiles si no existen
ALTER TABLE public.rider_profiles
  ADD COLUMN IF NOT EXISTS vehicle_model TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_color TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_description TEXT;
