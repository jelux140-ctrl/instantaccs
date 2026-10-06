/* =========================================
   CREED — Admin: read / update storefront maintenance (ADMIN_TOKEN)
   Authorization: Bearer ADMIN_TOKEN
   PATCH { enabled, password? }  password required when enabling if none set
   ========================================= */

import { getSupabase } from './lib-portal.js';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function verifyAdmin(req) {
    const raw = String(req.headers.authorization || '').trim();
    const bearer = raw.replace(/^Bearer\s+/i, '').trim();
    const secret = String(process.env.ADMIN_TOKEN || '').trim();
    // An unset secret must never authenticate an empty request.
    if (!secret) return false;
    return bearer === secret;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (!verifyAdmin(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabase();

    try {
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('site_settings')
                .select('storefront_maintenance, maintenance_password')
                .eq('id', 'global')
                .maybeSingle();

            if (error) throw error;
            const row = data || {};
            const hasPassword = !!(row.maintenance_password && String(row.maintenance_password).trim());
            return res.status(200).json({
                ok: true,
                enabled: !!row.storefront_maintenance,
                hasPassword,
            });
        }

        if (req.method === 'PATCH') {
            const enabled = !!req.body?.enabled;
            const passwordRaw = req.body?.password;
            const password = typeof passwordRaw === 'string' ? passwordRaw.trim() : '';

            const { data: cur, error: readErr } = await supabase
                .from('site_settings')
                .select('maintenance_password')
                .eq('id', 'global')
                .maybeSingle();
            if (readErr) throw readErr;
            const hadPassword = !!(cur?.maintenance_password && String(cur.maintenance_password).trim());

            if (enabled && !password && !hadPassword) {
                return res.status(400).json({
                    error: 'Set a storefront password when turning maintenance on.',
                });
            }

            let nextPw = null;
            if (!enabled) {
                nextPw = null;
            } else if (password) {
                nextPw = password;
            } else {
                nextPw = cur?.maintenance_password ?? null;
            }

            const { error: upErr } = await supabase.from('site_settings').upsert(
                {
                    id: 'global',
                    storefront_maintenance: enabled,
                    maintenance_password: nextPw,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'id' }
            );
            if (upErr) throw upErr;

            const hasPassword = !!(enabled && nextPw && String(nextPw).trim());
            return res.status(200).json({ ok: true, enabled, hasPassword });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('admin-maintenance:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
