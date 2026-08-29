-- ============================================================
-- ChefFlow — Migración: tabla payment_proofs
-- Almacena registros de comprobantes para:
--   - Deduplicación por hash de imagen y transaction_id
--   - Auditoría de validaciones de pago
--   - Score antifraude
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_proofs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  image_url      TEXT NOT NULL,
  image_hash     VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(100),
  status         VARCHAR(30) NOT NULL DEFAULT 'PROOF_RECEIVED'
                   CHECK (status IN ('PENDING','PROOF_RECEIVED','AI_REVIEW','AI_VERIFIED','MANUAL_REVIEW','REJECTED','VERIFIED')),
  score          INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  reviewed_by    UUID REFERENCES profiles(id),  -- admin que revisó manualmente
  reviewed_at    TIMESTAMPTZ,
  notes          TEXT,                           -- notas del admin en revisión manual
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para deduplicación rápida
CREATE UNIQUE INDEX IF NOT EXISTS payment_proofs_order_id_idx  ON payment_proofs (order_id);
CREATE        INDEX IF NOT EXISTS payment_proofs_hash_idx       ON payment_proofs (image_hash);
CREATE        INDEX IF NOT EXISTS payment_proofs_txn_id_idx     ON payment_proofs (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE        INDEX IF NOT EXISTS payment_proofs_status_idx     ON payment_proofs (status);

-- RLS: Solo service_role puede escribir; admins pueden leer
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON payment_proofs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_read" ON payment_proofs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','operator')
    )
  );

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_payment_proofs_updated_at ON payment_proofs;
CREATE TRIGGER set_payment_proofs_updated_at
  BEFORE UPDATE ON payment_proofs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
