/* =========================================
   CREED - SAVE/UPDATE/DELETE BLOG POST API
   CRUD operations for blog posts
   ========================================= */

import { createClient } from '@supabase/supabase-js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const authToken = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    if (!ADMIN_TOKEN || (authToken !== `Bearer ${ADMIN_TOKEN}` && authToken !== ADMIN_TOKEN)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabaseClient();

    try {
        // UPDATE blog post
        if (req.method === 'PATCH') {
            const { id, ...updates } = req.body;
            if (!id) return res.status(400).json({ error: 'Post ID is required' });

            if (updates.status === 'published') {
                const { data: existing } = await supabase
                    .from('blog_posts')
                    .select('published_at')
                    .eq('id', id)
                    .single();
                if (existing && !existing.published_at) {
                    updates.published_at = new Date().toISOString();
                }
            }

            const { data, error } = await supabase
                .from('blog_posts')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                return res.status(500).json({ error: 'Failed to update post', details: error.message });
            }

            // Ping search engines when publishing
            if (updates.status === 'published' && data?.slug) {
                pingSearchEngines(data.slug).catch(() => {});
            }

            return res.status(200).json({ success: true, post: data });
        }

        // DELETE blog post
        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Post ID is required' });

            const { error } = await supabase
                .from('blog_posts')
                .delete()
                .eq('id', id);

            if (error) {
                return res.status(500).json({ error: 'Failed to delete post', details: error.message });
            }
            return res.status(200).json({ success: true });
        }

        // GET all blog posts (admin view - includes drafts)
        if (req.method === 'GET') {
            const { status, search } = req.query;

            let query = supabase
                .from('blog_posts')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false });

            if (status && status !== 'all') {
                query = query.eq('status', status);
            }
            if (search && search.trim()) {
                query = query.ilike('title', `%${search.trim()}%`);
            }

            const { data, error, count } = await query;

            if (error) {
                return res.status(500).json({ error: 'Failed to fetch posts', details: error.message });
            }

            return res.status(200).json({
                success: true,
                posts: data || [],
                total: count || 0
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Blog save API error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

async function pingSearchEngines(slug) {
    const postUrl = `https://www.creedv2.com/blog/${slug}`;
    const pings = [
        // IndexNow notifies participating search engines. Google discovers
        // updates through the sitemap/Search Console; its old ping endpoint
        // was retired and should not be treated as a successful submission.
        fetch('https://api.indexnow.org/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host: 'creedv2.com',
                key: 'creed2026indexnow',
                urlList: [postUrl, 'https://www.creedv2.com/blog']
            })
        }).catch(() => {}),
    ];

    await Promise.allSettled(pings);
    console.log(`Search engines pinged for: ${postUrl}`);
}
