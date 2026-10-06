/* =========================================
   CREED - ORDER RESTORE FROM STRIPE
   Rebuilds the `orders` table from Stripe after the database wipe.

   Stripe is the authoritative record of every real payment - an attacker
   with database access can delete Postgres rows but can never touch
   Stripe. Forged orders never existed in Stripe, so this restores the
   genuine orders and silently drops every fake one.

   Mirrors the row shape written by webhook.js so restored orders are
   indistinguishable from live ones (session_id 'cs_...', paid_at set),
   and idempotent: existing orders are skipped, so it is safe to re-run.

   USAGE (admin token required):
     POST /api/admin-restore-orders            -> DRY RUN (default)
     POST /api/admin-restore-orders  { "dryRun": false, "since": "2026-07-15" }
   ========================================= */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
    }
    return createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
};

/** Rebuild cart items, preferring webhook metadata and falling back to Stripe line items. */
function extractItems(session) {
    try {
        const raw = [
            session.metadata?.order_items,
            session.metadata?.order_items_2,
            session.metadata?.order_items_3,
        ].filter(Boolean).join('');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) return { items: parsed, source: 'metadata' };
        }
    } catch {
        // Metadata truncated by Stripe's 500-char cap - fall through.
    }

    // Fallback: reconstruct from line items so the order is never itemless.
    const lines = session.line_items?.data || [];
    if (lines.length) {
        return {
            items: lines.map(li => ({
                id: li.price?.product || '',
                name: li.description || li.price?.nickname || 'Product',
                variant: '',
                price: li.amount_total != null ? Number((li.amount_total / 100 / (li.quantity || 1)).toFixed(2)) : 0,
                quantity: li.quantity || 1,
            })),
            source: 'line_items'
        };
    }
    return { items: [], source: 'none' };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
        || String(req.body?.token || '').trim();
    if (!ADMIN_TOKEN || supplied !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    // Dry run unless explicitly disabled, so the first call never writes.
    const dryRun = req.body?.dryRun !== false;
    const sinceRaw = req.body?.since || '2026-07-15';
    const sinceDate = new Date(`${sinceRaw}T00:00:00Z`);
    if (Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: 'Invalid `since` date. Use YYYY-MM-DD.' });
    }
    const sinceTs = Math.floor(sinceDate.getTime() / 1000);

    try {
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });
        const supabase = getSupabaseClient();

        const restored = [];
        const skipped = [];
        const unpaid = [];
        const failed = [];
        let scanned = 0;

        // auto-pagination walks every page for us
        const iterator = stripe.checkout.sessions.list({
            created: { gte: sinceTs },
            limit: 100,
            expand: ['data.line_items'],
        });

        for await (const session of iterator) {
            scanned++;

            if (session.payment_status !== 'paid') {
                unpaid.push({ sessionId: session.id, status: session.payment_status });
                continue;
            }

            const orderId = session.metadata?.order_id || `order_${session.id}`;

            const { data: existing } = await supabase
                .from('orders')
                .select('id')
                .eq('id', orderId)
                .maybeSingle();

            if (existing) {
                skipped.push(orderId);
                continue;
            }

            const { items, source } = extractItems(session);
            const createdAt = new Date((session.created || 0) * 1000).toISOString();

            const row = {
                id: orderId,
                session_id: session.id,
                status: 'completed',
                amount: session.amount_total != null ? (session.amount_total / 100).toFixed(2) : '0.00',
                currency: session.currency?.toUpperCase() || 'USD',
                customer_email: session.customer_email || session.customer_details?.email || null,
                discord_username: session.metadata?.discord_username || null,
                referral_code: session.metadata?.referral_code || null,
                items,
                // paid_at must be set: it is what distinguishes a genuine paid
                // order from a forged one everywhere else in the codebase.
                created_at: createdAt,
                paid_at: createdAt,
            };

            if (dryRun) {
                restored.push({ orderId, email: row.customer_email, amount: row.amount, items: items.length, itemSource: source });
                continue;
            }

            const { error } = await supabase.from('orders').insert(row);
            if (error) {
                failed.push({ orderId, error: error.message });
            } else {
                restored.push({ orderId, email: row.customer_email, amount: row.amount, items: items.length, itemSource: source });
            }
        }

        const total = restored.reduce((sum, r) => sum + Number(r.amount || 0), 0);

        return res.status(200).json({
            success: true,
            dryRun,
            since: sinceRaw,
            scannedSessions: scanned,
            restoredCount: restored.length,
            skippedExisting: skipped.length,
            unpaidIgnored: unpaid.length,
            failedCount: failed.length,
            restoredRevenue: total.toFixed(2),
            restored,
            failed,
            message: dryRun
                ? 'DRY RUN - nothing written. Re-send with {"dryRun": false} to apply.'
                : `Restored ${restored.length} orders from Stripe.`,
        });

    } catch (error) {
        console.error('Order restore error:', error);
        return res.status(500).json({ error: 'Restore failed', message: error.message });
    }
}
