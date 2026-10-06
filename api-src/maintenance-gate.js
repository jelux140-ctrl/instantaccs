/* =========================================
   CREED — Edge middleware calls this: may visitor see the storefront?
   GET — { ok: true } pass | { ok: false } show maintenance page
   ========================================= */

import { getSupabase } from './lib-portal.js';
import { verifyMaintenanceCookie } from './lib-maintenance-cookie.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = getSupabase();
        const q = supabase
            .from('site_settings')
            .select('storefront_maintenance, maintenance_password')
            .eq('id', 'global')
            .maybeSingle();

        const { data, error } = await Promise.race([
            q,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('maintenance_gate_timeout')), 4000)
            ),
        ]);

        if (error) {
            console.error('maintenance-gate:', error);
            return res.status(200).json({ ok: true });
        }

        const row = data || {};
        if (!row.storefront_maintenance) return res.status(200).json({ ok: true });

        const pw = row.maintenance_password;
        if (!pw || !String(pw).trim()) {
            return res.status(200).json({ ok: true, warn: 'maintenance_no_password' });
        }

        const ok = verifyMaintenanceCookie(req.headers.cookie || '');
        return res.status(200).json({ ok });
    } catch (e) {
        console.error('maintenance-gate:', e);
        return res.status(200).json({ ok: true });
    }
}
