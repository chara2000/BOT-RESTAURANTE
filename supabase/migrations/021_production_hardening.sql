-- ============================================================================
-- MIGRATION 021: PRODUCTION HARDENING, INDEXES & RLS ISOLATION
-- ChefFlow SaaS Restaurante Multi-Tenant
-- ============================================================================

-- 1. Ensure required columns in tenant_settings & profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_settings') THEN
    ALTER TABLE public.tenant_settings
      ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS telegram_webhook_secret TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS telegram_admin_chat_id TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS ycloud_api_key TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS ycloud_phone_number TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS ycloud_webhook_secret TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS auto_assign_riders BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS coverage_require_keywords BOOLEAN DEFAULT true;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
    ALTER TABLE public.order_items
      ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;
  END IF;
END $$;

-- 2. Create payment_proofs table for AI & manual receipt auditing
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  image_hash TEXT NOT NULL,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
  score NUMERIC DEFAULT 50,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Production High-Performance Indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_date ON public.orders (tenant_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders (tracking_token);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    CREATE INDEX IF NOT EXISTS idx_products_tenant_available ON public.products (tenant_id, is_available);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
    CREATE INDEX IF NOT EXISTS idx_categories_tenant_active ON public.categories (tenant_id, is_active, sort_order ASC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
    CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON public.customers (tenant_id, phone);
    CREATE INDEX IF NOT EXISTS idx_customers_telegram_chat ON public.customers (telegram_chat_id);
    CREATE INDEX IF NOT EXISTS idx_customers_whatsapp_id ON public.customers (whatsapp_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_messages') THEN
    CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_created ON public.chat_messages (tenant_id, created_at DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_registers') THEN
    CREATE INDEX IF NOT EXISTS idx_cash_registers_tenant_status ON public.cash_registers (tenant_id, status);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_register_id ON public.cash_transactions (register_id, created_at DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'delivery_details') THEN
    CREATE INDEX IF NOT EXISTS idx_delivery_details_order_id ON public.delivery_details (order_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_tenant_role ON public.profiles (tenant_id, role);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_proofs') THEN
    CREATE INDEX IF NOT EXISTS idx_payment_proofs_hash ON public.payment_proofs (image_hash);
    CREATE INDEX IF NOT EXISTS idx_payment_proofs_tx_id ON public.payment_proofs (transaction_id);
  END IF;
END $$;

-- 4. Enable Row Level Security (RLS) safely on all existing tables
DO $$
DECLARE
  t TEXT;
  tables_to_secure TEXT[] := ARRAY[
    'orders', 'order_items', 'products', 'categories', 'customers',
    'tenant_settings', 'profiles', 'cash_registers', 'cash_transactions',
    'delivery_details', 'chat_messages', 'payment_proofs'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_secure LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END IF;
  END LOOP;
END $$;

-- 5. Safe Service Role Bypass Policies (Used by Server Admin Client & Webhooks)
DO $$
DECLARE
  t TEXT;
  policy_name TEXT;
  tables_to_secure TEXT[] := ARRAY[
    'orders', 'order_items', 'products', 'categories', 'customers',
    'tenant_settings', 'profiles', 'cash_registers', 'cash_transactions',
    'delivery_details', 'chat_messages', 'payment_proofs'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_secure LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      policy_name := 'service_role_all_' || t;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = policy_name AND tablename = t) THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', policy_name, t);
      END IF;
    END IF;
  END LOOP;
END $$;
