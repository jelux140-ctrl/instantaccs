/* =========================================
   CREED — abandoned checkout click ping
   GET/POST /api/email-click?t=TOKEN&c=complete-checkout
   ========================================= */

import { markAbandonedClick } from './lib-abandoned-checkout-track.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    res.setHeader('Cache-Control', 'no-store');
    try {
        const token = req.query?.t || req.body?.t;
        const content = req.query?.c || req.query?.utm_content || req.body?.c;
        await markAbandonedClick(token, content);
    } catch (e) {
        console.error('email-click:', e.message || e);
    }
    return res.status(204).end();
}
