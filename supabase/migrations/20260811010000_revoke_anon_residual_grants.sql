-- =========================================================================
-- HARDENING PASS 2: REVOKE RESIDUAL anon GRANTS
-- =========================================================================
-- Verified live after 20260811000000_rls_lockdown: the anon key can no
-- longer write to ANY table (every INSERT returns 42501). However, five
-- tables still carried anon/authenticated grants and answered reads with
-- "200 + 0 rows" rather than "401 permission denied":
--
--     customer_profiles, customer_wallets, wallet_transactions,
--     vouches, email_optouts
--
-- Those reads are empty only because RLS filters them. That is one layer of
-- defense. If anyone later adds a permissive policy to one of these tables,
-- the lingering grant would silently re-expose it - which is precisely the
-- class of mistake that caused the original breach.
--
-- This migration removes the grant layer as well, so both gates must fail
-- before data is exposed.
--
-- DELIBERATELY PRESERVED:
--   * authenticated SELECT on customer_profiles / customer_wallets /
--     wallet_transactions - the signed-in account + wallet UI reads these
--     directly from the browser (account-wallet.js). Their policies are
--     correctly scoped `TO authenticated USING (auth.uid() = ...)`.
--   * anon SELECT on blog_posts - the public blog, published posts only.
--   * service_role is never touched; it bypasses RLS and keeps working.
-- =========================================================================

DO $$
DECLARE
    t text;
    -- Server-side only. No browser code touches these tables directly.
    service_only text[] := ARRAY['vouches', 'email_optouts'];
    -- Read by the signed-in customer in the browser.
    customer_owned text[] := ARRAY['customer_profiles', 'customer_wallets', 'wallet_transactions'];
BEGIN
    -- Reachable by service_role only.
    FOREACH t IN ARRAY service_only LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        END IF;
    END LOOP;

    -- Customer-owned: strip anon entirely, and reduce authenticated to
    -- SELECT so a signed-in user can never write to their own wallet row.
    -- Balance changes must go through complete_wallet_topup(), which is
    -- SECURITY DEFINER and granted to service_role only.
    FOREACH t IN ARRAY customer_owned LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
            EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        END IF;
    END LOOP;
END $$;
