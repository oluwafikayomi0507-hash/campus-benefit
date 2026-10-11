-- Add product categories to the shared student marketplace.
-- Existing products will be treated as food until their vendors recategorize them.
BEGIN;

ALTER TABLE vendor_products
    ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'food';

CREATE INDEX IF NOT EXISTS vendor_products_category_idx
    ON vendor_products(category);

COMMIT;
