/* =========================================
   CREED - STRIPE PAYMENT API
   ========================================= */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { guardPublicPost } from './lib-abuse-guard.js';

import { calculateServerPricing } from './lib-pricing.js';

/**
 * Base URL used for Stripe success/cancel redirects.
 * Prefers the configured STORE_URL: the Origin/Host headers are
 * caller-controlled, and trusting them would let someone point a checkout's
 * success_url at a site they own. Headers are only a fallback for local dev.
 */
function resolveBaseUrl(req) {
    const configured = String(process.env.STORE_URL || '').trim().replace(/\/$/, '');
    if (configured) return configured;

    const origin = req.headers.origin || req.headers.host || '';
    if (!origin) return 'https://www.creedv2.com';
    return origin.startsWith('http') ? origin.replace(/\/$/, '') : `https://${origin}`;
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const abuseDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const guard = await guardPublicPost(req, abuseDb, { bucket: 'legacy-card-checkout', max: 10, windowSec: 3600 });
        if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
        const { items, discountCode, userEmail, discordUsername, referralCode } = req.body;
        const cleanReferral = String(referralCode || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || null;

        // Validate request
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid cart items' });
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

        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        if (!STRIPE_SECRET_KEY) {
            console.error('Stripe secret key not configured');
            return res.status(500).json({ error: 'Payment service not configured' });
        }

        // Initialize Stripe
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
            apiVersion: '2024-11-20.acacia',
        });

        // Get base URL for redirects
        const baseUrl = resolveBaseUrl(req);

        const discountMultiplier = pricing.discountPercent > 0 ? (1 - pricing.discountPercent / 100) : 1;
        
        // Prepare line items for Stripe checkout session
        // Stripe uses amounts in cents, so multiply by 100
        // If discount is applied, adjust prices proportionally so lineItems sum matches discounted total
        const lineItems = pricing.items.map(item => {
            const itemSubtotal = parseFloat(item.price) * item.quantity;
            const discountedItemPrice = (itemSubtotal * discountMultiplier) / item.quantity;
            
            return {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: pricing.discountCode 
                            ? `${item.name} - ${item.variant} (${pricing.discountCode} applied)`
                            : `${item.name} - ${item.variant}`,
                        description: `${item.name} ${item.variant} license`,
                    },
                    unit_amount: Math.round(discountedItemPrice * 100), // Convert to cents
                },
                quantity: item.quantity,
            };
        });
        
        // Verify lineItems sum matches finalTotal (with rounding tolerance)
        const lineItemsSum = lineItems.reduce((sum, item) => {
            return sum + (item.price_data.unit_amount * item.quantity);
        }, 0);
        const finalTotalCents = Math.round(finalTotal * 100);
        const difference = Math.abs(lineItemsSum - finalTotalCents);
        
        // If there's a rounding difference, adjust the last item slightly
        if (difference > 0 && lineItems.length > 0) {
            const adjustment = finalTotalCents - lineItemsSum;
            const lastItem = lineItems[lineItems.length - 1];
            lastItem.price_data.unit_amount = lastItem.price_data.unit_amount + Math.round(adjustment / lastItem.quantity);
        }

        // Create order ID
        const orderId = `creed_${Date.now()}`;

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            // payment_method_types intentionally OMITTED so Stripe serves every
            // method enabled in the Dashboard that suits the currency/buyer.
            // Do NOT add automatic_payment_methods here - it is a PaymentIntent
            // parameter and Checkout Sessions reject it outright.
            // NOTE: this endpoint is currently unused; the live cart checks out
            // through DigitalVault's /api/create-checkout.
            line_items: lineItems,
            mode: 'payment',
            success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/products`,
            customer_email: userEmail || undefined,
            metadata: {
                order_id: orderId,
                order_items: JSON.stringify(pricing.items.map(i => ({
                    id: i.id, name: i.name, variant: i.variant,
                    price: i.price, quantity: i.quantity
                }))),
                timestamp: new Date().toISOString(),
                discount_code: pricing.discountCode || '',
                discount_percent: pricing.discountPercent.toString(),
                discount_amount: pricing.discountAmount.toString(),
                subtotal: pricing.subtotal.toString(),
                discord_username: discordUsername || '',
                referral_code: cleanReferral || '',
            },
        });

        // Extract session ID
        const sessionId = session.id;

        // Create order record (will be updated when payment completes via webhook)
        const order = {
            id: orderId,
            sessionId: sessionId,
            status: 'pending',
            amount: finalTotal.toFixed(2),
            currency: 'USD',
            customerEmail: userEmail || 'customer@creed.com',
            discordUsername: discordUsername || null,
            referralCode: cleanReferral,
            items: pricing.items,
            discountCode: pricing.discountCode || null,
            discountPercent: pricing.discountPercent,
            discountAmount: pricing.discountAmount,
            subtotal: pricing.subtotal,
            createdAt: new Date().toISOString(),
            paidAt: null
        };

        // Save order to Supabase directly (synchronously to ensure it's saved)
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && supabaseKey) {
                const supabase = createClient(supabaseUrl, supabaseKey);
                
                const { error: insertError, data: insertedData } = await supabase
                    .from('orders')
                    .insert({
                        id: order.id,
                        session_id: order.sessionId,
                        status: order.status,
                        amount: order.amount,
                        currency: order.currency,
                        customer_email: order.customerEmail,
                        discord_username: order.discordUsername,
                        referral_code: order.referralCode,
                        items: order.items,
                        created_at: order.createdAt,
                        paid_at: order.paidAt
                    })
                    .select();

                if (insertError) {
                    console.error('Failed to save order to Supabase:', insertError);
                    // Fallback to API endpoint
                    await fetch(`${baseUrl}/api/save-order`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.ADMIN_TOKEN || ''}`,
                        },
                        body: JSON.stringify(order)
                    }).catch(err => console.error('Failed to save order via API:', err));
                } else {
                    console.log('Order saved successfully to Supabase:', orderId, insertedData);
                }
            } else {
                console.warn('Supabase not configured, using API endpoint');
                // Fallback to API endpoint
                await fetch(`${baseUrl}/api/save-order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.ADMIN_TOKEN || ''}`,
                    },
                    body: JSON.stringify(order)
                }).catch(err => console.error('Failed to save order:', err));
            }
        } catch (saveError) {
            console.error('Error saving order:', saveError);
            // Fallback to API endpoint
            await fetch(`${baseUrl}/api/save-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.ADMIN_TOKEN || ''}`,
                },
                body: JSON.stringify(order)
            }).catch(err => console.error('Failed to save order via API:', err));
        }

        // Return checkout URL and session ID to redirect user
        return res.status(200).json({
            success: true,
            paymentUrl: session.url,
            sessionId: sessionId,
            orderId: orderId
        });

    } catch (error) {
        console.error('Payment creation error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}
