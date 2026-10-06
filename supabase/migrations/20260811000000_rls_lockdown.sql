-- =========================================================================
-- CRITICAL SECURITY FIX: RLS LOCKDOWN
-- =========================================================================
-- ROOT CAUSE
--   Legacy policies were written as:
--       CREATE POLICY "Allow service role full access"
--       ON <table> FOR ALL USING (true) WITH CHECK (true);
--
--   With no `TO` clause, Postgres defaults a policy to `TO PUBLIC`, which
--   includes the `anon` role. The anon key is publicly served by
--   /api/supabase-public, so any visitor could SELECT / INSERT / UPDATE /
--   DELETE these tables directly against PostgREST, completely bypassing
--   the API layer and its ADMIN_TOKEN checks. This is how forged
--   "completed" orders were injected.
--
-- WHY THIS IS SAFE
--   `service_role` BYPASSES RLS entirely and never needed a policy. All
--   server-side functions use SUPABASE_SERVICE_ROLE_KEY (confirmed set in
--   Vercel for all environments) and keep working. Browser code only uses
--   Supabase Auth plus a read of customer_wallets, which has a correct
--   `TO authenticated` policy and is deliberately left untouched.
--
--   Written idempotently and guarded on table existence, so it can be
--   re-run and cannot fail partway on a missing table.
-- =========================================================================

DO $$
DECLARE
    t   text;
    p   record;
    -- Tables that must NEVER be reachable by the anon key.
    -- Deliberately excludes customer_profiles / customer_wallets /
    -- wallet_transactions, which have correct `TO authenticated` policies.
    tables text[] := ARRAY[
        'orders',
        'promo_signups',
        'blog_posts',
        'site_settings',
        'order_portal_tokens',
        'portal_tickets',
        'portal_messages',
        'portal_announcements',
        'license_keys',
        'product_downloads',
        'order_license_assignments',
        'order_key_assignment_log',
        'affiliates',
        'affiliate_clicks'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Skip tables that do not exist in this database.
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'skipping % (does not exist)', t;
            CONTINUE;
        END IF;

        -- Drop EVERY policy on this table that is granted to PUBLIC or anon.
        -- Catches the known-bad ones by behaviour rather than by name, so a
        -- differently-named copy cannot survive.
        FOR p IN
            SELECT policyname
            FROM   pg_policies
            WHERE  schemaname = 'public'
              AND  tablename  = t
              AND  ('public' = ANY (roles) OR 'anon' = ANY (roles))
        LOOP
            RAISE NOTICE 'dropping exposed policy %.%', t, p.policyname;
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
        END LOOP;

        -- RLS enabled with zero policies denies anon/authenticated entirely,
        -- while service_role continues to bypass. That is the desired state.
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        -- Defense in depth: Supabase grants anon/authenticated privileges on
        -- public tables by default. Revoking means a future mistyped policy
        -- cannot silently re-expose the table.
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END $$;


-- The blog's public read of PUBLISHED posts is intentional. Recreate it
-- explicitly scoped and SELECT-only, so it can never widen to writes.
DO $$
BEGIN
    IF to_regclass('public.blog_posts') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Allow public read published posts" ON public.blog_posts;

        CREATE POLICY "Allow public read published posts"
            ON public.blog_posts FOR SELECT
            TO anon, authenticated
            USING (status = 'published');

        GRANT SELECT ON public.blog_posts TO anon, authenticated;
    END IF;
END $$;
