-- =========================================================================
-- SPEND WALLET CREDITS - atomic, non-exploitable debit
-- =========================================================================
-- Mirrors complete_wallet_topup(): SECURITY DEFINER, service_role only, so a
-- signed-in customer can never call it directly from the browser. The API
-- layer authenticates the user, prices the cart server-side, and only then
-- invokes this.
--
-- The two attacks this must survive:
--
--   1. DOUBLE SPEND / RACE. Two requests firing at once must not both pass a
--      balance check. Guarded by doing the check and the debit in ONE
--      conditional UPDATE - Postgres takes a row lock, so the second request
--      blocks and then re-evaluates against the already-debited balance.
--      A read-then-write pair would be exploitable here; this is not.
--      customer_wallets.balance_cents also has CHECK (balance_cents >= 0) as
--      a final backstop.
--
--   2. REPLAY. Re-submitting the same order must not debit twice. Guarded by
--      an early idempotency check plus the UNIQUE constraint on
--      wallet_transactions.provider_session_id, which makes a duplicate
--      insert fail at the database level even under a race.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.spend_wallet_credits(
    p_user_id      UUID,
    p_amount_cents BIGINT,
    p_order_id     TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_balance BIGINT;
BEGIN
    IF p_user_id IS NULL OR p_order_id IS NULL OR btrim(p_order_id) = '' THEN
        RAISE EXCEPTION 'Invalid wallet purchase request';
    END IF;

    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    -- Replay guard: this order already debited, return the balance unchanged.
    SELECT w.balance_cents INTO new_balance
    FROM   public.customer_wallets w
    WHERE  w.user_id = p_user_id
      AND  EXISTS (
            SELECT 1 FROM public.wallet_transactions t
            WHERE  t.provider            = 'wallet'
              AND  t.kind                = 'purchase'
              AND  t.provider_session_id = p_order_id
      );
    IF FOUND THEN
        RETURN new_balance;
    END IF;

    -- Check and debit in a single statement. This is the race-safe part.
    UPDATE public.customer_wallets
    SET    balance_cents = balance_cents - p_amount_cents,
           updated_at    = NOW()
    WHERE  user_id       = p_user_id
      AND  balance_cents >= p_amount_cents
    RETURNING balance_cents INTO new_balance;

    IF NOT FOUND THEN
        -- Either no wallet row, or not enough credit. Deliberately the same
        -- message either way so the endpoint cannot be used to probe.
        RAISE EXCEPTION 'Insufficient credits';
    END IF;

    INSERT INTO public.wallet_transactions
        (user_id, kind, status, amount_cents, currency, provider, provider_session_id, metadata)
    VALUES
        (p_user_id, 'purchase', 'completed', p_amount_cents, 'USD', 'wallet', p_order_id,
         jsonb_build_object('order_id', p_order_id));

    RETURN new_balance;
END;
$$;

-- Never callable by a browser session, only by the service role.
REVOKE ALL ON FUNCTION public.spend_wallet_credits(UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_wallet_credits(UUID, BIGINT, TEXT) TO service_role;

COMMENT ON FUNCTION public.spend_wallet_credits(UUID, BIGINT, TEXT) IS
    'Atomically debits wallet credits for an order. Race-safe and replay-safe. service_role only.';


-- =========================================================================
-- REFUND WALLET CREDITS - compensating action
-- =========================================================================
-- If the debit succeeds but writing the order then fails, the customer would
-- be out of pocket with nothing to show for it. wallet-purchase.js calls this
-- to put the credits back.
--
-- Idempotent: the refund is keyed 'refund_<order_id>' against the UNIQUE
-- provider_session_id, so a retried refund cannot credit twice - which would
-- otherwise be free money.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.refund_wallet_credits(
    p_user_id      UUID,
    p_amount_cents BIGINT,
    p_order_id     TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    refund_key  TEXT;
    new_balance BIGINT;
BEGIN
    IF p_user_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0
       OR p_order_id IS NULL OR btrim(p_order_id) = '' THEN
        RAISE EXCEPTION 'Invalid refund request';
    END IF;

    refund_key := 'refund_' || p_order_id;

    -- Already refunded: return the balance untouched.
    SELECT w.balance_cents INTO new_balance
    FROM   public.customer_wallets w
    WHERE  w.user_id = p_user_id
      AND  EXISTS (
            SELECT 1 FROM public.wallet_transactions t
            WHERE  t.provider_session_id = refund_key
      );
    IF FOUND THEN
        RETURN new_balance;
    END IF;

    -- Only refund against a purchase that actually happened.
    IF NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions t
        WHERE  t.provider            = 'wallet'
          AND  t.kind                = 'purchase'
          AND  t.provider_session_id = p_order_id
          AND  t.user_id             = p_user_id
    ) THEN
        RAISE EXCEPTION 'No matching wallet purchase to refund';
    END IF;

    UPDATE public.customer_wallets
    SET    balance_cents = balance_cents + p_amount_cents,
           updated_at    = NOW()
    WHERE  user_id       = p_user_id
    RETURNING balance_cents INTO new_balance;

    INSERT INTO public.wallet_transactions
        (user_id, kind, status, amount_cents, currency, provider, provider_session_id, metadata)
    VALUES
        (p_user_id, 'refund', 'completed', p_amount_cents, 'USD', 'wallet', refund_key,
         jsonb_build_object('order_id', p_order_id, 'reason', 'order_write_failed'));

    RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_wallet_credits(UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_wallet_credits(UUID, BIGINT, TEXT) TO service_role;

COMMENT ON FUNCTION public.refund_wallet_credits(UUID, BIGINT, TEXT) IS
    'Compensating refund when an order write fails after a wallet debit. Idempotent. service_role only.';
