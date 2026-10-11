-- Paid featured listings for approved Campus Benefit vendors.
-- The listing stays hidden until a payment is verified by the backend.

BEGIN;

CREATE TABLE IF NOT EXISTS listing_packages (
    id SERIAL PRIMARY KEY,
    package_code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    price_naira NUMERIC(10, 2) NOT NULL CHECK (price_naira > 0),
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE deals
    ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS package_code VARCHAR(40);

CREATE TABLE IF NOT EXISTS deal_listing_payments (
    id BIGSERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    package_code VARCHAR(40) NOT NULL REFERENCES listing_packages(package_code),
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    reference VARCHAR(100) NOT NULL UNIQUE,
    payment_mode VARCHAR(10) NOT NULL DEFAULT 'test'
        CHECK (payment_mode IN ('test', 'live')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed')),
    paystack_transaction_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

ALTER TABLE deal_listing_payments
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(10) NOT NULL DEFAULT 'test'
        CHECK (payment_mode IN ('test', 'live'));

CREATE INDEX IF NOT EXISTS deal_listing_payments_vendor_created_idx
    ON deal_listing_payments(vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS deals_vendor_created_idx
    ON deals(vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS deals_public_active_expiry_idx
    ON deals(category, expires_at DESC)
    WHERE is_active = TRUE;

INSERT INTO listing_packages (package_code, name, price_naira, duration_days, is_active)
VALUES
    ('seven-day', '7-Day Listing', 1000, 7, TRUE),
    ('thirty-day', '30-Day Listing', 3000, 30, TRUE)
ON CONFLICT (package_code) DO NOTHING;

COMMIT;
