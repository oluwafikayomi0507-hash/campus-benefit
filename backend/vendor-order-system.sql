-- Campus Benefit vendor accounts, product listings, and order inbox.
-- Run this once in the campus_benefit database using pgAdmin Query Tool.

BEGIN;

CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(160) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone_number VARCHAR(30),
    whatsapp_number VARCHAR(30),
    instagram_url TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
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
    cancellation_reason TEXT,
    cancelled_by VARCHAR(10) CHECK (cancelled_by IN ('student', 'vendor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendor_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE vendor_orders ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(10)
    CHECK (cancelled_by IN ('student', 'vendor'));

CREATE TABLE IF NOT EXISTS vendor_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES vendor_products(id) ON DELETE SET NULL,
    product_name VARCHAR(160) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS vendor_products_vendor_id_idx
    ON vendor_products(vendor_id);

CREATE INDEX IF NOT EXISTS vendor_products_category_idx
    ON vendor_products(category);

CREATE INDEX IF NOT EXISTS vendor_orders_vendor_created_idx
    ON vendor_orders(vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS vendor_orders_student_created_idx
    ON vendor_orders(student_id, created_at DESC);

COMMIT;
