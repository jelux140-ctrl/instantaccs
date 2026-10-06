/* =========================================
   CREED - ORDER MANAGEMENT API
   Update order status and delete orders
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

// Verify admin token
const verifyAdminToken = (token) => {
    const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
    return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
};

export default async function handler(req, res) {
    // Verify admin token
    const token = (req.headers.authorization || req.headers['x-creed-staff-token'] || '').replace(/^Bearer\s+/i, '');
    if (!token || !verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method === 'PATCH') {
        // Update order status
        try {
            const { orderId, status } = req.body;

            if (!orderId || !status) {
                return res.status(400).json({ error: 'Order ID and status are required' });
            }

            // Validate status
            const validStatuses = ['pending', 'completed', 'failed', 'cancelled', 'refunded'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
            }

            const supabase = getSupabaseClient();

            // Update order status
            const { data, error } = await supabase
                .from('orders')
                .update({ 
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId)
                .select();

            if (error) {
                console.error('Supabase error:', error);
                return res.status(500).json({ 
                    error: 'Failed to update order',
                    details: error.message 
                });
            }

            if (!data || data.length === 0) {
                return res.status(404).json({ error: 'Order not found' });
            }

            return res.status(200).json({ 
                success: true,
                order: {
                    id: data[0].id,
                    status: data[0].status,
                    sessionId: data[0].session_id,
                    customerEmail: data[0].customer_email,
                    discordUsername: data[0].discord_username,
                    items: data[0].items,
                    createdAt: data[0].created_at,
                    paidAt: data[0].paid_at
                }
            });
        } catch (error) {
            console.error('Error updating order:', error);
            return res.status(500).json({ 
                error: 'Failed to update order',
                message: error.message 
            });
        }
    } else if (req.method === 'DELETE') {
        // Delete order
        try {
            const { orderId } = req.query;

            if (!orderId) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            const supabase = getSupabaseClient();

            // Delete order
            const { error } = await supabase
                .from('orders')
                .delete()
                .eq('id', orderId);

            if (error) {
                console.error('Supabase error:', error);
                return res.status(500).json({ 
                    error: 'Failed to delete order',
                    details: error.message 
                });
            }

            return res.status(200).json({ 
                success: true,
                message: 'Order deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting order:', error);
            return res.status(500).json({ 
                error: 'Failed to delete order',
                message: error.message 
            });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
