/* =========================================
   CREED — Public portal announcements (no auth)
   ========================================= */

import { getSupabase } from './lib-portal.js';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = getSupabase();
        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('portal_announcements')
            .select('id, title, body, body_format, published_at, created_at')
            .eq('is_published', true)
            .not('published_at', 'is', null)
            .lte('published_at', now)
            .order('published_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return res.status(200).json({ ok: true, announcements: data || [] });
    } catch (e) {
        console.error('portal-announcements:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
