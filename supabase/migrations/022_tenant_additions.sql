-- Migration 022: Multi-tenant additions support in tenant_settings
-- Adds the additions JSONB column to store per-restaurant configurable dish toppings/modifiers

ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS additions JSONB DEFAULT '[]'::jsonb;

-- Seed default additions for ChefFlow demo tenant if empty
UPDATE public.tenant_settings
SET additions = '[
  {"id": "add_1", "name": "🧀 Extra Queso Costeño", "price": 3500, "is_available": true},
  {"id": "add_2", "name": "🥓 Tocineta Ahumada", "price": 4000, "is_available": true},
  {"id": "add_3", "name": "🥩 Carne Extra (150g)", "price": 8500, "is_available": true},
  {"id": "add_4", "name": "🥚 Huevos de Codorniz (3 und)", "price": 2500, "is_available": true},
  {"id": "add_5", "name": "🍟 Porción de Papas", "price": 6000, "is_available": true},
  {"id": "add_6", "name": "🌽 Maíz Tierno Dulce", "price": 3000, "is_available": true},
  {"id": "add_7", "name": "🥫 Salsa Tártara / Piña", "price": 1500, "is_available": true}
]'::jsonb
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND (additions IS NULL OR additions = '[]'::jsonb);
