/* =========================================
   CREED — Admin: list / update portal tickets
   GET (all tickets, optional ?status=open|closed|claimed)
   PATCH { id, status: 'open' | 'closed' | 'claimed' }
   — Cannot reopen a ticket that was marked "claimed"
   ========================================= */

import { getSupabase, verifyAdminRequest } from './lib-portal.js';

function parseJsonBody(req) {
    const b = req.body;
    if (b == null) return {};
    if (typeof b === 'string') {
        try {
            return JSON.parse(b);
        } catch {
            return {};
        }
    }
    if (typeof b === 'object') return b;
    return {};
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Creed-Staff-Token');
}

const ALLOWED = new Set(['open', 'closed', 'claimed']);

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (!verifyAdminRequest(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabase();

    try {
        if (req.method === 'GET') {
            const status = typeof req.query?.status === 'string' ? req.query.status : null;
            let q = supabase
                .from('portal_tickets')
                .select('id, order_id, subject, status, created_at, updated_at')
                .order('updated_at', { ascending: false })
                .limit(200);

            if (status === 'open' || status === 'closed' || status === 'claimed') {
                q = q.eq('status', status);
            }

            const { data, error } = await q;
            if (error) throw error;
            return res.status(200).json({ ok: true, tickets: data || [] });
        }

        if (req.method === 'PATCH') {
            const body = parseJsonBody(req);
            const id = typeof body.id === 'string' ? body.id : '';
            const status = body.status;
            if (!id) return res.status(400).json({ error: 'id required' });
            if (!ALLOWED.has(status)) {
                return res.status(400).json({ error: 'status must be open, closed, or claimed' });
            }

            const { data: cur, error: curErr } = await supabase
                .from('portal_tickets')
                .select('id, status')
                .eq('id', id)
                .maybeSingle();

            if (curErr) throw curErr;
            if (!cur) return res.status(404).json({ error: 'Ticket not found' });

            if (cur.status === 'claimed' && status === 'open') {
                return res.status(403).json({
                    error: 'Tickets marked “order claimed” cannot be reopened.',
                });
            }

            const { data, error } = await supabase
                .from('portal_tickets')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, ticket: data });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('admin-portal-tickets:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
