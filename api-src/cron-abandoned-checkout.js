/* =========================================
   CREED — abandoned checkout reminder
   One first-wave email per unpaid customer.
   Tier (normal / interested / potential) from checkout count + time on site.
   Higher tiers get a bigger ACE discount. Follow-ups come later.
   ========================================= */

import Stripe from 'stripe';
import { htmlToText } from './lib-order-emails.js';
import { newTrackToken, recordAbandonedSend, TABLE, getServiceClient, normalizeEmail } from './lib-abandoned-checkout-track.js';
import { buildAbandonedCheckoutEmail, storeBase, normalizeItems } from './lib-abandoned-checkout-email.js';
import { scoreAbandonedLead, productPathFor } from './lib-abandoned-checkout-score.js';

const DEFAULT_MIN_MINUTES = 30;
const DEFAULT_MAX_DAYS = 90;
const MAX_REMINDERS_PER_RUN = 25;

function verifyAuth(req) {
    const raw = req.headers.authorization || '';
    const token = raw.replace(/^Bearer\s+/i, '').trim();
    const admin = process.env.ADMIN_TOKEN;
    const cronSecret = process.env.CRON_SECRET;
    if (req.headers['x-vercel-cron'] === '1') return true;
    if (token && admin && token === admin) return true;
    if (token && cronSecret && token === cronSecret) return true;
    return false;
}

function isRealCustomerEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return Boolean(normalized && normalized.includes('@') && normalized !== 'customer@creed.com');
}

function isPaid(status) {
    const value = String(status || '').trim().toLowerCase();
    return value === 'completed' || value === 'paid' || value === 'delivered' || value === 'complete';
}

function isUnpaid(status) {
    const value = String(status || '').trim().toLowerCase();
    return value === 'pending' || value === 'unpaid' || value === 'failed' || value === 'expired' || value === 'cancelled' || value === 'canceled';
}

function landingUrl(items, discount) {
    const dest = new URL(productPathFor(items), `${storeBase()}/`);
    dest.searchParams.set('discount', discount);
    dest.searchParams.set('utm_medium', 'email');
    dest.searchParams.set('utm_source', 'creed');
    dest.searchParams.set('utm_campaign', 'abandoned-checkout');
    return dest.toString();
}

function scoreFromOrders(orders) {
    const unpaid = orders.filter((order) => isUnpaid(order.status) && !isPaid(order.status));
    const sessions = new Set(orders.map((order) => String(order.session_id || '').trim()).filter(Boolean));
    const times = orders
        .map((order) => new Date(order.created_at || 0).getTime())
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
    const spanMinutes = times.length >= 2 ? Math.round((times[times.length - 1] - times[0]) / 60_000) : 0;
    return scoreAbandonedLead({
        unpaidCount: unpaid.length || 1,
        orderCount: orders.length || 1,
        sessionCount: sessions.size || 1,
        spanMinutes,
    });
}

async function alreadyEmailed(supabase, emails) {
    const sent = new Set();
    if (!emails.length) return sent;
    const { data, error } = await supabase.from(TABLE).select('email').in('email', emails);
    if (!error) {
        for (const row of data || []) sent.add(normalizeEmail(row.email));
        return sent;
    }
    const { data: fallback } = await supabase
        .from('site_settings')
        .select('id, maintenance_password')
        .like('id', 'ace_%');
    for (const row of fallback || []) {
        try {
            const stored = JSON.parse(row.maintenance_password || '{}');
            const email = normalizeEmail(stored.email);
            if (emails.includes(email)) sent.add(email);
        } catch {
            /* skip */
        }
    }
    return sent;
}

async function sendReminderEmail({ to, html }) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = String(process.env.RESEND_FROM_EMAIL || '').trim();
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
    if (!FROM_EMAIL) throw new Error('RESEND_FROM_EMAIL missing');

    const unsubscribe = `${storeBase()}/unsubscribe?email=${encodeURIComponent(to)}`;
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: `Creed Store <${FROM_EMAIL}>`,
            to: [to],
            subject: 'You left your cheat behind.',
            html,
            text: htmlToText(html),
            headers: {
                'List-Unsubscribe': `<${unsubscribe}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
        }),
    });

    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    if (!response.ok) throw new Error(data?.message || text || response.statusText);
    return data;
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!verifyAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const dryRun = req.query?.dry === '1' || req.query?.dry === 'true';
    const force = req.query?.force === '1' || req.query?.force === 'true';
    const minMinutes = Math.max(5, Number.parseInt(process.env.ABANDONED_CHECKOUT_MINUTES || `${DEFAULT_MIN_MINUTES}`, 10) || DEFAULT_MIN_MINUTES);
    const maxDays = Math.max(1, Number.parseInt(process.env.ABANDONED_CHECKOUT_MAX_DAYS || `${DEFAULT_MAX_DAYS}`, 10) || DEFAULT_MAX_DAYS);

    try {
        const supabase = getServiceClient();
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' }) : null;
        const now = Date.now();
        const olderThan = new Date(now - minMinutes * 60_000).toISOString();
        const newerThan = new Date(now - maxDays * 86_400_000).toISOString();

        let query = supabase
            .from('orders')
            .select('id, session_id, status, amount, currency, customer_email, items, created_at')
            .in('status', ['pending', 'unpaid', 'failed', 'expired'])
            .not('customer_email', 'is', null)
            .order('created_at', { ascending: false })
            .limit(400);

        if (!force) {
            query = query.gte('created_at', newerThan).lt('created_at', olderThan);
        }

        const { data: candidates, error } = await query;
        if (error) throw error;

        const byEmail = new Map();
        for (const order of candidates || []) {
            const email = normalizeEmail(order.customer_email);
            if (!isRealCustomerEmail(email)) continue;
            if (!byEmail.has(email)) byEmail.set(email, []);
            byEmail.get(email).push(order);
        }

        const emails = [...byEmail.keys()];
        const historyByEmail = new Map();
        if (emails.length) {
            const { data: history, error: historyError } = await supabase
                .from('orders')
                .select('id, session_id, status, amount, currency, customer_email, items, created_at')
                .in('customer_email', emails)
                .order('created_at', { ascending: false })
                .limit(2000);
            if (historyError) throw historyError;
            for (const order of history || []) {
                const email = normalizeEmail(order.customer_email);
                if (!historyByEmail.has(email)) historyByEmail.set(email, []);
                historyByEmail.get(email).push(order);
            }
        }

        const sentEmails = force ? new Set() : await alreadyEmailed(supabase, emails);

        const optedOut = new Set();
        try {
            const { data: optOutRows, error: optOutError } = await supabase.from('email_optouts').select('email');
            if (optOutError) {
                console.error('cron-abandoned-checkout: opt-out lookup failed', optOutError.message);
            } else {
                for (const row of optOutRows || []) optedOut.add(normalizeEmail(row.email));
            }
        } catch (e) {
            console.error('cron-abandoned-checkout: opt-out lookup threw', e.message);
        }

        const sent = [];
        const skipped = [];
        let remaining = force ? 5 : MAX_REMINDERS_PER_RUN;

        for (const email of emails) {
            if (remaining <= 0) break;
            const unpaid = (byEmail.get(email) || []).filter((order) => !isPaid(order.status));
            const latest = unpaid[0];
            if (!latest) {
                skipped.push({ email, reason: 'no_unpaid' });
                continue;
            }
            if (optedOut.has(email)) {
                skipped.push({ id: latest.id, email, reason: 'unsubscribed' });
                continue;
            }
            if (sentEmails.has(email)) {
                skipped.push({ id: latest.id, email, reason: 'already_reminded' });
                continue;
            }

            const history = historyByEmail.get(email) || unpaid;
            if (history.some((order) => isPaid(order.status))) {
                skipped.push({ id: latest.id, email, reason: 'already_paid' });
                continue;
            }

            const tier = scoreFromOrders(history);
            const items = normalizeItems(latest.items);
            let checkoutUrl = landingUrl(items, tier.code);
            let stripeSession = null;
            const isManualOrder = /^manual[_-]/i.test(String(latest.session_id || ''));

            if (stripe && latest.session_id && !isManualOrder) {
                try {
                    const session = await stripe.checkout.sessions.retrieve(latest.session_id);
                    stripeSession = session;
                    if (session.payment_status && session.payment_status !== 'unpaid') {
                        skipped.push({ id: latest.id, email, reason: `stripe_${session.payment_status}` });
                        continue;
                    }
                    if (session.status === 'open' && session.url) {
                        checkoutUrl = session.url;
                    }
                    if (session.metadata?.abandoned_reminder_sent_at && !force) {
                        skipped.push({ id: latest.id, email, reason: 'already_reminded' });
                        continue;
                    }
                } catch {
                    /* land on product page with the discount instead */
                }
            }

            const token = newTrackToken();
            const html = buildAbandonedCheckoutEmail({
                order: latest,
                checkoutUrl,
                token,
                tier,
            });
            if (dryRun) {
                sent.push({
                    id: latest.id,
                    email,
                    dryRun: true,
                    tier: tier.id,
                    discount: tier.code,
                    checkoutUrl: Boolean(checkoutUrl),
                });
                remaining -= 1;
                continue;
            }

            const data = await sendReminderEmail({ to: email, html });
            if (stripe && stripeSession?.id && stripeSession.status === 'open') {
                try {
                    await stripe.checkout.sessions.update(stripeSession.id, {
                        metadata: {
                            ...stripeSession.metadata,
                            abandoned_reminder_sent_at: new Date().toISOString(),
                            abandoned_reminder_token: token,
                            abandoned_tier: tier.id,
                            abandoned_discount: tier.code,
                        },
                    });
                } catch (metaError) {
                    console.error('cron-abandoned-checkout: stripe metadata failed', metaError.message);
                }
            }

            const unpaidCount = history.filter((order) => isUnpaid(order.status)).length;
            const times = history
                .map((order) => new Date(order.created_at || 0).getTime())
                .filter((n) => Number.isFinite(n) && n > 0)
                .sort((a, b) => a - b);
            const spanMinutes = times.length >= 2 ? Math.round((times[times.length - 1] - times[0]) / 60_000) : 0;
            const metaItem = {
                id: '_meta',
                name: 'meta',
                tier: tier.id,
                discountCode: tier.code,
                discountPercent: tier.percent,
                checkoutCount: unpaidCount,
                sessionSeconds: spanMinutes * 60,
            };

            try {
                await recordAbandonedSend({
                    token,
                    email,
                    orderId: latest.id,
                    sessionId: latest.session_id,
                    amount: latest.amount,
                    currency: latest.currency,
                    items: [...items, metaItem],
                    subject: 'You left your cheat behind.',
                    resendId: data?.id || null,
                    tier: tier.id,
                    discountCode: tier.code,
                    discountPercent: tier.percent,
                });
            } catch (logError) {
                console.error('cron-abandoned-checkout: send log failed', logError.message || logError);
            }
            sent.push({
                id: latest.id,
                email,
                resendId: data?.id || null,
                token,
                tier: tier.id,
                discount: tier.code,
                checkoutUrl: Boolean(checkoutUrl),
            });
            remaining -= 1;
        }

        return res.status(200).json({
            ok: true,
            dryRun,
            force,
            window: force ? null : { minMinutes, maxDays },
            candidates: emails.length,
            sent,
            skipped,
        });
    } catch (e) {
        console.error('cron-abandoned-checkout:', e);
        return res.status(500).json({ error: e.message || 'Abandoned checkout reminder failed' });
    }
}
