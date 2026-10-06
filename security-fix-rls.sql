-- =========================================================================
-- CREED - CRITICAL SECURITY HOTFIX: RLS LOCKDOWN
-- =========================================================================
-- ROOT CAUSE
--   Legacy policies were written as:
--       CREATE POLICY "Allow service role full access"
--       ON <table> FOR ALL USING (true) WITH CHECK (true);
--
--   With no `TO` clause, Postgres defaults the policy to `TO PUBLIC`, which
--   includes the `anon` role. The anon key is publicly served by
--   /api/supabase-public, so ANY visitor could SELECT / INSERT / UPDATE /
--   DELETE every one of these tables directly against Supabase, bypassing
--   the API layer and its ADMIN_TOKEN checks entirely.
--
-- WHY DROPPING THESE IS SAFE
--   The `service_role` key BYPASSES RLS entirely - it never needed a policy.
--   All server-side API functions use SUPABASE_SERVICE_ROLE_KEY and keep
--   working. Browser code only uses Supabase Auth plus a read of
--   customer_wallets, which has a correct `TO authenticated` policy.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste -> Run. (DDL is manual here.)
--   Run section 1 and 2 together. Section 3 is verification.
--
--   PREREQUISITE: confirm SUPABASE_SERVICE_ROLE_KEY is set in your Vercel
--   env BEFORE running this, or server-side reads will start returning empty.
-- =========================================================================


-- =========================================================================
-- SECTION 1: DROP THE PUBLIC-FACING "service role" POLICIES
-- =========================================================================

-- Core commerce ---------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access" ON orders;
DROP POLICY IF EXISTS "Allow service role full access" ON promo_signups;
DROP POLICY IF EXISTS "Allow service role full access" ON blog_posts;
DROP POLICY IF EXISTS "Allow service role site_settings" ON site_settings;

-- Portal ----------------------------------------------------------------
DROP POLICY IF EXISTS "Service role order_portal_tokens"  ON order_portal_tokens;
DROP POLICY IF EXISTS "Service role portal_tickets"       ON portal_tickets;
DROP POLICY IF EXISTS "Service role portal_messages"      ON portal_messages;
DROP POLICY IF EXISTS "Service role portal_announcements" ON portal_announcements;

-- Licensing (highest value target - keys were readable by anyone) --------
DROP POLICY IF EXISTS "Service role license_keys"              ON license_keys;
DROP POLICY IF EXISTS "Service role product_downloads"         ON product_downloads;
DROP POLICY IF EXISTS "Service role order_license_assignments" ON order_license_assignments;
DROP POLICY IF EXISTS "Service role order_key_assignment_log"  ON order_key_assignment_log;

-- Referrals -------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access affiliates"       ON affiliates;
DROP POLICY IF EXISTS "Service role full access affiliate_clicks" ON affiliate_clicks;


-- Make sure RLS is actually ENABLED everywhere. A table with RLS enabled
-- and zero policies denies all access to anon/authenticated, while
-- service_role still bypasses. That is exactly what we want.
ALTER TABLE orders                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_signups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_portal_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_tickets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_keys               ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_downloads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_license_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_key_assignment_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks           ENABLE ROW LEVEL SECURITY;


-- The blog's public read of PUBLISHED posts is intentional. Recreate it
-- explicitly scoped, so it can never widen to writes.
DROP POLICY IF EXISTS "Allow public read published posts" ON blog_posts;
CREATE POLICY "Allow public read published posts"
    ON blog_posts FOR SELECT
    TO anon, authenticated
    USING (status = 'published');


-- =========================================================================
-- SECTION 2: DEFENSE IN DEPTH - REVOKE TABLE GRANTS FROM anon
-- =========================================================================
-- RLS is the real gate, but Supabase grants anon/authenticated privileges
-- on public schema tables by default. Revoking means a future mistyped
-- policy cannot re-expose these tables.

REVOKE ALL ON orders                    FROM anon, authenticated;
REVOKE ALL ON promo_signups             FROM anon, authenticated;
REVOKE ALL ON site_settings             FROM anon, authenticated;
REVOKE ALL ON order_portal_tokens       FROM anon, authenticated;
REVOKE ALL ON portal_tickets            FROM anon, authenticated;
REVOKE ALL ON portal_messages           FROM anon, authenticated;
REVOKE ALL ON portal_announcements      FROM anon, authenticated;
REVOKE ALL ON license_keys              FROM anon, authenticated;
REVOKE ALL ON product_downloads         FROM anon, authenticated;
REVOKE ALL ON order_license_assignments FROM anon, authenticated;
REVOKE ALL ON order_key_assignment_log  FROM anon, authenticated;
REVOKE ALL ON affiliates                FROM anon, authenticated;
REVOKE ALL ON affiliate_clicks          FROM anon, authenticated;

-- blog_posts keeps anon SELECT only (public blog).
REVOKE ALL    ON blog_posts FROM anon, authenticated;
GRANT  SELECT ON blog_posts TO   anon, authenticated;

-- Customer-facing tables keep their correct `TO authenticated` policies.
-- Their SELECT grants must stay, so they are deliberately NOT revoked:
--   customer_profiles, customer_wallets, wallet_transactions


-- =========================================================================
-- SECTION 3: VERIFICATION - run these after, and read the output
-- =========================================================================

-- 3a. Any remaining policy that applies to PUBLIC or anon is a red flag.
--     `roles = {public}` means everyone, including anon.
--     EXPECTED RESULT: only the blog_posts SELECT policy, scoped to
--     {anon,authenticated}. Anything else with {public} must be fixed.
SELECT schemaname,
       tablename,
       policyname,
       roles,
       cmd,
       qual        AS using_expr,
       with_check
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  ('public' = ANY (roles) OR 'anon' = ANY (roles))
ORDER  BY tablename, policyname;


-- 3b. Any table WITHOUT RLS enabled is fully exposed to the anon key.
--     EXPECTED RESULT: zero rows.
SELECT n.nspname AS schema,
       c.relname AS table_without_rls
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
  AND  c.relkind = 'r'
  AND  c.relrowsecurity = false
ORDER  BY c.relname;


-- 3c. What can anon still actually reach at the grant level?
--     EXPECTED RESULT: blog_posts / SELECT only.
SELECT table_name, privilege_type
FROM   information_schema.role_table_grants
WHERE  grantee = 'anon'
  AND  table_schema = 'public'
ORDER  BY table_name, privilege_type;
