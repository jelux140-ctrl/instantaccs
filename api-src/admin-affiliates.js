/* =========================================
   CREED - ADMIN AFFILIATES / REFERRALS
   GET    -> list affiliates with click + sales stats
   POST   -> create affiliate { name, code?, note? }
   PATCH  -> toggle active { id, active }
   DELETE -> remove affiliate { id }  (?id= also accepted)
   ========================================= */

import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

function normalizeCode(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function parseBody(req) {
    if (!req.body) return {};
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
}

// Orders that actually count as a completed sale
function isPaid(order) {
    return order.status === 'completed' || order.status === 'paid' || !!order.paid_at;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Admin auth
    const authHeader = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    const token = authHeader?.replace(/^Bearer\s+/i, '') || authHeader;
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let supabase;
    try {
        supabase = getSupabase();
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }

    try {
        // ---------- CREATE ----------
        if (req.method === 'POST') {
            const body = parseBody(req);
            const name = String(body.name || '').trim().slice(0, 120);
            if (!name) return res.status(400).json({ error: 'Name is required' });

            let code = normalizeCode(body.code) || slugify(name);
            if (!code) code = 'ref-' + Math.random().toString(36).slice(2, 8);

            // Ensure unique code
            const { data: existing } = await supabase
                .from('affiliates').select('id').eq('code', code).maybeSingle();
            if (existing) code = `${code}-${Math.random().toString(36).slice(2, 5)}`;

            const { data, error } = await supabase
                .from('affiliates')
                .insert({ code, name, note: String(body.note || '').trim().slice(0, 300) || null })
                .select()
                .single();

            if (error) {
                console.error('create affiliate error:', error);
                return res.status(500).json({ error: 'Failed to create affiliate', details: error.message });
            }
            return res.status(200).json({ ok: true, affiliate: data });
        }

        // ---------- TOGGLE ACTIVE ----------
        if (req.method === 'PATCH') {
            const body = parseBody(req);
            if (!body.id) return res.status(400).json({ error: 'Missing id' });
            const { error } = await supabase
                .from('affiliates')
                .update({ active: !!body.active })
                .eq('id', body.id);
            if (error) return res.status(500).json({ error: 'Failed to update', details: error.message });
            return res.status(200).json({ ok: true });
        }

        // ---------- DELETE ----------
        if (req.method === 'DELETE') {
            const body = parseBody(req);
            const id = body.id || req.query.id;
            if (!id) return res.status(400).json({ error: 'Missing id' });
            const { error } = await supabase.from('affiliates').delete().eq('id', id);
            if (error) return res.status(500).json({ error: 'Failed to delete', details: error.message });
            return res.status(200).json({ ok: true });
        }

        // ---------- LIST + STATS ----------
        if (req.method === 'GET') {
            const { data: affiliates, error: affErr } = await supabase
                .from('affiliates')
                .select('*')
                .order('created_at', { ascending: false });
            if (affErr) return res.status(500).json({ error: 'Failed to load affiliates', details: affErr.message });

            // Click counts
            const clickCounts = {};
            {
                const PAGE = 1000;
                let from = 0;
                while (true) {
                    const { data, error } = await supabase
                        .from('affiliate_clicks')
                        .select('code')
                        .range(from, from + PAGE - 1);
                    if (error) break;
                    (data || []).forEach(r => { clickCounts[r.code] = (clickCounts[r.code] || 0) + 1; });
                    if (!data || data.length < PAGE) break;
                    from += PAGE;
                }
            }

            // Order attribution
            const orderStats = {}; // code -> { orders, paidOrders, revenue }
            {
                const PAGE = 1000;
                let from = 0;
                while (true) {
                    const { data, error } = await supabase
                        .from('orders')
                        .select('referral_code, status, amount, paid_at')
                        .not('referral_code', 'is', null)
                        .range(from, from + PAGE - 1);
                    if (error) break;
                    (data || []).forEach(o => {
                        const c = o.referral_code;
                        if (!orderStats[c]) orderStats[c] = { orders: 0, paidOrders: 0, revenue: 0 };
                        orderStats[c].orders += 1;
                        if (isPaid(o)) {
                            orderStats[c].paidOrders += 1;
                            orderStats[c].revenue += parseFloat(o.amount) || 0;
                        }
                    });
                    if (!data || data.length < PAGE) break;
                    from += PAGE;
                }
            }

            const result = (affiliates || []).map(a => {
                const s = orderStats[a.code] || { orders: 0, paidOrders: 0, revenue: 0 };
                return {
                    ...a,
                    clicks: clickCounts[a.code] || 0,
                    orders: s.orders,
                    sales: s.paidOrders,
                    revenue: Number(s.revenue.toFixed(2)),
                };
            });

            const totals = result.reduce((t, a) => {
                t.clicks += a.clicks; t.orders += a.orders; t.sales += a.sales; t.revenue += a.revenue;
                return t;
            }, { clicks: 0, orders: 0, sales: 0, revenue: 0 });
            totals.revenue = Number(totals.revenue.toFixed(2));

            return res.status(200).json({ affiliates: result, totals });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('admin-affiliates error:', err);
        return res.status(500).json({ error: 'Internal error', message: err.message });
    }
}
