-- Triggers transaccionales para automatizar registros de caja basados en estados de órdenes

CREATE OR REPLACE FUNCTION public.sync_order_to_cash_register()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_register_id uuid;
    v_short_id text;
    v_is_new_income boolean;
    v_was_income boolean;
BEGIN
    -- Determinar si la orden ya era un ingreso antes del UPDATE
    v_was_income := (TG_OP = 'UPDATE' AND OLD.status IN ('confirmed', 'delivered'));
    
    -- Determinar si la orden es un ingreso ahora
    v_is_new_income := (NEW.status IN ('confirmed', 'delivered'));

    -- Extraer el Short ID de las notas o generar uno genérico
    v_short_id := COALESCE(
        substring(NEW.notes from '\[ID:\s*(T-[A-Z0-9]+)\]'),
        '#' || upper(substring(NEW.id::text, 1, 6))
    );

    -- Obtener la sesión de caja abierta del tenant
    SELECT id INTO v_register_id 
    FROM cash_registers 
    WHERE tenant_id = NEW.tenant_id AND status = 'open' 
    LIMIT 1;

    -- Si hay una sesión de caja abierta, procesar transacciones
    IF v_register_id IS NOT NULL THEN
        
        -- Caso 1: Nueva Orden Confirmada/Entregada (Ingreso)
        IF v_is_new_income AND NOT v_was_income THEN
            INSERT INTO cash_transactions (
                register_id, type, amount, description
            ) VALUES (
                v_register_id,
                'income',
                NEW.total,
                'Pedido ' || v_short_id || ' - ' || 
                CASE WHEN NEW.status = 'confirmed' THEN 'Confirmado' ELSE 'Entregado' END
            );
        END IF;

        -- Caso 2: Orden que ya era un ingreso (Confirmada/Entregada) pasa a Cancelada (Egreso)
        IF (TG_OP = 'UPDATE' AND OLD.status IN ('confirmed', 'delivered') AND NEW.status = 'cancelled') THEN
            INSERT INTO cash_transactions (
                register_id, type, amount, description
            ) VALUES (
                v_register_id,
                'expense',
                NEW.total,
                'Cancelación Pedido ' || v_short_id
            );
        END IF;
        
        -- Caso 3: Orden que ya era un ingreso es Eliminada de la base de datos (Egreso)
        IF (TG_OP = 'DELETE' AND OLD.status IN ('confirmed', 'delivered')) THEN
            INSERT INTO cash_transactions (
                register_id, type, amount, description
            ) VALUES (
                v_register_id,
                'expense',
                OLD.total,
                'Eliminación Pedido ' || COALESCE(
                    substring(OLD.notes from '\[ID:\s*(T-[A-Z0-9]+)\]'),
                    '#' || upper(substring(OLD.id::text, 1, 6))
                )
            );
            RETURN OLD;
        END IF;

    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS tr_sync_order_insert_cash ON public.orders;
DROP TRIGGER IF EXISTS tr_sync_order_update_cash ON public.orders;
DROP TRIGGER IF EXISTS tr_sync_order_delete_cash ON public.orders;

-- Attach triggers to the `orders` table
CREATE TRIGGER tr_sync_order_insert_cash
    AFTER INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_to_cash_register();

CREATE TRIGGER tr_sync_order_update_cash
    AFTER UPDATE OF status, total ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_to_cash_register();

CREATE TRIGGER tr_sync_order_delete_cash
    BEFORE DELETE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_to_cash_register();
