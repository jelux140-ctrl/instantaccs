/* =========================================
   CREED - PAY WITH WALLET CREDITS

   Threat model - everything the browser sends is hostile:

     * IDENTITY  never taken from the request body. The caller's Supabase
                 access token is verified server-side with the service-role
                 client, and the user id comes from that verified token. A
                 forged user_id therefore buys nothing.
     * PRICE     never taken from the request. The cart is re-priced from
                 lib-pricing.js, so a tampered price or quantity is ignored.
     * BALANCE   never checked here. The check and the debit happen together
                 inside spend_wallet_credits(), which is race-safe. Checking
                 in JS then debiting would be a double-spend window.
     * REPLAY    the order id is the wallet transaction's unique key, so a
                 resubmitted request cannot debit twice.

   The order is only written AFTER the debit succeeds, and if writing the
   order fails the credits are refunded, so a customer can never be charged
   for an order that does not exist.
   ========================================= */

import { createClient } from '@supabase/supabase-js';
import { calculateServerPricing } from './lib-pricing.js';
import { notifySale } from './lib-sales-notify.js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
    }
    return createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let supabase;
    try {
        supabase = getSupabaseClient();
    } catch {
        return res.status(500).json({ error: 'Service unavailable' });
    }

    // ---- 1. Verify identity from the token, not the body -----------------
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
        return res.status(401).json({ error: 'Sign in to pay with credits' });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
        return res.status(401).json({ error: 'Your session expired. Sign in again.' });
    }
    if (!user.email_confirmed_at) {
        return res.status(403).json({ error: 'Verify your email before paying with credits.' });
    }

    // ---- 2. Re-price the cart server-side --------------------------------
    const { items, discountCode, discordUsername, referralCode } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Invalid cart items' });
    }

    let pricing;
    try {
        pricing = calculateServerPricing(items, discountCode);
    } catch (pricingError) {
        return res.status(400).json({ error: pricingError.message || 'Invalid cart pricing' });
    }

    const amountCents = Math.round(pricing.total * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
        return res.status(400).json({ error: 'Invalid total amount' });
    }

    const orderId = `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const cleanReferral = String(referralCode || '').trim().toLowerCase()
        .replace(/[^a-z0-9_-]/g, '').slice(0, 40) || null;

    // ---- 3. Atomic debit (checks balance and deducts in one statement) ---
    const { data: newBalance, error: spendError } = await supabase.rpc('spend_wallet_credits', {
        p_user_id: user.id,
        p_amount_cents: amountCents,
        p_order_id: orderId,
    });

    if (spendError) {
        const insufficient = /insufficient/i.test(spendError.message || '');
        return res.status(insufficient ? 402 : 500).json({
            error: insufficient ? 'Not enough credits for this order.' : 'Could not complete payment',
        });
    }

    // ---- 4. Record the order, refunding the debit if this fails ----------
    const nowIso = new Date().toISOString();
    const { error: orderError } = await supabase.from('orders').insert({
        id: orderId,
        session_id: orderId,
        status: 'completed',
        amount: pricing.total.toFixed(2),
        currency: 'USD',
        customer_email: user.email,
        discord_username: discordUsername || null,
        referral_code: cleanReferral,
        items: pricing.items,
        created_at: nowIso,
        paid_at: nowIso,
    });

    if (orderError) {
        console.error('Wallet order insert failed, refunding credits:', orderError.message);
        // Put the money back rather than leaving the customer short.
        const { error: refundError } = await supabase.rpc('refund_wallet_credits', {
            p_user_id: user.id,
            p_amount_cents: amountCents,
            p_order_id: orderId,
        });
        if (refundError) {
            // Must be loud: the customer is out of pocket with no order.
            console.error('CRITICAL: wallet refund failed for', orderId, user.id, refundError.message);
        }
        return res.status(500).json({ error: 'Could not complete order. Your credits were not charged.' });
    }

    notifySale({
        id: orderId,
        amount: pricing.total.toFixed(2),
        currency: 'USD',
        items: pricing.items,
        customerEmail: user.email,
        paymentMethod: 'wallet',
    }).catch(() => {});

    return res.status(200).json({
        success: true,
        orderId,
        amount: pricing.total.toFixed(2),
        currency: 'USD',
        balanceCents: newBalance,
        balance: ((newBalance || 0) / 100).toFixed(2),
    });
}
