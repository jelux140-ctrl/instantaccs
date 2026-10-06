/* =========================================
   CREED - SYNC ORDERS FROM STRIPE
   Manually sync pending orders from Stripe to update their status
   ========================================= */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { notifySaleFromRow } from './lib-sales-notify.js';

// Initialize Supabase client
const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(supabaseUrl, supabaseKey);
};

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simple authentication check
    const authToken = req.headers.authorization || req.body?.token;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

    if (!ADMIN_TOKEN || (authToken !== `Bearer ${ADMIN_TOKEN}` && authToken !== ADMIN_TOKEN)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get Stripe API credentials
        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

        if (!STRIPE_SECRET_KEY) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }

        // Initialize Stripe
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
            apiVersion: '2024-11-20.acacia',
        });

        // Get Supabase client
        const supabase = getSupabaseClient();

        // Get all pending orders from database
        const { data: pendingOrders, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'pending')
            .not('session_id', 'is', null);

        if (fetchError) {
            console.error('Error fetching pending orders:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch orders', details: fetchError.message });
        }

        console.log(`Found ${pendingOrders?.length || 0} pending orders to sync`);

        const updated = [];
        const errors = [];

        // Check each pending order with Stripe
        for (const order of pendingOrders || []) {
            try {
                // Skip if session_id doesn't look like a Stripe session ID
                if (!order.session_id || !order.session_id.startsWith('cs_')) {
                    console.log(`Skipping order ${order.id} - invalid session_id: ${order.session_id}`);
                    continue;
                }

                // Retrieve checkout session from Stripe
                const session = await stripe.checkout.sessions.retrieve(order.session_id);

                // Check if payment is completed
                if (session.payment_status === 'paid') {
                    // Update order status to completed
                    const { error: updateError } = await supabase
                        .from('orders')
                        .update({
                            status: 'completed',
                            paid_at: new Date().toISOString(),
                            amount: session.amount_total ? (session.amount_total / 100).toFixed(2) : order.amount,
                            currency: session.currency?.toUpperCase() || order.currency || 'USD',
                            customer_email: session.customer_email || session.customer_details?.email || order.customer_email,
                            discord_username: session.metadata?.discord_username || order.discord_username
                        })
                        .eq('id', order.id);

                    if (updateError) {
                        console.error(`Failed to update order ${order.id}:`, updateError);
                        errors.push({ orderId: order.id, error: updateError.message });
                    } else {
                        console.log(`Updated order ${order.id} to completed`);
                        updated.push(order.id);
                        notifySaleFromRow(
                            {
                                ...order,
                                status: 'completed',
                                amount: session.amount_total ? (session.amount_total / 100).toFixed(2) : order.amount,
                                currency: session.currency?.toUpperCase() || order.currency || 'USD',
                                customer_email: session.customer_email || session.customer_details?.email || order.customer_email,
                            },
                            'stripe',
                        ).catch(() => {});
                    }
                } else {
                    console.log(`Order ${order.id} still pending - payment status: ${session.payment_status}`);
                }
            } catch (err) {
                console.error(`Error processing order ${order.id}:`, err.message);
                errors.push({ orderId: order.id, error: err.message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Synced ${updated.length} orders`,
            updated: updated,
            errors: errors,
            totalPending: pendingOrders?.length || 0
        });

    } catch (error) {
        console.error('Sync error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}
