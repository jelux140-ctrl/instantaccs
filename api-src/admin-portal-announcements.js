/* =========================================
   CREED — Admin: portal announcements (staff token)
   GET list (all) | POST create | PATCH update | DELETE
   ========================================= */

import { getSupabase, verifyAdminRequest } from './lib-portal.js';

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

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Creed-Staff-Token');
}

const MAX_TITLE = 200;
const MAX_BODY = 50000;

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (!verifyAdminRequest(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabase();

    try {
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('portal_announcements')
                .select('id, title, body, body_format, is_published, published_at, created_at')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            return res.status(200).json({ ok: true, announcements: data || [] });
        }

        if (req.method === 'POST') {
            const body = parseJsonBody(req);
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            const text = typeof body.body === 'string' ? body.body : '';
            const bodyFormat = body.body_format === 'markdown' ? 'markdown' : 'plain';
            const isPublished = Boolean(body.is_published);
            let publishedAt = null;
            if (typeof body.published_at === 'string' && body.published_at.trim()) {
                publishedAt = new Date(body.published_at).toISOString();
            } else if (isPublished) {
                publishedAt = new Date().toISOString();
            }

            if (title.length < 1 || title.length > MAX_TITLE) {
                return res.status(400).json({ error: `Title required (max ${MAX_TITLE} chars)` });
            }
            if (text.length < 1 || text.length > MAX_BODY) {
                return res.status(400).json({ error: `Body required (max ${MAX_BODY} chars)` });
            }

            const row = {
                title,
                body: text,
                body_format: bodyFormat,
                is_published: isPublished,
                published_at: publishedAt,
            };

            const { data, error } = await supabase.from('portal_announcements').insert(row).select().single();

            if (error) throw error;
            return res.status(201).json({ ok: true, announcement: data });
        }

        if (req.method === 'PATCH') {
            const body = parseJsonBody(req);
            const id = typeof body.id === 'string' ? body.id : '';
            if (!id) return res.status(400).json({ error: 'id required' });

            const patch = {};
            if (typeof body.title === 'string') {
                const t = body.title.trim();
                if (t.length < 1 || t.length > MAX_TITLE) {
                    return res.status(400).json({ error: 'Invalid title' });
                }
                patch.title = t;
            }
            if (typeof body.body === 'string') {
                if (body.body.length < 1 || body.body.length > MAX_BODY) {
                    return res.status(400).json({ error: 'Invalid body' });
                }
                patch.body = body.body;
            }
            if (body.body_format === 'markdown' || body.body_format === 'plain') {
                patch.body_format = body.body_format;
            }
            if (typeof body.is_published === 'boolean') {
                patch.is_published = body.is_published;
            }
            if (body.published_at === null) {
                patch.published_at = null;
            } else if (typeof body.published_at === 'string' && body.published_at.trim()) {
                patch.published_at = new Date(body.published_at).toISOString();
            }

            if (Object.keys(patch).length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            const { data, error } = await supabase
                .from('portal_announcements')
                .update(patch)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, announcement: data });
        }

        if (req.method === 'DELETE') {
            const body = parseJsonBody(req);
            const id =
                (typeof req.query?.id === 'string' && req.query.id) ||
                (typeof body.id === 'string' && body.id) ||
                '';
            if (!id) return res.status(400).json({ error: 'id required' });

            const { error } = await supabase.from('portal_announcements').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true, deleted: id });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('admin-portal-announcements:', e);
        return res.status(500).json({ error: e.message || 'Failed' });
    }
}
