-- Migración 008: Agregar tracking_token UUID a orders
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS tracking_token UUID 
    DEFAULT gen_random_uuid() 
    NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token 
  ON orders(tracking_token);
