/* =========================================
   CREED — Portal session: order summary (Bearer portal token)
   ========================================= */

import { getSupabase, verifyPortalToken, parseBearer, sanitizeOrderForClient } from './lib-portal.js';

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
        const raw = parseBearer(req);
        if (!raw) return res.status(401).json({ error: 'Portal token required' });

        const supabase = getSupabase();
        const session = await verifyPortalToken(supabase, raw);
        if (!session) return res.status(401).json({ error: 'Invalid or expired portal token' });

        let ticketsCount = 0;
        const { count, error: countErr } = await supabase
            .from('portal_tickets')
            .select('*', { count: 'exact', head: true })
            .eq('order_id', session.order.id);
        if (countErr) {
            console.error('portal-me portal_tickets count:', countErr.message);
        } else {
            ticketsCount = count ?? 0;
        }

        return res.status(200).json({
            ok: true,
            order: sanitizeOrderForClient(session.order),
            tickets_count: ticketsCount,
            expires_at: session.tokenRow.expires_at,
        });
    } catch (e) {
        console.error('portal-me:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
