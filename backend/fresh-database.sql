-- Empty production database schema for a new Campus Benefit deployment.
-- Run this once in the hosted PostgreSQL database before the first deploy.
-- This creates tables only; it does not copy any local student/vendor records.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(160) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    university VARCHAR(180) NOT NULL,
    level VARCHAR(10) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(160) NOT NULL,
    business_type TEXT,
    university TEXT,
    location TEXT,
    description TEXT,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone_number VARCHAR(30),
    whatsapp_number VARCHAR(30),
    instagram_url TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    review_note TEXT,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    paystack_subaccount_code VARCHAR(80),
    payout_mode VARCHAR(10) CHECK (payout_mode IN ('test', 'live')),
    payout_bank_name VARCHAR(120),
    payout_account_name VARCHAR(160),
    payout_account_last4 CHAR(4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_products (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    product_name VARCHAR(160) NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'food',
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_orders (
    id BIGSERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    customer_phone VARCHAR(30),
    delivery_note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')),
    delivery_method VARCHAR(20) NOT NULL DEFAULT 'delivery'
        CHECK (delivery_method IN ('delivery', 'pickup')),
    item_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (item_subtotal >= 0),
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required'
        CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed')),
    marketplace_payment_id BIGINT,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(10) CHECK (cancelled_by IN ('student', 'vendor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_orders_marketplace_payment_fk') THEN
        ALTER TABLE vendor_orders ADD CONSTRAINT vendor_orders_marketplace_payment_fk
            FOREIGN KEY (marketplace_payment_id) REFERENCES marketplace_payments(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES vendor_products(id) ON DELETE SET NULL,
    product_name VARCHAR(160) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS listing_packages (
    id SERIAL PRIMARY KEY,
    package_code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    price_naira NUMERIC(10, 2) NOT NULL CHECK (price_naira > 0),
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2),
    discount VARCHAR(50),
    vendor_name VARCHAR(120),
    location TEXT,
    image_url TEXT,
    offer_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_permanent BOOLEAN NOT NULL DEFAULT TRUE,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'not_required')),
    expires_at TIMESTAMPTZ,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    package_code VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS scholarships (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    details TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    application_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('internship', 'competition', 'gig', 'career')),
    title VARCHAR(180) NOT NULL,
    organization VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(180),
    deadline DATE,
    application_url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_tool_data (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL CHECK (tool_name IN ('planner', 'semester-goals')),
    data JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(data) = 'array'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tool_name)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
    id BIGSERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    message_type VARCHAR(20) NOT NULL
        CHECK (message_type IN ('question', 'problem', 'suggestion', 'complaint')),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 5 AND 3000),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendors_approval_status_idx ON vendors(approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_products_vendor_id_idx ON vendor_products(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_products_category_idx ON vendor_products(category);
CREATE INDEX IF NOT EXISTS vendor_orders_vendor_created_idx ON vendor_orders(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_orders_student_created_idx ON vendor_orders(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_payments_student_created_idx ON marketplace_payments(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_listing_payments_vendor_created_idx ON deal_listing_payments(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deals_vendor_created_idx ON deals(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deals_public_active_expiry_idx ON deals(category, expires_at DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS opportunities_category_active_deadline_idx ON opportunities(category, is_active, deadline);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_expiry_idx ON password_reset_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS support_messages_status_created_idx ON support_messages(status, created_at DESC);

INSERT INTO listing_packages (package_code, name, price_naira, duration_days, is_active)
VALUES
    ('seven-day', '7-Day Listing', 1000, 7, TRUE),
    ('thirty-day', '30-Day Listing', 3000, 30, TRUE)
ON CONFLICT (package_code) DO NOTHING;

COMMIT;
