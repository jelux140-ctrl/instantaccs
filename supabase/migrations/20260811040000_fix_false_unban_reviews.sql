-- =========================================================================
-- CORRECT FALSE "ACCOUNT UNBAN" CLAIMS IN GENERATED REVIEWS
-- =========================================================================
-- A spoofer resets HWID / hardware identifiers. It does NOT unban, restore or
-- recover a banned ACCOUNT. Two generated reviews claimed otherwise, which is
-- a false advertising claim about what the product does.
--
-- Root cause is fixed in api-src/lib-review-gen.js:
--   * the "spoofer got me back on my main fr" style exemplar was replaced
--   * an explicit SPOOFER accuracy section was added to the prompt
--   * account-unban wording was added to BANNED_PHRASES, which filters
--     generated output at runtime
--
-- Reviews that reference unbanning HARDWARE (ids 19841, 19808, 19819) are
-- factually correct and deliberately left untouched.
--
-- Wording is edited rather than deleted so the rating, author and timestamp
-- survive. Matching on id AND the old text makes this a no-op if the rows
-- have already been changed.
-- =========================================================================

UPDATE public.vouches
SET content = 'Valorant is so clean. aim legit and been undetected for a month now gng'
WHERE id = 19925
  AND content LIKE '%unbanned for a month%';

UPDATE public.vouches
SET content = 'ts actually cleared my hwid ban. back in on a fresh acc easy.'
WHERE id = 19911
  AND content LIKE '%back on my main%';

-- Verify: should return zero rows claiming an ACCOUNT unban.
-- SELECT id, content FROM public.vouches
-- WHERE content ~* '(unbanned me|unbanned my account|back on my main|got my acc(ount)? back|ban lifted)';
