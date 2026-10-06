/* =========================================
   CREED - MANUAL PAYMENT API
   Creates pending orders for manual payments (crypto / PayPal).
   IMPORTANT: These orders must stay pending until staff manually verifies
   payment. License keys are assigned only when an order is marked completed.
   ========================================= */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { guardPublicPost } from './lib-abuse-guard.js';

import { calculateServerPricing } from './lib-pricing.js';


// Initialize Supabase client
const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(supabaseUrl, supabaseKey);
};

const LTC_ADDRESS = String(process.env.LTC_PAYMENT_ADDRESS || 'MSy2RtKn478b8n9ykP7W2yXgPenrDrSFoo').trim();

async function createLtcQuote(supabase, orderId, usdAmount) {
    const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd&include_last_updated_at=true', {
        headers: { Accept: 'application/json', 'User-Agent': 'Creed-LTC-Checkout/1.0' },
        signal: AbortSignal.timeout(8000),
    });
    if (!priceResponse.ok) throw new Error('Litecoin quote service is temporarily unavailable');
    const priceData = await priceResponse.json();
    const price = Number(priceData?.litecoin?.usd);
    const updatedAt = Number(priceData?.litecoin?.last_updated_at || 0);
    if (!Number.isFinite(price) || price <= 0 || !updatedAt || Date.now() / 1000 - updatedAt > 300) {
        throw new Error('Could not obtain a current Litecoin quote');
    }

    const amountLitoshi = Math.ceil((Number(usdAmount) / price) * 1e8);
    const amountLtc = (amountLitoshi / 1e8).toFixed(8);
    const trackerToken = `ltct_${randomBytes(32).toString('hex')}`;
    const trackerHash = createHash('sha256').update(trackerToken).digest('hex');
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const { error } = await supabase.from('ltc_payment_sessions').insert({
        order_id: orderId,
        tracker_token_hash: trackerHash,
        wallet_address: LTC_ADDRESS,
        amount_litoshi: amountLitoshi,
        amount_ltc: amountLtc,
        usd_amount: Number(usdAmount).toFixed(2),
        quoted_ltc_usd: price,
        expires_at: expiresAt,
    });
    if (error) throw error;
    return { trackerToken, address: LTC_ADDRESS, amountLtc, expiresAt };
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Must stay public (crypto / PayPal checkout), but unthrottled it let
        // anyone flood `orders` with pending rows. Prices are already computed
        // server-side and status is hard-coded 'pending', so this is purely an
        // anti-spam limit. 10/hour is well above real checkout behaviour.
        const guard = await guardPublicPost(req, getSupabaseClient(), {
            bucket: 'manual-payment',
            max: 10,
            windowSec: 3600,
        });
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }

        const { items, discountCode, userEmail, discordUsername, paymentMethod, referralCode } = req.body;
        const cleanReferral = String(referralCode || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || null;

        // Validate request
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid cart items' });
        }

        if (!paymentMethod || !['ltc', 'paypal'].includes(paymentMethod)) {
            return res.status(400).json({ error: 'Invalid payment method' });
        }

        let pricing;
        try {
            pricing = calculateServerPricing(items, discountCode);
        } catch (pricingError) {
            return res.status(400).json({ error: pricingError.message || 'Invalid cart pricing' });
        }
        const finalTotal = pricing.total;
        
        if (!finalTotal || finalTotal <= 0) {
            return res.status(400).json({ error: 'Invalid total amount' });
        }

        // Create order ID
        const orderId = `creed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const sessionId = `manual_${paymentMethod}_${orderId}`;

        // Create order record
        const order = {
            id: orderId,
            sessionId: sessionId,
            status: 'pending',
            amount: finalTotal.toFixed(2),
            currency: 'USD',
            customerEmail: userEmail || 'customer@creed.com',
            discordUsername: discordUsername || null,
            items: pricing.items,
            discountCode: pricing.discountCode || null,
            discountPercent: pricing.discountPercent,
            discountAmount: pricing.discountAmount,
            subtotal: pricing.subtotal,
            paymentMethod: paymentMethod,
            createdAt: new Date().toISOString(),
            paidAt: null
        };

        // Save order to Supabase
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('orders')
            .insert({
                id: order.id,
                session_id: order.sessionId,
                status: 'pending',
                amount: order.amount,
                currency: order.currency,
                customer_email: order.customerEmail,
                discord_username: order.discordUsername,
                referral_code: cleanReferral,
                items: order.items,
                created_at: order.createdAt,
                paid_at: null
            })
            .select();

        if (error) {
            console.error('Failed to save order:', error);
            return res.status(500).json({ 
                error: 'Failed to create order',
                details: error.message 
            });
        }

        let ltcPayment = null;
        if (paymentMethod === 'ltc') {
            try {
                ltcPayment = await createLtcQuote(supabase, orderId, finalTotal);
            } catch (quoteError) {
                await supabase.from('orders').delete().eq('id', orderId);
                console.error('LTC quote creation failed:', quoteError.message);
                return res.status(503).json({ error: 'Litecoin checkout is temporarily unavailable. Please try again.' });
            }
        }

        console.log('Manual payment order created:', orderId);

        // Return order data
        return res.status(200).json({
            success: true,
            orderId: orderId,
            sessionId: sessionId,
            paymentMethod: paymentMethod,
            amount: order.amount,
            currency: order.currency,
            ltcPayment
        });

    } catch (error) {
        console.error('Manual payment creation error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}
