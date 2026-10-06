/* =========================================
   CREED — abandoned checkout report
   Sends, opens, clicks, later purchases, revenue.
   ========================================= */

import { listAbandonedSends } from './lib-abandoned-checkout-track.js';

function verifyAdmin(req) {
    const authToken = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
    const ANALYTICS_TOKEN = String(process.env.ANALYTICS_READ_TOKEN || process.env.CREED_ADMIN_TOKEN || '').trim();
    const DISCORD_BOT_API_TOKEN = String(process.env.DISCORD_BOT_API_TOKEN || '').trim();
    const supplied = String(authToken || '').replace(/^Bearer\s+/i, '').trim();
    const isAdmin = Boolean(ADMIN_TOKEN) && supplied === ADMIN_TOKEN;
    const isAnalytics = Boolean(ANALYTICS_TOKEN) && supplied === ANALYTICS_TOKEN;
    const isDiscordBot = Boolean(DISCORD_BOT_API_TOKEN) && supplied === DISCORD_BOT_API_TOKEN;
    return isAdmin || isAnalytics || isDiscordBot;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!verifyAdmin(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const report = await listAbandonedSends();
        return res.status(200).json({
            ok: true,
            totals: report.totals,
            items: report.items,
            buyers: report.buyers,
        });
    } catch (e) {
        const missing = /relation|does not exist|PGRST/i.test(String(e.message || ''));
        if (missing) {
            return res.status(200).json({
                ok: true,
                totals: {
                    sent: 0,
                    opened: 0,
                    clicked: 0,
                    bought: 0,
                    revenue: 0,
                    cartValue: 0,
                    openRate: 0,
                    clickRate: 0,
                    conversionRate: 0,
                    byTier: { normal: 0, interested: 0, potential: 0 },
                },
                items: [],
                buyers: [],
                setup: 'missing_table',
            });
        }
        console.error('get-abandoned-checkout:', e);
        return res.status(500).json({ error: e.message || 'Failed to load abandoned checkout emails' });
    }
}
