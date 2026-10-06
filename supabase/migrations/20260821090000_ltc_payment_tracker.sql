CREATE TABLE IF NOT EXISTS public.ltc_payment_sessions (
    order_id TEXT PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    tracker_token_hash TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL,
    amount_litoshi BIGINT NOT NULL CHECK (amount_litoshi > 0),
    amount_ltc NUMERIC(20,8) NOT NULL CHECK (amount_ltc > 0),
    usd_amount NUMERIC(12,2) NOT NULL CHECK (usd_amount > 0),
    quoted_ltc_usd NUMERIC(18,8) NOT NULL CHECK (quoted_ltc_usd > 0),
    status TEXT NOT NULL DEFAULT 'awaiting'
        CHECK (status IN ('awaiting', 'detected', 'confirming', 'confirmed', 'expired', 'underpaid', 'failed')),
    txid TEXT UNIQUE,
    received_litoshi BIGINT,
    confirmations INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ltc_payment_sessions_status
ON public.ltc_payment_sessions(status, expires_at);

ALTER TABLE public.ltc_payment_sessions ENABLE ROW LEVEL SECURITY;

-- Only server-side service-role code may read or mutate payment tracking.
REVOKE ALL ON TABLE public.ltc_payment_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ltc_payment_sessions TO service_role;

COMMENT ON TABLE public.ltc_payment_sessions IS
'Server-only Litecoin payment quotes and on-chain verification state.';
