-- Store student Help form submissions for admin review.
BEGIN;

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

CREATE INDEX IF NOT EXISTS support_messages_status_created_idx
    ON support_messages(status, created_at DESC);

COMMIT;
