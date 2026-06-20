-- Políticas MVP: lectura del tenant demo sin auth (reemplazar con auth.uid() en producción)
-- Tenant ChefFlow demo: a0000000-0000-4000-8000-000000000001

CREATE POLICY demo_read_products ON products FOR SELECT TO anon, authenticated
    USING (tenant_id = 'a0000000-0000-4000-8000-000000000001');

CREATE POLICY demo_read_categories ON categories FOR SELECT TO anon, authenticated
    USING (tenant_id = 'a0000000-0000-4000-8000-000000000001');

CREATE POLICY demo_read_orders ON orders FOR SELECT TO anon, authenticated
    USING (tenant_id = 'a0000000-0000-4000-8000-000000000001');

CREATE POLICY demo_read_order_items ON order_items FOR SELECT TO anon, authenticated
    USING (order_id IN (
        SELECT id FROM orders WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001'
    ));

CREATE POLICY demo_read_customers ON customers FOR SELECT TO anon, authenticated
    USING (tenant_id = 'a0000000-0000-4000-8000-000000000001');

CREATE POLICY demo_read_inventory ON inventory FOR SELECT TO anon, authenticated
    USING (tenant_id = 'a0000000-0000-4000-8000-000000000001');

CREATE POLICY demo_read_settings ON tenant_settings FOR SELECT TO anon, authenticated
    USING (tenant_id = 'a0000000-0000-4000-8000-000000000001');

CREATE POLICY demo_read_delivery ON delivery_details FOR SELECT TO anon, authenticated
    USING (order_id IN (
        SELECT id FROM orders WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001'
    ));
