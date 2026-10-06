/* =========================================
   CREED — Ticket messages (customer Bearer portal token, or admin token)
   GET ?ticket_id=  |  POST { ticket_id, body }
   ========================================= */

console.log('portal-messages.js: module loading');

let importError = null;
try {
    var { getSupabase, verifyPortalToken, parseBearer, verifyAdminRequest } = await import('./lib-portal.js');
    var { sendTicketReplyNotificationEmail } = await import('./lib-order-emails.js');
    console.log('portal-messages.js: imports done');
} catch (e) {
    importError = e;
    console.error('portal-messages.js: IMPORT ERROR:', e.message);
}

function parseJsonBody(req) {
    try {
        const b = req.body;
        if (b == null) return {};
        if (typeof b === 'string') {
            try {
                return JSON.parse(b);
            } catch (e) {
                console.log('parseJsonBody: string parse failed, returning {}');
                return {};
            }
        }
        if (typeof b === 'object') return b;
        return {};
    } catch (e) {
        console.log('parseJsonBody: unexpected error', e.message);
        return {};
    }
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Creed-Staff-Token');
}

export default async function handler(req, res) {
    console.log('portal-messages.js: handler called', req.method, req.url);
    if (importError) {
        console.error('portal-messages.js: Cannot handle request due to import error');
        return res.status(500).json({ error: 'Server initialization failed', details: importError.message });
    }
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
        const supabase = getSupabase();
        const isAdmin = verifyAdminRequest(req);

        if (req.method === 'GET') {
            const ticketId = typeof req.query?.ticket_id === 'string' ? req.query.ticket_id : '';
            const after = typeof req.query?.after === 'string' ? req.query.after : '';
            if (!ticketId) return res.status(400).json({ error: 'ticket_id required' });

            const { data: ticket, error: tErr } = await supabase
                .from('portal_tickets')
                .select('id, order_id, status')
                .eq('id', ticketId)
                .maybeSingle();

            if (tErr || !ticket) return res.status(404).json({ error: 'Ticket not found' });

            if (!isAdmin) {
                const raw = parseBearer(req);
                if (!raw) return res.status(401).json({ error: 'Portal token or admin auth required' });
                const session = await verifyPortalToken(supabase, raw);
                if (!session || session.order.id !== ticket.order_id) {
                    return res.status(403).json({ error: 'Forbidden' });
                }
            }

            let messagesQuery = supabase
                .from('portal_messages')
                .select('id, author_role, body, created_at')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
            if (after) messagesQuery = messagesQuery.gt('created_at', after);
            const { data: messages, error } = await messagesQuery;

            if (error) throw error;
            return res.status(200).json({
                ok: true,
                messages: messages || [],
                ticket: { id: ticket.id, status: ticket.status },
            });
        }

        if (req.method === 'POST') {
            // Safely get body - Vercel sometimes parses it, sometimes not
            let jb = {};
            try {
                if (req.body && typeof req.body === 'object') {
                    jb = req.body;
                } else if (req.body && typeof req.body === 'string') {
                    jb = JSON.parse(req.body);
                }
            } catch (e) {
                console.log('POST body parse error:', e.message);
            }
            
            // Also check query params for ticket_id (fallback)
            const ticketId = jb.ticket_id || req.query?.ticket_id || '';
            const body = typeof jb.body === 'string' ? jb.body.trim() : '';
            
            console.log('POST debug:', { ticketId, hasBody: !!body, bodyLength: body.length });
            
            if (!ticketId) return res.status(400).json({ error: 'ticket_id required' });
            if (!body || body.length > 8000) return res.status(400).json({ error: 'body required (max 8000 chars)' });

            const { data: ticket, error: tErr } = await supabase
                .from('portal_tickets')
                .select('id, order_id, status')
                .eq('id', ticketId)
                .maybeSingle();

            if (tErr || !ticket) return res.status(404).json({ error: 'Ticket not found' });
            if (ticket.status === 'claimed') {
                return res.status(400).json({
                    error: 'This order was marked as claimed — the thread is locked.',
                });
            }
            if (ticket.status === 'closed') {
                return res.status(400).json({
                    error: 'Ticket is closed. Staff must reopen it before new messages can be sent.',
                });
            }

            let authorRole = 'customer';

            if (isAdmin) {
                authorRole = 'admin';
            } else {
                const raw = parseBearer(req);
                if (!raw) return res.status(401).json({ error: 'Portal token or admin auth required' });
                const session = await verifyPortalToken(supabase, raw);
                if (!session || session.order.id !== ticket.order_id) {
                    return res.status(403).json({ error: 'Forbidden' });
                }
            }

            const { data: msg, error } = await supabase
                .from('portal_messages')
                .insert({
                    ticket_id: ticketId,
                    author_role: authorRole,
                    body,
                })
                .select('id, author_role, body, created_at')
                .single();

            if (error) throw error;

            await supabase.from('portal_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);

            if (authorRole === 'admin') {
                (async () => {
                    try {
                        const { data: trow } = await supabase
                            .from('portal_tickets')
                            .select('subject, order_id')
                            .eq('id', ticketId)
                            .maybeSingle();
                        if (!trow?.order_id) return;
                        const { data: ord } = await supabase
                            .from('orders')
                            .select('customer_email')
                            .eq('id', trow.order_id)
                            .maybeSingle();
                        await sendTicketReplyNotificationEmail({
                            customerEmail: ord?.customer_email,
                            orderId: trow.order_id,
                            ticketId,
                            ticketSubject: trow.subject,
                            replySnippet: body,
                        });
                    } catch (e) {
                        console.error('portal-messages ticket reply email:', e?.message || e);
                    }
                })();
            }

            return res.status(201).json({ ok: true, message: msg });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('portal-messages ERROR:', e);
        console.error('Stack:', e.stack);
        return res.status(500).json({ error: e.message || 'Failed', stack: e.stack });
    }
}
