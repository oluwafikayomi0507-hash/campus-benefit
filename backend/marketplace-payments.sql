-- Add this to an existing Campus Benefit database before enabling checkout.
-- Safe to run again. It does not alter or delete existing orders.
BEGIN;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS paystack_subaccount_code VARCHAR(80);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payout_mode VARCHAR(10)
  CHECK (payout_mode IN ('test', 'live'));
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payout_bank_name VARCHAR(120);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payout_account_name VARCHAR(160);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payout_account_last4 CHAR(4);

CREATE TABLE IF NOT EXISTS marketplace_payments (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reference VARCHAR(100) NOT NULL UNIQUE,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  item_subtotal NUMERIC(10, 2) NOT NULL CHECK (item_subtotal >= 0),
  delivery_total NUMERIC(10, 2) NOT NULL CHECK (delivery_total >= 0),
  platform_fee NUMERIC(10, 2) NOT NULL CHECK (platform_fee >= 0),
  payment_mode VARCHAR(10) NOT NULL CHECK (payment_mode IN ('test', 'live')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  paystack_transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

ALTER TABLE vendor_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required'
  CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed'));
ALTER TABLE vendor_orders ADD COLUMN IF NOT EXISTS marketplace_payment_id BIGINT;
ALTER TABLE vendor_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE vendor_orders ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(10)
  CHECK (cancelled_by IN ('student', 'vendor'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_orders_marketplace_payment_fk') THEN
    ALTER TABLE vendor_orders ADD CONSTRAINT vendor_orders_marketplace_payment_fk
      FOREIGN KEY (marketplace_payment_id) REFERENCES marketplace_payments(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS marketplace_payments_student_created_idx
  ON marketplace_payments(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_orders_payment_id_idx
  ON vendor_orders(marketplace_payment_id) WHERE marketplace_payment_id IS NOT NULL;

COMMIT;
