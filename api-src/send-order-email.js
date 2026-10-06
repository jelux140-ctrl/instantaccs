/* =========================================
   CREED - ADMIN ORDER EMAIL (EmailJS) — manual / test trigger
   ========================================= */

import { normalizeOrderInput, sendAdminOrderEmailJS, getPortalBaseUrl } from './lib-order-emails.js';

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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Staff-only. webhook.js calls sendAdminOrderEmailJS() in-process, so no
    // public caller exists. Left open, it was a free spam relay to our admins.
    const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!ADMIN_TOKEN || supplied !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const body = parseJsonBody(req);
        const payload = normalizeOrderInput(body);
        if (!payload?.id) {
            return res.status(400).json({ error: 'Invalid order payload' });
        }

        await sendAdminOrderEmailJS(payload, getPortalBaseUrl());

        return res.status(200).json({
            success: true,
            message: 'Emails sent successfully to all admins',
        });
    } catch (error) {
        console.error('Email sending error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
        });
    }
}
