/* =========================================
   CREED — Portal helpers (order token hash + verify)
   ========================================= */

import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export function getSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase not configured');
    return createClient(url, key);
}

export function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Stripe not configured');
    return new Stripe(key, { apiVersion: '2024-11-20.acacia' });
}

export function sha256Hex(s) {
    return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function generatePortalTokenRaw() {
    return `op_${randomBytes(32).toString('hex')}`;
}

export function portalTokenTtlMs() {
    const days = Math.min(365, Math.max(1, parseInt(process.env.PORTAL_TOKEN_TTL_DAYS || '90', 10) || 90));
    return days * 24 * 60 * 60 * 1000;
}

/**
 * Revoke active tokens for order and insert new hashed token.
 * @returns {{ rawToken: string, expires_at: string }}
 */
export async function issuePortalToken(supabase, orderId) {
    const now = new Date();
    const expires = new Date(now.getTime() + portalTokenTtlMs());
    const rawToken = generatePortalTokenRaw();
    const tokenHash = sha256Hex(rawToken);

    await supabase
        .from('order_portal_tokens')
        .update({ revoked_at: now.toISOString() })
        .eq('order_id', orderId)
        .is('revoked_at', null);

    const { error } = await supabase.from('order_portal_tokens').insert({
        order_id: orderId,
        token_hash: tokenHash,
        expires_at: expires.toISOString(),
    });

    if (error) throw error;

    return { rawToken, expires_at: expires.toISOString() };
}

/**
 * @returns {Promise<{ order: object, tokenRow: object } | null>}
 */
export async function verifyPortalToken(supabase, rawToken) {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 20) return null;

    const tokenHash = sha256Hex(rawToken.trim());
    const { data: row, error } = await supabase
        .from('order_portal_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .maybeSingle();

    if (error || !row) return null;
    if (new Date(row.expires_at) < new Date()) return null;

    const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('id', row.order_id).maybeSingle();

    if (orderErr || !order || order.status !== 'completed') return null;

    return { order, tokenRow: row };
}

function getHeader(req, lowerName) {
    const h = req && req.headers;
    if (!h || typeof h !== 'object') return '';
    const v = h[lowerName];
    if (v == null) return '';
    return Array.isArray(v) ? String(v[0] ?? '').trim() : String(v).trim();
}

/**
 * Staff / admin routes: ADMIN_TOKEN via Authorization or X-Creed-Staff-Token.
 * Secrets in query strings leak into history, logs, analytics, and referrers.
 */
export function verifyAdminRequest(req) {
    const secret = String(process.env.ADMIN_TOKEN || '').trim();
    if (!secret) return false;

    const auth = getHeader(req, 'authorization');
    const xStaff = getHeader(req, 'x-creed-staff-token');

    const bearerOk = (s) => {
        if (!s) return false;
        if (s === secret || s === `Bearer ${secret}`) return true;
        return s.replace(/^Bearer\s+/i, '').trim() === secret;
    };

    return bearerOk(auth) || bearerOk(xStaff);
}

export function parseBearer(req) {
    const raw = req.headers.authorization || '';
    const bearer = raw.replace(/^Bearer\s+/i, '').trim();
    return bearer;
}

export function sanitizeOrderForClient(order) {
    if (!order) return null;
    return {
        id: order.id,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        customer_email: order.customer_email,
        items: order.items,
        paid_at: order.paid_at,
        created_at: order.created_at,
    };
}
