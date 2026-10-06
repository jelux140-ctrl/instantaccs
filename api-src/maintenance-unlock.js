/* =========================================
   CREED — POST { password } — Set cookie if matches maintenance password
   ========================================= */

import { timingSafeEqual } from 'crypto';
import { getSupabase } from './lib-portal.js';
import {
    MAINTENANCE_COOKIE_NAME,
    signMaintenanceCookie,
} from './lib-maintenance-cookie.js';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const password =
            (typeof req.body?.password === 'string' && req.body.password) ||
            (typeof req.body?.pwd === 'string' && req.body.pwd) ||
            '';
        const trimmed = password.trim();
        if (!trimmed) return res.status(400).json({ error: 'Password required' });

        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('site_settings')
            .select('storefront_maintenance, maintenance_password')
            .eq('id', 'global')
            .maybeSingle();

        if (error) throw error;
        const row = data || {};
        if (!row.storefront_maintenance) {
            return res.status(400).json({ error: 'Storefront is not in maintenance mode' });
        }
        const expected = row.maintenance_password;
        if (!expected || !String(expected).trim()) {
            return res.status(503).json({ error: 'Maintenance password not set yet. Use the admin dashboard.' });
        }

        const a = Buffer.from(trimmed, 'utf8');
        const b = Buffer.from(String(expected).trim(), 'utf8');
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        const val = signMaintenanceCookie();
        const maxAge = 7 * 24 * 60 * 60;
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const secure = proto === 'https' || process.env.VERCEL === '1';
        const cookie = `${MAINTENANCE_COOKIE_NAME}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
        res.setHeader('Set-Cookie', cookie);
        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('maintenance-unlock:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
