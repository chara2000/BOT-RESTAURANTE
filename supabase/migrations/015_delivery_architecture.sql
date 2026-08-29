-- ============================================================
-- 015_delivery_architecture.sql
-- Triggers para registrar automáticamente eventos de pedido y auditoría
-- ============================================================

-- 1. Trigger para loggear cambios de estado en `order_events`
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Solo insertar si el estado cambió
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.order_events (
            order_id,
            tenant_id,
            event_type,
            from_value,
            to_value,
            actor_id,
            notes
        ) VALUES (
            NEW.id,
            NEW.tenant_id,
            'STATUS_CHANGE',
            OLD.status,
            NEW.status,
            auth.uid(),
            'Estado actualizado automáticamente a ' || NEW.status
        );
    END IF;

    -- Si es insert, registrar creación
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.order_events (
            order_id,
            tenant_id,
            event_type,
            to_value,
            actor_id,
            notes
        ) VALUES (
            NEW.id,
            NEW.tenant_id,
            'ORDER_CREATED',
            NEW.status,
            auth.uid(),
            'Pedido creado en sistema'
        );
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_log_order_status ON public.orders;
CREATE TRIGGER tr_log_order_status
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION log_order_status_change();


-- 2. Asegurar que las políticas para `rider_assignments` y `order_events` usen tenant_id
-- (Ajuste a la migración 011 usando el nuevo JWT tenant_id)
DO $$
BEGIN
    -- Actualizar políticas si la función existe (migración 012)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_tenant_id') THEN
        DROP POLICY IF EXISTS "order_events_select" ON public.order_events;
        CREATE POLICY "order_events_select" ON public.order_events
            FOR SELECT USING (tenant_id = public.auth_tenant_id());
            
        -- Alter table para meter tenant_id a rider_assignments si no lo tiene
        ALTER TABLE public.rider_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID;
        
        DROP POLICY IF EXISTS "rider_assignments_select" ON public.rider_assignments;
        CREATE POLICY "rider_assignments_select" ON public.rider_assignments
            FOR SELECT USING (tenant_id = public.auth_tenant_id());
    END IF;
END $$;
