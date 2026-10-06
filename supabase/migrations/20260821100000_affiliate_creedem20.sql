-- =========================================================================
-- REFERRAL CODE: creedem20  (email "we're back" campaign)
-- =========================================================================
-- Two separate systems are in play and both are needed for this campaign:
--
--   1. DISCOUNT  - VALID_DISCOUNT_CODES in lib-pricing.js. CREEDEM20 already
--                  exists there at 20% in BOTH the Creed and DigitalVault
--                  copies, and is verified working at the live checkout.
--                  Nothing to change.
--
--   2. REFERRAL  - this table. Without a row here, ?ref=creedem20 links get
--                  logged as clicks but there is no affiliate to attribute
--                  them to, so the campaign cannot be measured.
--
-- referral-track.js lowercases and strips the code, so the row is stored
-- lowercase to match what actually arrives.
-- =========================================================================

INSERT INTO public.affiliates (code, name, note, active)
VALUES (
    'creedem20',
    'Email campaign — 20% off relaunch',
    'Comeback email blast. Pairs with the CREEDEM20 discount code (20%). Link format: https://www.creedv2.com/?ref=creedem20',
    TRUE
)
ON CONFLICT (code) DO UPDATE
    SET name   = EXCLUDED.name,
        note   = EXCLUDED.note,
        active = TRUE;

-- Verify:
--   SELECT code, name, active FROM public.affiliates WHERE code = 'creedem20';
--   SELECT COUNT(*) FROM public.affiliate_clicks WHERE code = 'creedem20';
--   SELECT id, amount, created_at FROM public.orders WHERE referral_code = 'creedem20';
