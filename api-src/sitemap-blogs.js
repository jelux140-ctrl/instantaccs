/* =========================================
   CREED - DYNAMIC BLOG SITEMAP API
   Generates XML sitemap for blog posts
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

        const { data: posts, error } = await supabase
            .from('blog_posts')
            .select('slug, content, updated_at, published_at')
            .eq('status', 'published')
            .not('published_at', 'is', null)
            .order('published_at', { ascending: false });

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch posts' });
        }

        const BASE_URL = 'https://www.creedv2.com';

        const staticPages = [
            { url: '/', priority: '1.0', changefreq: 'weekly' },
            { url: '/products', priority: '0.9', changefreq: 'weekly' },
            { url: '/free-trial', priority: '0.8', changefreq: 'monthly' },
            { url: '/blog', priority: '0.9', changefreq: 'daily' },
            { url: '/status', priority: '0.7', changefreq: 'daily' },
            { url: '/vouches', priority: '0.7', changefreq: 'weekly' },
            { url: '/support', priority: '0.6', changefreq: 'monthly' },
            { url: '/product/universal-aim', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/fortnite', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/temp-spoofer', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/perm-spoofer', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/rust', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/cod-black-ops-7', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/arc-raiders', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/apex-legends', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/valorant', priority: '0.8', changefreq: 'weekly' },
            { url: '/product/rainbowsiege', priority: '0.8', changefreq: 'weekly' },
        ];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

        staticPages.forEach(page => {
            xml += `  <url>
    <loc>${BASE_URL}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
        });

        // Do not promote thin legacy AI pages to crawlers. They remain live for
        // visitors, but only substantive articles belong in the XML sitemap.
        const indexablePosts = (posts || []).filter((post) => {
            const words = String(post.content || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
            return words >= 900;
        });

        indexablePosts.forEach(post => {
            const lastmod = post.updated_at || post.published_at;
            xml += `  <url>
    <loc>${BASE_URL}/blog/${post.slug}</loc>
    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
        });

        xml += `</urlset>`;

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        return res.status(200).send(xml);

    } catch (error) {
        console.error('Sitemap error:', error);
        return res.status(500).json({ error: 'Failed to generate sitemap' });
    }
}
