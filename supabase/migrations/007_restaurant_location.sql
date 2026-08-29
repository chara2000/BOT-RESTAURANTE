-- Migración 007: Ubicación GPS del restaurante en tenant_settings
-- Agrega columnas de latitud y longitud del restaurante para geocercas y rastreo

-- Columnas de ubicación del restaurante
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS restaurant_lat  DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS restaurant_lng  DECIMAL(11, 8);

-- Columnas de cobertura de domicilio (en caso de que no existan aún)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS coverage_city             TEXT,
  ADD COLUMN IF NOT EXISTS coverage_department       TEXT,
  ADD COLUMN IF NOT EXISTS coverage_keywords         TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS coverage_require_keywords BOOLEAN DEFAULT true;

-- Comentarios descriptivos
COMMENT ON COLUMN tenant_settings.restaurant_lat  IS 'Latitud GPS del restaurante (punto de origen para geocercas)';
COMMENT ON COLUMN tenant_settings.restaurant_lng  IS 'Longitud GPS del restaurante (punto de origen para geocercas)';
COMMENT ON COLUMN tenant_settings.coverage_city   IS 'Ciudad o municipio de cobertura de domicilios';
COMMENT ON COLUMN tenant_settings.coverage_department IS 'Departamento de cobertura de domicilios';
COMMENT ON COLUMN tenant_settings.coverage_keywords IS 'Palabras clave de nomenclatura para validar direcciones';
COMMENT ON COLUMN tenant_settings.coverage_require_keywords IS 'Si true, la dirección del cliente debe contener al menos una keyword';
