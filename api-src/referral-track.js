/* =========================================
   CREED - REFERRAL CLICK TRACKING (public)
   POST /api/referral-track  { code, landingPath, referrer }
   Records one visit from an affiliate link.
   ========================================= */

import { createClient } from '@supabase/supabase-js';
import { guardPublicPost } from './lib-abuse-guard.js';

const getSupabase = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

function normalizeCode(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const code = normalizeCode(body.code);
        if (!code) return res.status(400).json({ error: 'Missing referral code' });

        const supabase = getSupabase();
        const guard = await guardPublicPost(req, supabase, { bucket: 'referral-click', max: 60, windowSec: 3600 });
        if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

        // Only record clicks for known, active affiliates (ignore junk codes)
        const { data: affiliate } = await supabase
            .from('affiliates')
            .select('code, active')
            .eq('code', code)
            .maybeSingle();

        if (!affiliate || affiliate.active === false) {
            // Silently accept so we never leak which codes exist
            return res.status(200).json({ ok: true, tracked: false });
        }

        const { error } = await supabase.from('affiliate_clicks').insert({
            code,
            landing_path: String(body.landingPath || '').slice(0, 300) || null,
            referrer: String(body.referrer || '').slice(0, 300) || null,
            user_agent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
        });

        if (error) {
            console.error('referral-track insert error:', error);
            return res.status(500).json({ error: 'Failed to record click' });
        }

        return res.status(200).json({ ok: true, tracked: true });
    } catch (err) {
        console.error('referral-track error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
