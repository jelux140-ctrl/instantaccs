-- =========================================
-- CREED - SUPABASE DATABASE SCHEMA
-- Run this SQL in Supabase SQL Editor
-- =========================================

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    amount TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    customer_email TEXT,
    discord_username TEXT,
    items JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add discord_username column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'discord_username'
    ) THEN
        ALTER TABLE orders ADD COLUMN discord_username TEXT;
    END IF;
END $$;

-- Dedupe order confirmation emails (Resend / admin)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'receipt_email_sent_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN receipt_email_sent_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Create index on session_id for lookups
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);

-- Create index on customer_email for lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);

-- Enable Row Level Security (RLS)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists, then create it
-- (This allows serverless functions to insert/select)
DROP POLICY IF EXISTS "Allow service role full access" ON orders;
CREATE POLICY "Allow service role full access"
ON orders
FOR ALL
USING (true)
WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE orders IS 'Stores order information from Creed store';
COMMENT ON COLUMN orders.id IS 'Unique order identifier';
COMMENT ON COLUMN orders.session_id IS 'Payment session ID from Stripe';
COMMENT ON COLUMN orders.status IS 'Order status: pending, completed, failed';
COMMENT ON COLUMN orders.items IS 'JSON array of order items';
COMMENT ON COLUMN orders.created_at IS 'When the order was created';
COMMENT ON COLUMN orders.paid_at IS 'When the payment was completed';
COMMENT ON COLUMN orders.discord_username IS 'Discord username for customer support and product access';

-- =========================================
-- PROMO SIGNUPS TABLE
-- Emails collected from the 5% discount popup
-- =========================================

CREATE TABLE IF NOT EXISTS promo_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_signups_created_at ON promo_signups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_signups_email ON promo_signups(email);

ALTER TABLE promo_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access" ON promo_signups;
CREATE POLICY "Allow service role full access"
ON promo_signups
FOR ALL
USING (true)
WITH CHECK (true);

COMMENT ON TABLE promo_signups IS 'Emails collected from promo popup (5% discount)';

-- =========================================
-- BLOG POSTS TABLE
-- AI-generated SEO-optimized blog articles
-- =========================================

CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    meta_description TEXT,
    keywords TEXT[],
    content TEXT NOT NULL,
    excerpt TEXT,
    category TEXT DEFAULT 'gaming',
    tags TEXT[],
    featured_image_url TEXT,
    featured_image_alt TEXT,
    author TEXT DEFAULT 'Creed Team',
    status TEXT NOT NULL DEFAULT 'draft',
    reading_time_minutes INTEGER DEFAULT 5,
    views INTEGER DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at DESC);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access" ON blog_posts;
CREATE POLICY "Allow service role full access"
ON blog_posts
FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read published posts" ON blog_posts;
CREATE POLICY "Allow public read published posts"
ON blog_posts
FOR SELECT
USING (status = 'published');

DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER update_blog_posts_updated_at
    BEFORE UPDATE ON blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE blog_posts IS 'AI-generated SEO-optimized blog posts for organic traffic';
COMMENT ON COLUMN blog_posts.slug IS 'URL-friendly unique identifier for SEO';
COMMENT ON COLUMN blog_posts.meta_description IS 'SEO meta description (max 160 chars)';
COMMENT ON COLUMN blog_posts.keywords IS 'SEO keywords array';
COMMENT ON COLUMN blog_posts.status IS 'Post status: draft, published, archived';

-- =========================================
-- VOUCHES (Discord login via Supabase Auth)
-- Optional proof images in Storage bucket vouch-proofs
-- =========================================

CREATE TABLE IF NOT EXISTS vouches (
    id SERIAL PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    avatar_url TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    content TEXT NOT NULL,
    proof_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vouches_created_at ON vouches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouches_discord_user_id ON vouches(discord_user_id);

ALTER TABLE vouches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE vouches IS 'User vouches (Discord); use GET /api/vouches (service role)';

-- Existing DBs: if vouches had UNIQUE(discord_user_id), run:
-- ALTER TABLE vouches DROP CONSTRAINT IF EXISTS vouches_discord_user_id_key;

-- Storage bucket for proof images (run once in SQL Editor):
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('vouch-proofs', 'vouch-proofs', true, 3145728, ARRAY['image/jpeg','image/png','image/gif','image/webp'])
-- ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;
--
-- CREATE POLICY "Public read vouch proofs" ON storage.objects FOR SELECT TO public USING (bucket_id = 'vouch-proofs');
--
-- Supabase Dashboard: Authentication → Providers → Discord (Client ID + Secret from Discord Developer Portal).
-- Redirect URL in Discord app: https://<project-ref>.supabase.co/auth/v1/callback
-- Site URL: https://creedv2.com — Additional redirect: https://creedv2.com/vouches

-- =========================================
-- SITE SETTINGS (storefront maintenance mode, etc.)
-- =========================================

CREATE TABLE IF NOT EXISTS site_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    storefront_maintenance BOOLEAN NOT NULL DEFAULT false,
    maintenance_password TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_settings (id, storefront_maintenance) VALUES ('global', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role site_settings" ON site_settings;
CREATE POLICY "Allow service role site_settings"
ON site_settings FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE site_settings IS 'Key/value site flags; APIs use service role only';

-- =========================================
-- ABANDONED CHECKOUT EMAILS
-- One row per reminder that actually sent. See abandoned-checkout-emails.sql
-- =========================================

CREATE TABLE IF NOT EXISTS abandoned_checkout_emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token           TEXT UNIQUE NOT NULL,
    email           TEXT NOT NULL,
    order_id        TEXT,
    session_id      TEXT,
    amount          TEXT,
    currency        TEXT DEFAULT 'USD',
    items           JSONB DEFAULT '[]'::jsonb,
    subject         TEXT,
    resend_id       TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opened_at       TIMESTAMPTZ,
    open_count      INTEGER NOT NULL DEFAULT 0,
    clicked_at      TIMESTAMPTZ,
    click_count     INTEGER NOT NULL DEFAULT 0,
    last_click_at   TIMESTAMPTZ,
    click_content   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_sent_at_idx
    ON abandoned_checkout_emails (sent_at DESC);
CREATE INDEX IF NOT EXISTS abandoned_checkout_emails_email_idx
    ON abandoned_checkout_emails (email);

ALTER TABLE abandoned_checkout_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON abandoned_checkout_emails FROM anon, authenticated;

-- =========================================
-- PORTAL (see portal-schema.sql for full migration)
-- =========================================
-- order_portal_tokens, portal_tickets, portal_messages, portal_announcements
-- Run portal-schema.sql in SQL Editor to create these tables.