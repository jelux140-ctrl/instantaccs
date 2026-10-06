CREATE TABLE IF NOT EXISTS public.portal_email_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_portal_email_claims_order_created ON public.portal_email_claims(order_id, created_at DESC);
ALTER TABLE public.portal_email_claims ENABLE ROW LEVEL SECURITY;
-- Service-role API only. No anon/authenticated policies intentionally.

-- The earlier breach may have yielded portal tokens. Revoke every existing
-- portal session once; verified email/account access will mint fresh tokens.
UPDATE public.order_portal_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL;
