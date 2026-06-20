-- Evita evaluar get_user_tenant_id() para usuarios anon (demo_read cubre ese caso).
-- Sin el guard, tenant_isolation falla con recursión aunque demo_read permita el acceso.

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result uuid;
BEGIN
  SELECT tenant_id INTO result FROM public.profiles WHERE id = auth.uid();
  RETURN result;
END;
$$;

ALTER FUNCTION public.get_user_tenant_id() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO anon, authenticated, service_role;

-- tenants
DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
CREATE POLICY tenant_isolation_tenants ON tenants
    USING (auth.uid() IS NOT NULL AND id = public.get_user_tenant_id());

-- branches
DROP POLICY IF EXISTS tenant_isolation_branches ON branches;
CREATE POLICY tenant_isolation_branches ON branches
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- profiles
DROP POLICY IF EXISTS tenant_isolation_profiles ON profiles;
CREATE POLICY tenant_isolation_profiles ON profiles
    USING (auth.uid() IS NOT NULL AND id = auth.uid());

-- categories
DROP POLICY IF EXISTS tenant_isolation_categories ON categories;
CREATE POLICY tenant_isolation_categories ON categories
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- products
DROP POLICY IF EXISTS tenant_isolation_products ON products;
CREATE POLICY tenant_isolation_products ON products
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- inventory
DROP POLICY IF EXISTS tenant_isolation_inventory ON inventory;
CREATE POLICY tenant_isolation_inventory ON inventory
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- orders
DROP POLICY IF EXISTS tenant_isolation_orders ON orders;
CREATE POLICY tenant_isolation_orders ON orders
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- tenant_settings
DROP POLICY IF EXISTS tenant_isolation_settings ON tenant_settings;
CREATE POLICY tenant_isolation_settings ON tenant_settings
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- chat_messages
DROP POLICY IF EXISTS tenant_isolation_chat ON chat_messages;
CREATE POLICY tenant_isolation_chat ON chat_messages
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- promotions
DROP POLICY IF EXISTS tenant_isolation_promotions ON promotions;
CREATE POLICY tenant_isolation_promotions ON promotions
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- audit_logs
DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
CREATE POLICY tenant_isolation_audit ON audit_logs
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- customers
DROP POLICY IF EXISTS tenant_isolation_customers ON customers;
CREATE POLICY tenant_isolation_customers ON customers
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- order_items
DROP POLICY IF EXISTS tenant_isolation_order_items ON order_items;
CREATE POLICY tenant_isolation_order_items ON order_items
    USING (
        auth.uid() IS NOT NULL
        AND order_id IN (
            SELECT id FROM orders WHERE tenant_id = public.get_user_tenant_id()
        )
    );

-- cash_registers
DROP POLICY IF EXISTS tenant_isolation_cash ON cash_registers;
CREATE POLICY tenant_isolation_cash ON cash_registers
    USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id());

-- cash_transactions
DROP POLICY IF EXISTS tenant_isolation_cash_tx ON cash_transactions;
CREATE POLICY tenant_isolation_cash_tx ON cash_transactions
    USING (
        auth.uid() IS NOT NULL
        AND register_id IN (
            SELECT id FROM cash_registers WHERE tenant_id = public.get_user_tenant_id()
        )
    );

-- delivery_details
DROP POLICY IF EXISTS tenant_isolation_delivery ON delivery_details;
CREATE POLICY tenant_isolation_delivery ON delivery_details
    USING (
        auth.uid() IS NOT NULL
        AND order_id IN (
            SELECT id FROM orders WHERE tenant_id = public.get_user_tenant_id()
        )
    );

-- stock_movements
DROP POLICY IF EXISTS tenant_isolation_stock ON stock_movements;
CREATE POLICY tenant_isolation_stock ON stock_movements
    USING (
        auth.uid() IS NOT NULL
        AND inventory_id IN (
            SELECT id FROM inventory WHERE tenant_id = public.get_user_tenant_id()
        )
    );
