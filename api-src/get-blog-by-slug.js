/* =========================================
   CREED - GET SINGLE BLOG POST BY SLUG
   Returns full post content + increments view count
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
        const { slug } = req.query;
        if (!slug) {
            return res.status(400).json({ error: 'Slug is required' });
        }

        const supabase = getSupabaseClient();

        const { data: post, error } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('slug', slug)
            .eq('status', 'published')
            .single();

        if (error || !post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Increment view count (fire and forget)
        supabase
            .from('blog_posts')
            .update({ views: (post.views || 0) + 1 })
            .eq('id', post.id)
            .then(() => {});

        // Fetch related posts (same category, exclude current)
        const { data: related } = await supabase
            .from('blog_posts')
            .select('title, slug, excerpt, category, reading_time_minutes, published_at')
            .eq('status', 'published')
            .eq('category', post.category)
            .neq('id', post.id)
            .order('published_at', { ascending: false })
            .limit(3);

        res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');

        return res.status(200).json({
            post: post,
            related: related || []
        });
    } catch (error) {
        console.error('Get blog by slug error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
