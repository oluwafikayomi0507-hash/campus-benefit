BEGIN;

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

CREATE INDEX IF NOT EXISTS opportunities_category_active_deadline_idx
  ON opportunities (category, is_active, deadline);

COMMIT;
