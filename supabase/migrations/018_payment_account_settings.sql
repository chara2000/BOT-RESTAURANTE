-- Migration: 018 - Add payment account number fields to tenant_settings
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS nequi_number TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bancolombia_number TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bancolombia_type TEXT DEFAULT 'Ahorros';
