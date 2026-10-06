/* =========================================
   CREED — email marketing report
   Every campaign send: opened, clicked, later bought, revenue.
   ========================================= */

import {
    attachPurchases,
    getServiceClient,
    listAbandonedSends,
    normalizeEmail,
    summarizeSends,
} from './lib-abandoned-checkout-track.js';

function verifyAdmin(req) {
    const authToken = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
    const ANALYTICS_TOKEN = String(
        process.env.ANALYTICS_READ_TOKEN || process.env.CREED_ADMIN_TOKEN || '',
    ).trim();
    const DISCORD_BOT_API_TOKEN = String(process.env.DISCORD_BOT_API_TOKEN || '').trim();
    const supplied = String(authToken || '').replace(/^Bearer\s+/i, '').trim();
    return (
        (Boolean(ADMIN_TOKEN) && supplied === ADMIN_TOKEN) ||
        (Boolean(ANALYTICS_TOKEN) && supplied === ANALYTICS_TOKEN) ||
        (Boolean(DISCORD_BOT_API_TOKEN) && supplied === DISCORD_BOT_API_TOKEN)
    );
}

function emptyTotals() {
    return {
        sent: 0,
        opened: 0,
        clicked: 0,
        bought: 0,
        revenue: 0,
        cartValue: 0,
        openRate: 0,
        clickRate: 0,
        conversionRate: 0,
    };
}

function tagCampaign(rows, campaign, extras = {}) {
    return (rows || []).map((row) => ({
        ...row,
        campaign,
        ...extras,
    }));
}

async function listPromoSignupsAsSends() {
    const supabase = getServiceClient();
    const PAGE = 1000;
    const signups = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('promo_signups')
            .select('id, email, created_at')
            .order('created_at', { ascending: false })
            .range(from, from + PAGE - 1);
        if (error) {
            if (/relation|does not exist|PGRST205|42P01/i.test(`${error.message} ${error.code}`)) {
                return [];
            }
            throw error;
        }
        signups.push(...(data || []));
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

    return attachPurchases(
        signups.map((row) => ({
            id: row.id,
            token: null,
            email: normalizeEmail(row.email),
            subject: 'Your Creed welcome discount',
            sent_at: row.created_at,
            items: [{ name: 'Bonus signup · CREED5' }],
        })),
        orders,
    );
}

function pack(items) {
    const rows = items || [];
    const buyers = rows.filter((row) => row.bought);
    return {
        totals: rows.length ? summarizeSends(rows) : emptyTotals(),
        items: rows,
        buyers,
    };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!verifyAdmin(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const abandoned = await listAbandonedSends();
        const abandonedItems = tagCampaign(abandoned.items, 'abandoned-checkout');
        let promoItems = [];
        try {
            promoItems = tagCampaign(await listPromoSignupsAsSends(), 'bonus-signup');
        } catch (error) {
            console.warn('email-marketing promo:', error.message || error);
        }

        const items = [...abandonedItems, ...promoItems].sort((a, b) => {
            return new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime();
        });
        const all = pack(items);
        const bySlug = {
            'abandoned-checkout': pack(abandonedItems),
            'bonus-signup': pack(promoItems),
            welcome: pack([]),
        };

        return res.status(200).json({
            ok: true,
            totals: all.totals,
            items: all.items,
            buyers: all.buyers,
            campaigns: bySlug,
        });
    } catch (e) {
        console.error('get-email-marketing:', e);
        return res.status(500).json({ error: e.message || 'Failed to load email marketing' });
    }
}
