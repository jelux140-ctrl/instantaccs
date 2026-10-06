/* =========================================
   CREED - CUSTOMER RECEIPT (Resend) — manual / test trigger
   ========================================= */

import {
    normalizeOrderInput,
    sendCustomerReceiptResend,
    getPortalBaseUrl,
} from './lib-order-emails.js';

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

    // Staff-only. The live purchase flow calls sendCustomerReceiptResend()
    // in-process from webhook.js and never hits this route, so nothing
    // legitimate is public here. Left open, it let anyone send a fully
    // attacker-controlled "receipt" from our domain to any address.
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

        const r = await sendCustomerReceiptResend(payload, getPortalBaseUrl());
        if (!r.ok) {
            return res.status(500).json({ error: r.error || 'Failed to send' });
        }

        return res.status(200).json({
            success: true,
            message: 'Customer confirmation email sent via Resend',
            data: r.data,
        });
    } catch (error) {
        console.error('Customer email sending error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
        });
    }
}
