-- =========================================
-- CREED — email opt-out list
--
-- Backs the one-click unsubscribe endpoint (api-src/unsubscribe.js) that the
-- List-Unsubscribe header on the abandoned-cart email points at. Gmail and
-- Yahoo require bulk senders to honour one-click unsubscribe; a header that
-- 404s counts against deliverability.
--
-- Only marketing mail consults this list. Order receipts and support replies
-- are transactional and are always delivered.
--
-- Run this in the Supabase SQL editor (DDL cannot be applied over PostgREST).
-- Safe to re-run.
-- =========================================

CREATE TABLE IF NOT EXISTS email_optouts (
    email      text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The cron reads the whole list each run; keep lookups cheap as it grows.
CREATE INDEX IF NOT EXISTS email_optouts_created_at_idx
    ON email_optouts (created_at DESC);

-- Service role reaches this table directly, so no anon policies are granted.
ALTER TABLE email_optouts ENABLE ROW LEVEL SECURITY;

-- Verify:
--   SELECT count(*) FROM email_optouts;
