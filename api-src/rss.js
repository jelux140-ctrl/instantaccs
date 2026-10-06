/* =========================================
   CREED - BLOG RSS FEED
   RSS 2.0 feed for blog syndication & indexing
   ========================================= */

import { createClient } from '@supabase/supabase-js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

function escXml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).send('Method not allowed');

    try {
        const supabase = getSupabaseClient();

        const { data: posts } = await supabase
            .from('blog_posts')
            .select('title, slug, meta_description, excerpt, category, author, published_at, content, tags')
            .eq('status', 'published')
            .not('published_at', 'is', null)
            .order('published_at', { ascending: false })
            .limit(50);

        const BASE = 'https://creedv2.com';
        const now = new Date().toUTCString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Creed Blog - Gaming Tips, Guides &amp; News</title>
    <link>${BASE}/blog</link>
    <description>Expert gaming tips, strategies, guides, and news from Creed. Level up your gameplay with insights on Fortnite, Valorant, Rust, Apex Legends, COD, and more.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${BASE}/api/rss" rel="self" type="application/rss+xml"/>
    <image>
      <url>${BASE}/assets/creedlogo.png</url>
      <title>Creed Blog</title>
      <link>${BASE}/blog</link>
    </image>
`;

        (posts || []).forEach(post => {
            const postUrl = `${BASE}/blog/${post.slug}`;
            const pubDate = new Date(post.published_at).toUTCString();
            const desc = post.meta_description || post.excerpt || '';
            const plainContent = (post.content || '').replace(/<[^>]*>/g, '').substring(0, 500);

            xml += `    <item>
      <title>${escXml(post.title)}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <dc:creator>${escXml(post.author || 'Creed Team')}</dc:creator>
      <category>${escXml(post.category || 'gaming')}</category>
      <description>${escXml(desc)}</description>
      <content:encoded><![CDATA[${post.content || ''}]]></content:encoded>
    </item>
`;
        });

        xml += `  </channel>
</rss>`;

        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
        return res.status(200).send(xml);

    } catch (err) {
        console.error('RSS feed error:', err);
        return res.status(500).send('Error generating RSS feed');
    }
}
