-- Campus Benefit vendor application review and admin access.
-- Run this once in the campus_benefit database using pgAdmin Query Tool.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS business_type TEXT,
    ADD COLUMN IF NOT EXISTS university TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN IF NOT EXISTS review_note TEXT;

-- Keep accounts approved earlier through pgAdmin marked as approved.
UPDATE vendors
SET approval_status = 'approved'
WHERE is_approved = TRUE AND approval_status = 'pending';

CREATE INDEX IF NOT EXISTS vendors_approval_status_idx
    ON vendors(approval_status, created_at DESC);

COMMIT;
