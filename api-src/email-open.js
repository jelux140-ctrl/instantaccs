/* =========================================
   CREED — abandoned checkout open pixel
   GET /api/email-open?t=TOKEN
   ========================================= */

import { markAbandonedOpen, writePixel } from './lib-abandoned-checkout-track.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        await markAbandonedOpen(req.query?.t);
    } catch (e) {
        console.error('email-open:', e.message || e);
    }
    return writePixel(res);
}
