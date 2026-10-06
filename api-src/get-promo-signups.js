/* =========================================
   CREED - GET PROMO SIGNUPS API
   Fetches promo popup email signups for admin dashboard
   ========================================= */

import { createClient } from '@supabase/supabase-js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(supabaseUrl, supabaseKey);
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authToken = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
    const ANALYTICS_TOKEN = String(
        process.env.ANALYTICS_READ_TOKEN || process.env.CREED_ADMIN_TOKEN || '',
    ).trim();
    const supplied = String(authToken || '').replace(/^Bearer\s+/i, '').trim();
    const allowed =
        (ADMIN_TOKEN && supplied === ADMIN_TOKEN) ||
        (ANALYTICS_TOKEN && supplied === ANALYTICS_TOKEN);
    if (!allowed) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const supabase = getSupabaseClient();

        const allRows = [];
        const pageSize = 1000;
        let from = 0;

        while (true) {
            const { data, error } = await supabase
                .from('promo_signups')
                .select('id, email, created_at')
                .order('created_at', { ascending: false })
                .range(from, from + pageSize - 1);

            if (error) {
                console.error('Supabase error:', error);
                return res.status(500).json({
                    error: 'Failed to fetch promo signups',
                    details: error.message
                });
            }

            allRows.push(...(data || []));
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }

        return res.status(200).json({
            signups: allRows.map(s => ({
                id: s.id,
                email: s.email,
                createdAt: s.created_at
            })),
            total: allRows.length
        });
    } catch (error) {
        console.error('Error fetching promo signups:', error);
        return res.status(500).json({
            error: 'Failed to fetch promo signups',
            message: error.message
        });
    }
}
