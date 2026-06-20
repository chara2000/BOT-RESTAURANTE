-- Extensiones adicionales para ChefFlow SaaS
-- Ejecutar después de schema.sql

-- Tabla de configuración por tenant
CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    delivery_fee DECIMAL(12,2) DEFAULT 5000.00,
    telegram_bot_token TEXT,
    telegram_enabled BOOLEAN DEFAULT false,
    whatsapp_enabled BOOLEAN DEFAULT false,
    whatsapp_phone VARCHAR(50),
    ai_enabled BOOLEAN DEFAULT true,
    ai_model VARCHAR(100) DEFAULT 'gpt-4o-mini',
    payment_methods payment_method[] DEFAULT ARRAY['cash', 'nequi', 'daviplata']::payment_method[],
    business_hours JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla de mensajes (Telegram/WhatsApp)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'telegram', -- telegram, whatsapp, web
    direction VARCHAR(10) NOT NULL, -- inbound, outbound
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla de promociones
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- percentage, fixed
    discount_value DECIMAL(12,2) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- WhatsApp ID en customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_id VARCHAR(100);

-- Índices adicionales
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant ON chat_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(tenant_id) WHERE is_active = true;

-- RLS para nuevas tablas
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_settings ON tenant_settings
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_chat ON chat_messages
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_promotions ON promotions
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_audit ON audit_logs
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Políticas faltantes del schema original
CREATE POLICY tenant_isolation_customers ON customers
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_order_items ON order_items
    USING (order_id IN (SELECT id FROM orders WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY tenant_isolation_cash ON cash_registers
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_cash_tx ON cash_transactions
    USING (register_id IN (SELECT id FROM cash_registers WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY tenant_isolation_delivery ON delivery_details
    USING (order_id IN (SELECT id FROM orders WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY tenant_isolation_stock ON stock_movements
    USING (inventory_id IN (SELECT id FROM inventory WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())));

-- Realtime para pedidos y delivery
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_details;
