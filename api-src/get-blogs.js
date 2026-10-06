/* =========================================
   CREED - GET PUBLISHED BLOG POSTS API
   Public endpoint for blog listing page
   ========================================= */

import { createClient } from '@supabase/supabase-js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabaseClient();
        const { page = 1, limit = 12, category, tag, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabase
            .from('blog_posts')
            .select('id, title, slug, meta_description, excerpt, category, tags, featured_image_url, featured_image_alt, author, reading_time_minutes, views, published_at, created_at', { count: 'exact' })
            .eq('status', 'published')
            .not('published_at', 'is', null)
            .order('published_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (category) {
            query = query.eq('category', category);
        }
        if (tag) {
            query = query.contains('tags', [tag]);
        }
        if (search && search.trim()) {
            query = query.or(`title.ilike.%${search.trim()}%,excerpt.ilike.%${search.trim()}%`);
        }

        const { data, error, count } = await query;

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch posts', details: error.message });
        }

        // Set cache headers for CDN
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

        return res.status(200).json({
            posts: data || [],
            total: count || 0,
            page: parseInt(page),
            totalPages: Math.ceil((count || 0) / parseInt(limit)),
            hasMore: offset + parseInt(limit) < (count || 0)
        });
    } catch (error) {
        console.error('Get blogs error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
