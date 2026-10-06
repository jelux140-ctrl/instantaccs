-- =========================================
-- CREED — Customer portal (order-scoped tokens, tickets, chat, announcements)
-- Run in Supabase SQL Editor after orders table exists.
-- =========================================

-- Order portal access tokens (raw token shown once; only SHA-256 stored)
CREATE TABLE IF NOT EXISTS order_portal_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_order_portal_tokens_order_id ON order_portal_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_order_portal_tokens_hash ON order_portal_tokens(token_hash);

CREATE TABLE IF NOT EXISTS portal_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'claimed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_tickets_order_id ON portal_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_status ON portal_tickets(status);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_updated ON portal_tickets(updated_at DESC);

CREATE TABLE IF NOT EXISTS portal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES portal_tickets(id) ON DELETE CASCADE,
    author_role TEXT NOT NULL CHECK (author_role IN ('customer', 'admin')),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_ticket_id ON portal_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_portal_messages_ticket_created ON portal_messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS portal_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT true,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_announcements_published ON portal_announcements(published_at DESC NULLS LAST);

-- RLS: APIs use service role only (no anon policies)
ALTER TABLE order_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role order_portal_tokens" ON order_portal_tokens;
CREATE POLICY "Service role order_portal_tokens" ON order_portal_tokens FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role portal_tickets" ON portal_tickets;
CREATE POLICY "Service role portal_tickets" ON portal_tickets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role portal_messages" ON portal_messages;
CREATE POLICY "Service role portal_messages" ON portal_messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role portal_announcements" ON portal_announcements;
CREATE POLICY "Service role portal_announcements" ON portal_announcements FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE order_portal_tokens IS 'Hashed portal tokens; one active issuance per bootstrap revokes previous';
COMMENT ON TABLE portal_tickets IS 'Support tickets scoped to paid orders';
COMMENT ON TABLE portal_messages IS 'Ticket thread messages (customer or admin)';

-- Announcement body: plain (legacy) or markdown (rendered in portal with marked + DOMPurify)
ALTER TABLE portal_announcements ADD COLUMN IF NOT EXISTS body_format TEXT NOT NULL DEFAULT 'plain';

-- Ticket status: add "claimed" (order picked up by customer — cannot be reopened)
ALTER TABLE portal_tickets DROP CONSTRAINT IF EXISTS portal_tickets_status_check;
ALTER TABLE portal_tickets ADD CONSTRAINT portal_tickets_status_check
    CHECK (status IN ('open', 'closed', 'claimed'));
