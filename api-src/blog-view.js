import { createClient } from '@supabase/supabase-js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const slug = String(req.body?.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.length > 100) {
        return res.status(400).json({ error: 'Invalid blog slug' });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return res.status(503).json({ error: 'Database not configured' });

    try {
        const supabase = createClient(url, key);
        const { data: post, error: readError } = await supabase
            .from('blog_posts')
            .select('id, views')
            .eq('slug', slug)
            .eq('status', 'published')
            .maybeSingle();

        if (readError) throw readError;
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const { error: updateError } = await supabase
            .from('blog_posts')
            .update({ views: Math.max(0, Number(post.views) || 0) + 1 })
            .eq('id', post.id);

        if (updateError) throw updateError;
        res.setHeader('Cache-Control', 'no-store');
        return res.status(204).end();
    } catch (error) {
        console.error('Blog view tracking failed:', error.message);
        return res.status(500).json({ error: 'Could not record view' });
    }
}
