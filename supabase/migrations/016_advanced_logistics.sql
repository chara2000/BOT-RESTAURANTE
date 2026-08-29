-- ============================================================
-- 016_advanced_logistics.sql
-- Añade columnas para Logística Avanzada (Auto-Assign y PoD)
-- ============================================================

-- 1. Añadir delivery_pin a orders para Proof of Delivery
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_pin VARCHAR(4);

-- 2. Añadir auto_assign_riders a tenant_settings
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS auto_assign_riders BOOLEAN DEFAULT false;

-- 3. Crear trigger para generar PIN automáticamente al crear un pedido de tipo 'delivery'
CREATE OR REPLACE FUNCTION generate_delivery_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si es un domicilio y no tiene PIN asignado, generar uno de 4 dígitos (ej. últimos 4 de ID o random)
    IF NEW.type = 'delivery' AND NEW.delivery_pin IS NULL THEN
        -- Generar un número aleatorio entre 1000 y 9999
        NEW.delivery_pin := floor(random() * 8999 + 1000)::text;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_generate_delivery_pin ON public.orders;
CREATE TRIGGER tr_generate_delivery_pin
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_delivery_pin();
