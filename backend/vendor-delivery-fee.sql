-- Vendor-set delivery fee and saved order totals for Campus Benefit.
-- Run this once in the campus_benefit database using pgAdmin Query Tool.

BEGIN;

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (delivery_fee >= 0);

ALTER TABLE vendor_orders
    ADD COLUMN IF NOT EXISTS item_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (item_subtotal >= 0),
    ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (delivery_fee >= 0),
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (total_amount >= 0);

ALTER TABLE vendor_orders
    ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20) NOT NULL DEFAULT 'delivery'
        CHECK (delivery_method IN ('delivery', 'pickup'));

COMMIT;

