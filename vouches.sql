-- =========================================
-- VOUCHES (add-on — run if you already have orders/blog/promo)
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

-- If your table already exists with UNIQUE(discord_user_id), run once:
-- ALTER TABLE vouches DROP CONSTRAINT IF EXISTS vouches_discord_user_id_key;

-- Proof images bucket (public read; uploads are server-side with service role)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vouch-proofs',
    'vouch-proofs',
    true,
    3145728,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read vouch proofs" ON storage.objects;
CREATE POLICY "Public read vouch proofs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'vouch-proofs');