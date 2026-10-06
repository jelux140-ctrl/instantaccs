/* =========================================
   CREED — Exchange order id (or legacy session id) for portal token
   POST { order_id } — completed orders (or paid session we can verify)
   ========================================= */

import { randomBytes } from 'node:crypto';
import { getSupabase, getStripe, issuePortalToken, sanitizeOrderForClient, sha256Hex } from './lib-portal.js';
import { guardPublicPost, originAllowed } from './lib-abuse-guard.js';
import { notifySaleFromRow } from './lib-sales-notify.js';

async function assignedKeysFor(supabase, orderId) {
    const { data } = await supabase.from('order_license_assignments').select('license_keys!inner(product_id,key_value)').eq('order_id', orderId);
    return (data || []).map((a) => ({ product_id: a.license_keys.product_id, key: a.license_keys.key_value }));
}

async function exchangeEmailClaim(supabase, rawToken) {
    const hash = sha256Hex(String(rawToken || '').trim());
    const { data: claim } = await supabase.from('portal_email_claims').select('*').eq('token_hash', hash).is('used_at', null).maybeSingle();
    if (!claim || new Date(claim.expires_at) <= new Date()) return null;
    const { data: consumed } = await supabase.from('portal_email_claims').update({ used_at: new Date().toISOString() }).eq('id', claim.id).is('used_at', null).select('order_id').maybeSingle();
    if (!consumed) return null;
    const { data: order } = await supabase.from('orders').select('*').eq('id', claim.order_id).eq('status', 'completed').maybeSingle();
    if (!order) return null;
    const portal = await issuePortalToken(supabase, order.id);
    return { order, ...portal, assignedKeys: await assignedKeysFor(supabase, order.id) };
}

async function sendPortalAccessEmail(order, link) {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    const from = String(process.env.RESEND_FROM_EMAIL || '').trim();
    if (!apiKey || !from || !order.customer_email) throw new Error('Secure email access is unavailable');
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: `Creed Security <${from}>`, to: [order.customer_email],
            subject: 'Your secure Creed portal link',
            text: `A secure portal link was requested for order ${order.id}. Open it here: ${link}\n\nThis one-time link expires in 15 minutes. If you did not request it, ignore this email.`,
            html: `<div style="background:#080a0d;color:#f5f5f5;font-family:Arial,sans-serif;padding:36px"><div style="max-width:560px;margin:auto;background:#10141a;border:1px solid #303844;border-radius:14px;padding:30px"><div style="color:#ffb800;font-size:12px;font-weight:800;letter-spacing:2px">CREED SECURITY</div><h1 style="font-size:25px">Secure portal access</h1><p style="color:#b3bac4;line-height:1.65">Use the button below to access your order, downloads, keys, and support. This one-time link expires in 15 minutes.</p><a href="${link}" style="display:block;margin:26px 0;padding:15px;text-align:center;background:#ffb800;color:#080808;text-decoration:none;border-radius:9px;font-weight:800">Open secure portal</a><p style="color:#77808c;font-size:12px">If you did not request this link, ignore this email. Your order remains protected.</p></div></div>`
        })
    });
    if (!response.ok) throw new Error('Could not send secure access email');
}

function cors(req, res) {
    if (originAllowed(req) && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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

function normalizeKey(raw) {
    return String(raw || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/^\s+|\s+$/g, '')
        .replace(/^["'«»]+|["'«»]+$/g, '')
        .trim();
}

function looksLikeStripeSession(s) {
    return /^cs_(live|test)_[a-zA-Z0-9]+$/.test(s);
}

export default async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = getSupabase();
        const guard = await guardPublicPost(req, supabase, {
            bucket: 'portal-email-claim',
            max: 20,
            windowSec: 3600,
        });
        if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

        const body = parseJsonBody(req);
        const claimToken = typeof body.claim_token === 'string' ? body.claim_token : '';
        if (claimToken) {
            const result = await exchangeEmailClaim(supabase, claimToken);
            if (!result) return res.status(401).json({ error: 'This access link is invalid, expired, or already used.' });
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json({ ok: true, portal_token: result.rawToken, expires_at: result.expires_at, order: sanitizeOrderForClient(result.order), assigned_keys: result.assignedKeys });
        }
        const raw =
            (typeof body.order_id === 'string' && body.order_id) ||
            (typeof body.orderId === 'string' && body.orderId) ||
            '';
        let key = normalizeKey(raw);
        if (!key || key.length < 6) {
            return res.status(400).json({ error: 'Enter your order id from the success page or receipt.' });
        }
        if (!/^[\w.-]+$/.test(key)) {
            return res.status(400).json({ error: 'That value contains invalid characters. Paste your order id only.' });
        }
        if (key.startsWith('op_')) {
            return res.status(400).json({
                error: 'Paste your order id here. (Access links with a long code belong in the address bar.)',
            });
        }

        let order = null;

        /* 1) Stripe session id → row by session_id */
        if (looksLikeStripeSession(key)) {
            const { data: bySession, error: e1 } = await supabase
                .from('orders')
                .select('*')
                .eq('session_id', key)
                .maybeSingle();
            if (e1) throw e1;
            order = bySession;
        }

        /* 2) Creed order id */
        if (!order) {
            const { data: byId, error: e2 } = await supabase.from('orders').select('*').eq('id', key).maybeSingle();
            if (e2) throw e2;
            order = byId;
        }

        /* 3) Stripe API: same account as STRIPE_SECRET_KEY — find order via metadata or confirm session */
        if (!order && looksLikeStripeSession(key)) {
            try {
                const stripe = getStripe();
                const session = await stripe.checkout.sessions.retrieve(key);
                if (session.payment_status !== 'paid') {
                    return res.status(403).json({
                        error: 'This checkout session is not paid yet.',
                    });
                }
                const metaId = session.metadata?.order_id;
                if (metaId) {
                    const { data: byMeta } = await supabase.from('orders').select('*').eq('id', metaId).maybeSingle();
                    order = byMeta;
                }
                if (!order) {
                    const { data: bySess2 } = await supabase
                        .from('orders')
                        .select('*')
                        .eq('session_id', key)
                        .maybeSingle();
                    order = bySess2;
                }
            } catch (err) {
                console.error('portal-claim-by-order stripe:', err.message);
            }
        }

        if (!order) {
            return res.status(200).json({ ok: true, email_sent: true, message: 'If this is a valid completed order, a secure one-time link has been sent to the customer email.' });
        }

        /* Paid but webhook slow: mark completed if Stripe says paid */
        if (order.status !== 'completed' && looksLikeStripeSession(key)) {
            try {
                const stripe = getStripe();
                const session = await stripe.checkout.sessions.retrieve(key);
                if (session.payment_status === 'paid') {
                    const paidAt = new Date().toISOString();
                    await supabase
                        .from('orders')
                        .update({ status: 'completed', paid_at: paidAt })
                        .eq('id', order.id);
                    order = { ...order, status: 'completed', paid_at: paidAt };
                    notifySaleFromRow(order, 'stripe').catch(() => {});
                }
            } catch (_) {
                /* ignore */
            }
        }

        if (order.status !== 'completed') {
            return res.status(200).json({ ok: true, email_sent: true, message: 'If this is a valid completed order, a secure one-time link has been sent to the customer email.' });
        }

        // An Order ID is an identifier, not a password. Never return customer
        // data, keys, or a portal token here. Prove inbox ownership instead.
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count } = await supabase.from('portal_email_claims').select('*', { count: 'exact', head: true }).eq('order_id', order.id).gte('created_at', fiveMinutesAgo);
        if (!count) {
            const rawClaim = `pc_${randomBytes(32).toString('hex')}`;
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            const { error: insertError } = await supabase.from('portal_email_claims').insert({ order_id: order.id, token_hash: sha256Hex(rawClaim), expires_at: expiresAt });
            if (insertError) throw insertError;
            const portalBase = String(process.env.PORTAL_PUBLIC_URL || 'https://portal.creedv2.com').replace(/\/$/, '');
            await sendPortalAccessEmail(order, `${portalBase}/?claim=${encodeURIComponent(rawClaim)}`);
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ ok: true, email_sent: true, message: 'If this is a valid completed order, a secure one-time link has been sent to the customer email.' });
    } catch (e) {
        console.error('portal-claim-by-order:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
