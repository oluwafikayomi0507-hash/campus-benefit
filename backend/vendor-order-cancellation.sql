-- Run once on an existing Campus Benefit database before deploying
-- the required-cancellation-reason change. Safe to run again.
BEGIN;

ALTER TABLE vendor_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE vendor_orders
  ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(10)
  CHECK (cancelled_by IN ('student', 'vendor'));

COMMIT;
