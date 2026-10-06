/* =========================================
   CREED - ORDER STORAGE API
   Stores orders in Supabase database
   ========================================= */

import { createClient } from '@supabase/supabase-js';

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
    const configuredAdmin = String(process.env.ADMIN_TOKEN || '').trim();
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!configuredAdmin || supplied !== configuredAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.method === 'POST') {
        // Save new order
        try {
            const order = req.body;
            
            // Validate order
            if (!order.id || !order.items || !order.amount) {
                return res.status(400).json({ error: 'Invalid order data' });
            }

            // Ensure session_id is not null/undefined (required by schema)
            // Use order ID as fallback if sessionId is missing
            const sessionId = order.sessionId || order.id || `session_${order.id}`;

            const supabase = getSupabaseClient();

            // Insert order into Supabase
            const { data, error } = await supabase
                .from('orders')
                .insert({
                    id: order.id,
                    session_id: sessionId,
                    // This legacy storage endpoint may create pending rows only.
                    // Payment completion is exclusively webhook/Stripe verified.
                    status: 'pending',
                    amount: order.amount,
                    currency: order.currency || 'GBP',
                    customer_email: order.customerEmail,
                    discord_username: order.discordUsername || null,
                    referral_code: order.referralCode || null,
                    items: order.items, // JSONB column
                    created_at: order.createdAt || new Date().toISOString(),
                    paid_at: null
                })
                .select();

            if (error) {
                console.error('Supabase error:', error);
                return res.status(500).json({ 
                    error: 'Failed to save order',
                    details: error.message 
                });
            }

            return res.status(200).json({ 
                success: true, 
                orderId: order.id,
                data: data 
            });
        } catch (error) {
            console.error('Error saving order:', error);
            return res.status(500).json({ 
                error: 'Failed to save order',
                message: error.message 
            });
        }
    } else if (req.method === 'GET') {
        // Get all orders (for admin dashboard)
        try {
            const { limit = 100, offset = 0 } = req.query;
            
            const supabase = getSupabaseClient();

            // Get total count
            const { count } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true });

            // Get orders with pagination, ordered by created_at descending
            const { data: orders, error } = await supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false })
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

            if (error) {
                console.error('Supabase error:', error);
                return res.status(500).json({ 
                    error: 'Failed to fetch orders',
                    details: error.message 
                });
            }

            // Transform data to match expected format
            const transformedOrders = orders.map(order => ({
                id: order.id,
                sessionId: order.session_id,
                status: order.status,
                amount: order.amount,
                currency: order.currency,
                customerEmail: order.customer_email,
                discordUsername: order.discord_username,
                items: order.items,
                createdAt: order.created_at,
                paidAt: order.paid_at
            }));

            return res.status(200).json({
                orders: transformedOrders,
                total: count || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (error) {
            console.error('Error fetching orders:', error);
            return res.status(500).json({ 
                error: 'Failed to fetch orders',
                message: error.message 
            });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
