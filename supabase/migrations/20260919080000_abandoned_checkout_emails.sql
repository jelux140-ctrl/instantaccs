-- Abandoned checkout reminder log: one row per email that actually sent.
-- Service role only. Open/click pixels hit the Creed API, not PostgREST.

CREATE TABLE IF NOT EXISTS public.abandoned_checkout_emails (
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
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_sent_at_idx
    ON public.abandoned_checkout_emails (sent_at DESC);
CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_email_idx
    ON public.abandoned_checkout_emails (email);
CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_token_idx
    ON public.abandoned_checkout_emails (token);

ALTER TABLE public.abandoned_checkout_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.abandoned_checkout_emails FROM anon, authenticated;
