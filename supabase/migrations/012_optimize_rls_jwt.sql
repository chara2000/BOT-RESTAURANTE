-- 1. Create a function to inject tenant_id into the JWT app_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user_tenant_jwt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- We assume that when a user is created in auth.users, they get a profile with a tenant_id
  -- This might happen slightly after, so we must also update the JWT when the profile is created.
  -- Alternatively, we can use a custom JWT hook (if available in Supabase), or we just update the auth.users table.
  -- Let's update raw_app_meta_data directly.
  
  -- But since profiles is created AFTER auth.users (usually via a trigger), 
  -- it's better to put this trigger on `public.profiles`
  
  UPDATE auth.users
  SET raw_app_meta_data = 
      coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', NEW.tenant_id)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_profile_created_jwt ON public.profiles;

-- 2. Trigger on profile insert or update to sync tenant_id to JWT
CREATE TRIGGER on_profile_created_jwt
  AFTER INSERT OR UPDATE OF tenant_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_tenant_jwt();

-- 3. Now let's update ALL existing RLS policies that were using `SELECT tenant_id FROM profiles`
-- First we must drop the old ones (from 002_extensions.sql)
DROP POLICY IF EXISTS tenant_isolation_settings ON tenant_settings;
DROP POLICY IF EXISTS tenant_isolation_chat ON chat_messages;
DROP POLICY IF EXISTS tenant_isolation_promotions ON promotions;
DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
DROP POLICY IF EXISTS tenant_isolation_customers ON customers;
DROP POLICY IF EXISTS tenant_isolation_order_items ON order_items;
DROP POLICY IF EXISTS tenant_isolation_cash ON cash_registers;
DROP POLICY IF EXISTS tenant_isolation_cash_tx ON cash_transactions;
DROP POLICY IF EXISTS tenant_isolation_delivery ON delivery_details;
DROP POLICY IF EXISTS tenant_isolation_stock ON stock_movements;
DROP POLICY IF EXISTS tenant_isolation_orders ON orders;
DROP POLICY IF EXISTS tenant_isolation_products ON products;
DROP POLICY IF EXISTS tenant_isolation_categories ON categories;
DROP POLICY IF EXISTS tenant_isolation_inventory ON inventory;

-- Helper function to read tenant_id from JWT
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$;

-- 4. Recreate them using auth.jwt()
CREATE POLICY tenant_isolation_settings ON tenant_settings USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_chat ON chat_messages USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_promotions ON promotions USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_audit ON audit_logs USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_customers ON customers USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_order_items ON order_items USING (order_id IN (SELECT id FROM orders WHERE tenant_id = public.auth_tenant_id()));
CREATE POLICY tenant_isolation_cash ON cash_registers USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_cash_tx ON cash_transactions USING (register_id IN (SELECT id FROM cash_registers WHERE tenant_id = public.auth_tenant_id()));
CREATE POLICY tenant_isolation_delivery ON delivery_details USING (order_id IN (SELECT id FROM orders WHERE tenant_id = public.auth_tenant_id()));
CREATE POLICY tenant_isolation_stock ON stock_movements USING (inventory_id IN (SELECT id FROM inventory WHERE tenant_id = public.auth_tenant_id()));
CREATE POLICY tenant_isolation_orders ON orders USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_products ON products USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_categories ON categories USING (tenant_id = public.auth_tenant_id());
CREATE POLICY tenant_isolation_inventory ON inventory USING (tenant_id = public.auth_tenant_id());

-- Update existing auth.users to have the tenant_id populated immediately
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, tenant_id FROM public.profiles LOOP
        UPDATE auth.users
        SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', r.tenant_id)
        WHERE id = r.id;
    END LOOP;
END;
$$;
