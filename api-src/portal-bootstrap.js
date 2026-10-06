/* =========================================
   CREED — Issue portal token after Stripe-verified payment
   POST { session_id } — raw token returned once; store client-side or use magic link.
   ========================================= */

import { getSupabase, getStripe, issuePortalToken, sanitizeOrderForClient } from './lib-portal.js';
import { sendOrderPaidEmailsOnce } from './lib-order-emails.js';
import { notifySaleFromRow } from './lib-sales-notify.js';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const sessionId =
            (typeof req.body?.session_id === 'string' && req.body.session_id) ||
            (typeof req.body?.sessionId === 'string' && req.body.sessionId) ||
            '';

        if (!sessionId || !sessionId.startsWith('cs_')) {
            return res.status(400).json({ error: 'Valid Stripe session_id (cs_...) required' });
        }

        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== 'paid') {
            return res.status(402).json({ error: 'Payment not completed', status: session.payment_status });
        }

        let pingSale = false;
        // This endpoint exists only for the immediate post-checkout handoff.
        // Historical Stripe session IDs may have been copied in the prior DB
        // breach and must not remain reusable as permanent login credentials.
        const sessionAgeMs = Date.now() - Number(session.created || 0) * 1000;
        if (!session.created || sessionAgeMs < 0 || sessionAgeMs > 2 * 60 * 60 * 1000) {
            return res.status(403).json({ error: 'This checkout handoff has expired. Request a secure email link from the portal.' });
        }

        const metaOrderId = session.metadata?.order_id || null;
        const supabase = getSupabase();

        let { data: order, error: findErr } = await supabase.from('orders').select('*').eq('session_id', sessionId).maybeSingle();

        if (findErr) throw findErr;

        if (!order && metaOrderId) {
            const r = await supabase.from('orders').select('*').eq('id', metaOrderId).maybeSingle();
            order = r.data;
        }

        /* Paid session but no row yet (webhook delayed / partner checkout) — create from Stripe metadata */
        if (!order && session.payment_status === 'paid') {
            let items = [];
            try {
                if (session.metadata?.order_items) items = JSON.parse(session.metadata.order_items);
            } catch (_) {
                /* keep */
            }
            if (!Array.isArray(items)) items = [];
            const oid = metaOrderId || `creed_${Date.now()}`;
            const row = {
                id: oid,
                session_id: sessionId,
                status: 'completed',
                amount: session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00',
                currency: (session.currency || 'usd').toUpperCase(),
                customer_email: session.customer_email || session.customer_details?.email || null,
                discord_username: session.metadata?.discord_username || null,
                items,
                created_at: session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString(),
                paid_at: new Date().toISOString(),
            };
            const { error: insErr } = await supabase.from('orders').insert(row);
            if (insErr) {
                console.error('portal-bootstrap insert:', insErr.message);
            } else {
                pingSale = true;
            }
            const { data: bySess } = await supabase.from('orders').select('*').eq('session_id', sessionId).maybeSingle();
            order = bySess;
            if (!order) {
                const { data: byOid } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
                order = byOid;
            }
        }

        if (!order) {
            return res.status(404).json({
                error: 'Order not found yet',
                hint:
                    'Creed could not read this session from Stripe or save your order. Use the same STRIPE_SECRET_KEY as checkout, or wait for the webhook. Refresh in a few seconds.',
            });
        }

        if (metaOrderId && order.id !== metaOrderId) {
            return res.status(400).json({ error: 'Checkout session does not match stored order' });
        }

        if (order.status !== 'completed') {
            let items = order.items;
            try {
                if (session.metadata?.order_items) items = JSON.parse(session.metadata.order_items);
            } catch (_) {
                /* keep */
            }
            const { error: upErr } = await supabase
                .from('orders')
                .update({
                    status: 'completed',
                    paid_at: new Date().toISOString(),
                    amount: session.amount_total ? (session.amount_total / 100).toFixed(2) : order.amount,
                    currency: (session.currency || order.currency || 'usd').toUpperCase(),
                    customer_email: session.customer_email || session.customer_details?.email || order.customer_email,
                    discord_username: session.metadata?.discord_username || order.discord_username,
                    items: items || order.items,
                })
                .eq('id', order.id);

            if (upErr) throw upErr;
            pingSale = true;

            const refetch = await supabase.from('orders').select('*').eq('id', order.id).single();
            order = refetch.data;
        }

        if (!order || order.status !== 'completed') {
            return res.status(409).json({ error: 'Order could not be confirmed as paid' });
        }

        try {
            await sendOrderPaidEmailsOnce(supabase, order);
        } catch (e) {
            console.error('portal-bootstrap order emails:', e);
        }

        if (pingSale) {
            notifySaleFromRow(order, 'stripe').catch(() => {});
        }

        const { rawToken, expires_at } = await issuePortalToken(supabase, order.id);

        // proxy headers can be comma-joined — take the first value only
        const firstVal = (v) => String(v || '').split(',')[0].trim();
        const rawProto = firstVal(req.headers['x-forwarded-proto']);
        const proto = /^https?$/i.test(rawProto) ? rawProto : 'https';
        const host = (firstVal(req.headers['x-forwarded-host']) || firstVal(req.headers.host) || '')
            .replace(/^https?:\/\//i, '');
        const defaultBase = host ? `${proto}://${host}` : 'https://creedv2.com';
        const base = (process.env.PORTAL_PUBLIC_URL || defaultBase).replace(/\/$/, '');
        let portalEntry = '/portal';
        try {
            const u = new URL(base);
            if (u.hostname.toLowerCase().startsWith('portal.')) {
                portalEntry = '/';
            }
        } catch (_) {
            /* keep /portal */
        }
        const portal_url =
            portalEntry === '/'
                ? `${base}/?t=${encodeURIComponent(rawToken)}`
                : `${base}/portal?t=${encodeURIComponent(rawToken)}`;

        return res.status(200).json({
            ok: true,
            portal_token: rawToken,
            expires_at,
            portal_url,
            order: sanitizeOrderForClient(order),
        });
    } catch (e) {
        console.error('portal-bootstrap:', e);
        return res.status(400).json({ error: 'Unable to verify this payment session' });
    }
}
