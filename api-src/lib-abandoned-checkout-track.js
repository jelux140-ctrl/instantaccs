/* =========================================
   CREED — abandoned checkout send log
   Persist sends, opens, clicks. Match later paid orders by email.
   ========================================= */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const TABLE = 'abandoned_checkout_emails';
const SETTINGS_PREFIX = 'ace_';
export const PIXEL_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64',
);

function isMissingTable(error) {
    const msg = `${error?.message || ''} ${error?.code || ''} ${error?.details || ''}`;
    return /relation|does not exist|PGRST205|42P01/i.test(msg);
}

export function newTrackToken() {
    return crypto.randomBytes(16).toString('hex');
}

export function getServiceClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !key) throw new Error('Supabase service role not configured');
    return createClient(supabaseUrl, key);
}

export function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

export function isPaidStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    return value === 'completed' || value === 'paid' || value === 'delivered' || value === 'complete';
}

export function moneyNumber(value) {
    const n = Number.parseFloat(String(value || 0));
    return Number.isFinite(n) ? n : 0;
}

export async function recordAbandonedSend(row) {
    const supabase = getServiceClient();
    const payload = {
        token: row.token,
        email: normalizeEmail(row.email),
        order_id: row.orderId || null,
        session_id: row.sessionId || null,
        amount: row.amount == null ? null : String(row.amount),
        currency: String(row.currency || 'USD').toUpperCase(),
        items: Array.isArray(row.items) ? row.items : [],
        subject: row.subject || 'You left your cheat behind.',
        resend_id: row.resendId || null,
        sent_at: row.sentAt || new Date().toISOString(),
        tier: row.tier || null,
        discount_code: row.discountCode || null,
        discount_percent: row.discountPercent == null ? null : Number(row.discountPercent),
        checkout_count: row.checkoutCount == null ? null : Number(row.checkoutCount),
    };
    let { data, error } = await supabase.from(TABLE).insert(payload).select('id, token').maybeSingle();
    if (error && /column|schema cache/i.test(`${error.message || ''} ${error.code || ''}`)) {
        const slim = { ...payload };
        delete slim.tier;
        delete slim.discount_code;
        delete slim.discount_percent;
        delete slim.checkout_count;
        ({ data, error } = await supabase.from(TABLE).insert(slim).select('id, token').maybeSingle());
    }
    if (!error) return data;
    if (!isMissingTable(error)) throw error;
    const stored = {
        ...payload,
        opened_at: null,
        open_count: 0,
        clicked_at: null,
        click_count: 0,
        last_click_at: null,
        click_content: null,
    };
    const { error: fallbackError } = await supabase.from('site_settings').upsert({
        id: `${SETTINGS_PREFIX}${payload.token}`,
        storefront_maintenance: false,
        maintenance_password: JSON.stringify(stored),
        updated_at: new Date().toISOString(),
    });
    if (fallbackError) throw fallbackError;
    return { id: `${SETTINGS_PREFIX}${payload.token}`, token: payload.token };
}

async function bumpSettingsEvent(supabase, token, kind, extra = {}) {
    const { data: row, error } = await supabase
        .from('site_settings')
        .select('id, maintenance_password')
        .eq('id', `${SETTINGS_PREFIX}${token}`)
        .maybeSingle();
    if (error || !row?.maintenance_password) return null;
    let stored = {};
    try {
        stored = JSON.parse(row.maintenance_password);
    } catch {
        return null;
    }
    const now = new Date().toISOString();
    if (kind === 'open') {
        stored.open_count = (Number(stored.open_count) || 0) + 1;
        if (!stored.opened_at) stored.opened_at = now;
    }
    if (kind === 'click') {
        stored.click_count = (Number(stored.click_count) || 0) + 1;
        stored.last_click_at = now;
        if (!stored.clicked_at) stored.clicked_at = now;
        if (extra.click_content) stored.click_content = extra.click_content;
    }
    const { error: writeError } = await supabase.from('site_settings').update({
        maintenance_password: JSON.stringify(stored),
        updated_at: now,
    }).eq('id', row.id);
    if (writeError) throw writeError;
    return { id: row.id };
}

async function bumpEvent(token, kind, extra = {}) {
    const clean = String(token || '').trim();
    if (!/^[a-f0-9]{16,64}$/i.test(clean)) return null;
    const supabase = getServiceClient();
    const { data: existing, error: readError } = await supabase
        .from(TABLE)
        .select('id, opened_at, clicked_at, open_count, click_count')
        .eq('token', clean)
        .maybeSingle();
    if (readError && isMissingTable(readError)) {
        return bumpSettingsEvent(supabase, clean, kind, extra);
    }
    if (readError) throw readError;
    if (!existing) {
        return bumpSettingsEvent(supabase, clean, kind, extra);
    }

    const now = new Date().toISOString();
    const patch = { ...extra };
    if (kind === 'open') {
        patch.open_count = (Number(existing.open_count) || 0) + 1;
        if (!existing.opened_at) patch.opened_at = now;
    }
    if (kind === 'click') {
        patch.click_count = (Number(existing.click_count) || 0) + 1;
        patch.last_click_at = now;
        if (!existing.clicked_at) patch.clicked_at = now;
    }
    const { data, error } = await supabase.from(TABLE).update(patch).eq('id', existing.id).select('id').maybeSingle();
    if (error) throw error;
    return data;
}

export async function markAbandonedOpen(token) {
    return bumpEvent(token, 'open');
}

export async function markAbandonedClick(token, content) {
    return bumpEvent(token, 'click', content ? { click_content: String(content).slice(0, 80) } : {});
}

export function attachPurchases(sends, orders) {
    const paid = (orders || [])
        .filter((order) => isPaidStatus(order.status) && normalizeEmail(order.customer_email || order.customerEmail || order.email))
        .map((order) => ({
            id: String(order.id || ''),
            email: normalizeEmail(order.customer_email || order.customerEmail || order.email),
            amount: moneyNumber(order.amount),
            currency: String(order.currency || 'USD').toUpperCase(),
            paidAt: order.paid_at || order.paidAt || order.created_at || order.createdAt || null,
            createdAt: order.created_at || order.createdAt || null,
            items: order.items || [],
        }))
        .filter((order) => order.email && order.id);

    return (sends || []).map((send) => {
        const email = normalizeEmail(send.email);
        const sentAt = new Date(send.sent_at || send.sentAt || 0).getTime();
        const later = paid
            .filter((order) => {
                if (order.email !== email) return false;
                const when = new Date(order.paidAt || order.createdAt || 0).getTime();
                if (!when || !sentAt) return false;
                return when >= sentAt - 60_000;
            })
            .sort((a, b) => new Date(a.paidAt || a.createdAt).getTime() - new Date(b.paidAt || b.createdAt).getTime());
        const purchase = later[0] || null;
        const rawItems = Array.isArray(send.items) ? send.items : [];
        const meta = rawItems.find((item) => item && item.id === '_meta') || {};
        const items = rawItems.filter((item) => !item || item.id !== '_meta');
        const tier = String(send.tier || meta.tier || 'normal').toLowerCase();
        return {
            id: send.id,
            token: send.token,
            email,
            orderId: send.order_id || send.orderId || null,
            sessionId: send.session_id || send.sessionId || null,
            cartAmount: moneyNumber(send.amount),
            currency: String(send.currency || 'USD').toUpperCase(),
            items,
            tier,
            discountCode: send.discount_code || send.discountCode || meta.discountCode || '',
            discountPercent: Number(send.discount_percent || send.discountPercent || meta.discountPercent || 0),
            checkoutCount: Number(send.checkout_count || send.checkoutCount || meta.checkoutCount || 1),
            subject: send.subject || '',
            resendId: send.resend_id || send.resendId || null,
            sentAt: send.sent_at || send.sentAt || null,
            openedAt: send.opened_at || send.openedAt || null,
            openCount: Number(send.open_count || send.openCount || 0),
            clickedAt: send.clicked_at || send.clickedAt || null,
            clickCount: Number(send.click_count || send.clickCount || 0),
            clickContent: send.click_content || send.clickContent || null,
            opened: Boolean(send.opened_at || send.openedAt),
            clicked: Boolean(send.clicked_at || send.clickedAt),
            bought: Boolean(purchase),
            purchaseOrderId: purchase?.id || null,
            purchaseAmount: purchase ? purchase.amount : 0,
            purchaseCurrency: purchase?.currency || String(send.currency || 'USD').toUpperCase(),
            purchasedAt: purchase?.paidAt || null,
            purchaseItems: purchase?.items || [],
        };
    });
}

export function summarizeSends(rows) {
    const sent = rows.length;
    const opened = rows.filter((row) => row.opened).length;
    const clicked = rows.filter((row) => row.clicked).length;
    const bought = rows.filter((row) => row.bought).length;
    const revenue = rows.reduce((sum, row) => sum + (row.bought ? row.purchaseAmount : 0), 0);
    const cartValue = rows.reduce((sum, row) => sum + (row.cartAmount || 0), 0);
    return {
        sent,
        opened,
        clicked,
        bought,
        revenue,
        cartValue,
        openRate: sent ? opened / sent : 0,
        clickRate: sent ? clicked / sent : 0,
        conversionRate: sent ? bought / sent : 0,
        byTier: {
            normal: rows.filter((row) => row.tier === 'normal').length,
            interested: rows.filter((row) => row.tier === 'interested').length,
            potential: rows.filter((row) => row.tier === 'potential').length,
        },
    };
}

export async function listAbandonedSends() {
    const supabase = getServiceClient();
    const PAGE = 1000;
    const sends = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .order('sent_at', { ascending: false })
            .range(from, from + PAGE - 1);
        if (error && isMissingTable(error)) {
            const { data: fallback, error: fallbackError } = await supabase
                .from('site_settings')
                .select('id, maintenance_password, updated_at')
                .like('id', `${SETTINGS_PREFIX}%`);
            if (fallbackError) throw fallbackError;
            for (const row of fallback || []) {
                try {
                    const stored = JSON.parse(row.maintenance_password || '{}');
                    if (stored.email && stored.token) sends.push({ id: row.id, ...stored });
                } catch {
                    /* skip bad row */
                }
            }
            break;
        }
        if (error) throw error;
        sends.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }

    const orders = [];
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('orders')
            .select('id, session_id, status, amount, currency, customer_email, items, created_at, paid_at')
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE - 1);
        if (error) throw error;
        orders.push(...(data || []));
        if (!data || data.length < PAGE) break;
        offset += PAGE;
    }

    const items = attachPurchases(sends, orders);
    const buyers = items.filter((row) => row.bought);
    return {
        totals: summarizeSends(items),
        items,
        buyers,
    };
}

export function writePixel(res) {
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Length', String(PIXEL_GIF.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).end(PIXEL_GIF);
}
