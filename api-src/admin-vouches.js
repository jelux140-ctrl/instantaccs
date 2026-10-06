/* =========================================
   CREED — Admin Vouches Management
   GET list | DELETE vouch by ID
   ========================================= */

import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Admin auth check
    const authHeader = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    const token = authHeader?.replace(/^Bearer\s+/i, '') || authHeader;
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabase();

    // GET - List all vouches
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('vouches')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return res.status(200).json({ vouches: data || [] });
        } catch (e) {
            console.error('admin-vouches GET error:', e);
            return res.status(500).json({ error: e.message });
        }
    }

    // DELETE - Delete a vouch by ID
    if (req.method === 'DELETE') {
        try {
            const id = req.query.id || req.body?.id;
            if (!id) {
                return res.status(400).json({ error: 'Vouch ID required' });
            }

            const { error } = await supabase
                .from('vouches')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return res.status(200).json({ ok: true, message: 'Vouch deleted' });
        } catch (e) {
            console.error('admin-vouches DELETE error:', e);
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
