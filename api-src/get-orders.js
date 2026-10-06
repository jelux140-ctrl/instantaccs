/* =========================================
   CREED - GET ORDERS API
   Fetches orders for admin dashboard from Supabase
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
    if (req.method === 'GET') {
        // Simple authentication check
        const authToken = req.headers.authorization || req.headers['x-creed-staff-token'];
        const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
        const DISCORD_BOT_API_TOKEN = String(process.env.DISCORD_BOT_API_TOKEN || '').trim();
        const supplied = String(authToken || '').replace(/^Bearer\s+/i, '').trim();
        const isAdmin = Boolean(ADMIN_TOKEN) && supplied === ADMIN_TOKEN;
        const isDiscordBot = Boolean(DISCORD_BOT_API_TOKEN) && supplied === DISCORD_BOT_API_TOKEN;

        if (!isAdmin && !isDiscordBot) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const { search } = req.query;
            
            const supabase = getSupabaseClient();
            const PAGE_SIZE = 1000; // Supabase max per request
            let allOrders = [];
            let offset = 0;
            let totalCount = 0;

            // Fetch ALL orders with pagination (Supabase limits to 1000 per request)
            while (true) {
                let query = supabase
                    .from('orders')
                    .select('*', { count: offset === 0 ? 'exact' : undefined })
                    .order('created_at', { ascending: false });

                // Filter by email when searching (case-insensitive partial match)
                if (search && search.trim()) {
                    query = query.ilike('customer_email', `%${search.trim()}%`);
                }

                query = query.range(offset, offset + PAGE_SIZE - 1);
                const { data: pageOrders, error, count } = await query;

                if (error) {
                    console.error('Supabase error:', error);
                    return res.status(500).json({ 
                        error: 'Failed to fetch orders',
                        details: error.message 
                    });
                }

                if (offset === 0 && count != null) {
                    totalCount = count;
                }
                allOrders = allOrders.concat(pageOrders || []);

                if (!pageOrders || pageOrders.length < PAGE_SIZE) break;
                offset += PAGE_SIZE;
            }

            // Transform data to match expected format
            const transformedOrders = allOrders.map(order => ({
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
                total: totalCount || transformedOrders.length,
                search: search || null
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
