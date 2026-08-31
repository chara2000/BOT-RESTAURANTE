-- ============================================================================
-- MIGRATION 023: DEFINITIVE SCHEMA FIX
-- Adds missing columns to fix PostgREST schema cache errors
-- ============================================================================

-- 1. Add allow_external_riders if missing (tenant_settings)
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS allow_external_riders BOOLEAN DEFAULT false;

-- 2. Add additions to products table (per-dish additions/toppings)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS additions JSONB DEFAULT '[]'::jsonb;

-- 3. Ensure logo_url and nit exist on tenants table
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nit TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 4. Ensure rider_id column exists on orders (for delivery assignment)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. Ensure payment_status column on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- NOTE: additions column is intentionally NOT added to tenant_settings.
-- Per-dish additions are stored in public.products.additions (JSONB array).
-- The old 022 migration that added additions to tenant_settings should be
-- considered deprecated. The column may exist but will not be used.
