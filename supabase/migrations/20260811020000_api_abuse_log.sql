-- =========================================================================
-- ABUSE LOG - backing store for public endpoint rate limiting
-- =========================================================================
-- Public endpoints (promo signup, receipts, manual checkout) run with the
-- service role and therefore bypass RLS. They need their own throttle.
-- An in-memory counter would reset on every serverless cold start, so the
-- window is stored here.
--
-- Written to by service_role only. anon/authenticated get nothing.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.api_abuse_log (
    id         BIGSERIAL PRIMARY KEY,
    bucket     TEXT NOT NULL,
    ident      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supports the "count hits for this caller inside the window" lookup.
CREATE INDEX IF NOT EXISTS idx_api_abuse_log_lookup
    ON public.api_abuse_log (bucket, ident, created_at DESC);

-- Supports pruning.
CREATE INDEX IF NOT EXISTS idx_api_abuse_log_created
    ON public.api_abuse_log (created_at);

ALTER TABLE public.api_abuse_log ENABLE ROW LEVEL SECURITY;

-- No policies: RLS enabled with zero policies denies anon/authenticated
-- outright, while service_role bypasses. Grants revoked as defense in depth.
REVOKE ALL ON public.api_abuse_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.api_abuse_log_id_seq FROM anon, authenticated;

COMMENT ON TABLE public.api_abuse_log IS
    'Rate-limit hit log for unauthenticated public API endpoints. Prune rows older than a day.';
