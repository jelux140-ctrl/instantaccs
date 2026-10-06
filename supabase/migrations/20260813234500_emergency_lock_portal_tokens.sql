-- Temporary containment while the Vercel deployment account is unavailable.
-- Prevent the currently-live legacy Order-ID endpoint from minting fresh portal
-- sessions from identifiers copied during the prior database breach.
CREATE OR REPLACE FUNCTION public.block_portal_token_issuance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Portal token issuance temporarily locked for security';
END;
$$;

DROP TRIGGER IF EXISTS emergency_block_portal_token_issuance ON public.order_portal_tokens;
CREATE TRIGGER emergency_block_portal_token_issuance
BEFORE INSERT ON public.order_portal_tokens
FOR EACH ROW EXECUTE FUNCTION public.block_portal_token_issuance();
