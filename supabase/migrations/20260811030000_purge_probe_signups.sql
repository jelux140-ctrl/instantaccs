-- =========================================================================
-- PURGE PROBE / TEST ROWS FROM promo_signups
-- =========================================================================
-- All of these were inserted in a five-minute burst on 2026-08-10
-- (19:20-19:25 UTC) through the then-unauthenticated /api/send-promo-email,
-- which validated addresses with `email.includes('@')`.
--
-- That endpoint is now origin-checked, rate limited and strictly validated
-- (verified live: reserved TLDs 400, missing/foreign origin 403), so this is
-- cleanup of historical rows, not an ongoing problem.
--
-- Deliberately preserved: bodhistewart62@gmail.com - the one address in the
-- table that looks like a real signup.
-- =========================================================================

-- Anything on a reserved / non-deliverable TLD is by definition not a real
-- signup. Matches the RESERVED_TLDS list in lib-abuse-guard.js.
DELETE FROM public.promo_signups
WHERE email ~* '@[^@]*\.(local|test|invalid|example|localhost|internal)$';

-- Known probe and placeholder addresses on otherwise-valid TLDs.
DELETE FROM public.promo_signups
WHERE lower(email) IN (
    'admin@creedv2.com',   -- probing for an admin account
    'test@test.com'
);

-- Verify: expect only genuine signups to remain.
-- SELECT email, created_at FROM public.promo_signups ORDER BY created_at DESC;
