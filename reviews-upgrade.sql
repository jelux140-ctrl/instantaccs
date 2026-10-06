-- =========================================
-- CREED - REVIEWS UPGRADE
-- Adds product tagging, staff replies and verified-purchase flags
-- to the existing `vouches` table (surfaced on the site as "Reviews").
-- Safe to run more than once.
-- =========================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'vouches' AND column_name = 'product') THEN
        ALTER TABLE vouches ADD COLUMN product TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'vouches' AND column_name = 'product_variant') THEN
        ALTER TABLE vouches ADD COLUMN product_variant TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'vouches' AND column_name = 'product_short') THEN
        ALTER TABLE vouches ADD COLUMN product_short TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'vouches' AND column_name = 'staff_reply') THEN
        ALTER TABLE vouches ADD COLUMN staff_reply TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'vouches' AND column_name = 'staff_reply_at') THEN
        ALTER TABLE vouches ADD COLUMN staff_reply_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'vouches' AND column_name = 'verified_purchase') THEN
        ALTER TABLE vouches ADD COLUMN verified_purchase BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vouches_product ON vouches(product);

COMMENT ON COLUMN vouches.product IS 'Product the review is about, e.g. "Rainbow Six Siege"';
COMMENT ON COLUMN vouches.product_variant IS 'Plan purchased, e.g. "1 Week"';
COMMENT ON COLUMN vouches.product_short IS 'Short tag shown on the card, e.g. "R6"';
COMMENT ON COLUMN vouches.staff_reply IS 'Creed Support response shown under the review';
