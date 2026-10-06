-- =========================================
-- CREED — abandoned checkout email log
--
-- One row per reminder that actually went out. Open pixel, click hop, and
-- later paid orders are matched against this table.
--
-- Run this in the Supabase SQL editor (DDL cannot be applied over PostgREST).
-- Safe to re-run.
-- =========================================

CREATE TABLE IF NOT EXISTS abandoned_checkout_emails (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token           text UNIQUE NOT NULL,
    email           text NOT NULL,
    order_id        text,
    session_id      text,
    amount          text,
    currency        text DEFAULT 'USD',
    items           jsonb DEFAULT '[]'::jsonb,
    subject         text,
    resend_id       text,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    opened_at       timestamptz,
    open_count      integer NOT NULL DEFAULT 0,
    clicked_at      timestamptz,
    click_count     integer NOT NULL DEFAULT 0,
    last_click_at   timestamptz,
    click_content   text,
    tier            text,
    discount_code   text,
    discount_percent integer,
    checkout_count  integer,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE abandoned_checkout_emails ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE abandoned_checkout_emails ADD COLUMN IF NOT EXISTS discount_code text;
ALTER TABLE abandoned_checkout_emails ADD COLUMN IF NOT EXISTS discount_percent integer;
ALTER TABLE abandoned_checkout_emails ADD COLUMN IF NOT EXISTS checkout_count integer;

CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_sent_at_idx
    ON abandoned_checkout_emails (sent_at DESC);
CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_email_idx
    ON abandoned_checkout_emails (email);
CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_token_idx
    ON abandoned_checkout_emails (token);

ALTER TABLE abandoned_checkout_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON abandoned_checkout_emails FROM anon, authenticated;

-- Verify:
--   SELECT count(*) FROM abandoned_checkout_emails;
