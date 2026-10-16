-- Campus Benefit internal dispatch queue and distance-based quote workflow.
-- Safe to run once after marketplace-payments.sql; existing orders remain unchanged.
BEGIN;

ALTER TABLE vendor_orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(24) NOT NULL DEFAULT 'not_requested'
    CHECK (dispatch_status IN ('not_requested', 'awaiting_assignment', 'assigned', 'picked_up', 'delivered'));
ALTER TABLE marketplace_payments ADD COLUMN IF NOT EXISTS authorization_url TEXT;

CREATE TABLE IF NOT EXISTS marketplace_dispatch_quotes (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  customer_phone VARCHAR(30) NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_note TEXT,
  cart_items JSONB NOT NULL CHECK (jsonb_typeof(cart_items) = 'array'),
  status VARCHAR(24) NOT NULL DEFAULT 'pending_quote'
    CHECK (status IN ('pending_quote', 'quoted', 'checkout_pending', 'paid', 'assigned', 'picked_up', 'delivered', 'cancelled')),
  quoted_fee NUMERIC(10, 2) CHECK (quoted_fee IS NULL OR quoted_fee >= 0),
  quoted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  marketplace_payment_id BIGINT REFERENCES marketplace_payments(id) ON DELETE RESTRICT,
  rider_name VARCHAR(160),
  rider_phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_dispatch_student_idx
  ON marketplace_dispatch_quotes(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_dispatch_queue_idx
  ON marketplace_dispatch_quotes(status, updated_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_dispatch_payment_unique_idx
  ON marketplace_dispatch_quotes(marketplace_payment_id) WHERE marketplace_payment_id IS NOT NULL;

COMMIT;
