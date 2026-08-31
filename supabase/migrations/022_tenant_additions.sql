-- Migration 022: Per-dish additions support on products table
-- Adds the additions JSONB column to store toppings/modifiers per dish

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS additions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS additions JSONB DEFAULT '[]'::jsonb;

