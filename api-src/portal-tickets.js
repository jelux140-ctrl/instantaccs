/* =========================================
   CREED — List / create tickets (Bearer portal token; scoped to paid order)
   GET | POST { subject }
   ========================================= */

import { getSupabase, verifyPortalToken, parseBearer } from './lib-portal.js';

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const MAX_OPEN_TICKETS = 5;

export default async function handler(req, res) {
    console.log('>>> portal-tickets.js handler START', req.method, req.url, req.headers['user-agent']?.slice(0, 50));
    try {
        cors(res);
        if (req.method === 'OPTIONS') return res.status(204).end();

        const raw = parseBearer(req);
        if (!raw) return res.status(401).json({ error: 'Portal token required' });

        const supabase = getSupabase();
        const session = await verifyPortalToken(supabase, raw);
        if (!session) return res.status(401).json({ error: 'Invalid or expired portal token' });

        const orderId = session.order.id;

        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('portal_tickets')
                .select('id, subject, status, created_at, updated_at')
                .eq('order_id', orderId)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return res.status(200).json({ ok: true, tickets: data || [] });
        }

        if (req.method === 'POST') {
            const body = parseJsonBody(req);
            const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
            if (subject.length < 3 || subject.length > 200) {
                return res.status(400).json({ error: 'Subject must be 3–200 characters' });
            }

            const { count: openCount } = await supabase
                .from('portal_tickets')
                .select('*', { count: 'exact', head: true })
                .eq('order_id', orderId)
                .eq('status', 'open');

            if ((openCount || 0) >= MAX_OPEN_TICKETS) {
                return res.status(429).json({
                    error: `Too many open tickets for this order (max ${MAX_OPEN_TICKETS}). Close one or wait for support.`,
                });
            }

            const { data: ticket, error } = await supabase
                .from('portal_tickets')
                .insert({
                    order_id: orderId,
                    subject,
                    status: 'open',
                })
                .select('id, subject, status, created_at, updated_at')
                .single();

            if (error) throw error;

            const firstMsg = typeof body.message === 'string' ? body.message.trim() : '';
            if (firstMsg.length >= 1) {
                const msgBody = firstMsg.slice(0, 8000);
                await supabase.from('portal_messages').insert({
                    ticket_id: ticket.id,
                    author_role: 'customer',
                    body: msgBody,
                });
                await supabase
                    .from('portal_tickets')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', ticket.id);
            }

            return res.status(201).json({ ok: true, ticket });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('portal-tickets:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
