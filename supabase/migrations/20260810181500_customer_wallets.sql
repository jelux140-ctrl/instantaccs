CREATE TABLE IF NOT EXISTS public.customer_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('topup', 'purchase', 'refund', 'adjustment')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    provider TEXT NOT NULL,
    provider_session_id TEXT UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON public.wallet_transactions(user_id, created_at DESC);
ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can read their wallet" ON public.customer_wallets;
CREATE POLICY "Customers can read their wallet" ON public.customer_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Customers can read their wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Customers can read their wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.customer_wallets (user_id)
SELECT id FROM auth.users ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_customer_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.customer_wallets (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_wallet_create ON auth.users;
CREATE TRIGGER on_auth_user_wallet_create AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.ensure_customer_wallet();

CREATE OR REPLACE FUNCTION public.complete_wallet_topup(
    p_transaction_id UUID,
    p_provider_session_id TEXT,
    p_paid_amount_cents BIGINT
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    tx public.wallet_transactions%ROWTYPE;
    new_balance BIGINT;
BEGIN
    SELECT * INTO tx FROM public.wallet_transactions WHERE id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet transaction not found'; END IF;
    IF tx.kind <> 'topup' OR tx.provider <> 'stripe' THEN RAISE EXCEPTION 'Invalid wallet transaction'; END IF;
    IF tx.amount_cents <> p_paid_amount_cents THEN RAISE EXCEPTION 'Top-up amount mismatch'; END IF;
    IF tx.provider_session_id IS NOT NULL AND tx.provider_session_id <> p_provider_session_id THEN RAISE EXCEPTION 'Session mismatch'; END IF;
    IF tx.status = 'completed' THEN
        SELECT balance_cents INTO new_balance FROM public.customer_wallets WHERE user_id = tx.user_id;
        RETURN new_balance;
    END IF;
    IF tx.status <> 'pending' THEN RAISE EXCEPTION 'Top-up is not pending'; END IF;

    INSERT INTO public.customer_wallets (user_id, balance_cents)
    VALUES (tx.user_id, tx.amount_cents)
    ON CONFLICT (user_id) DO UPDATE
    SET balance_cents = customer_wallets.balance_cents + EXCLUDED.balance_cents, updated_at = NOW()
    RETURNING balance_cents INTO new_balance;

    UPDATE public.wallet_transactions
    SET status = 'completed', provider_session_id = p_provider_session_id, completed_at = NOW()
    WHERE id = tx.id;
    RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_wallet_topup(UUID, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_wallet_topup(UUID, TEXT, BIGINT) TO service_role;
