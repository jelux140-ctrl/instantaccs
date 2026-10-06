/* =========================================
   CREED - SERVER-SIDE RENDERED BLOG POST
   Serves fully rendered HTML so search engine
   crawlers see complete meta tags, structured
   data, and article content without needing JS.
   ========================================= */

import { createClient } from '@supabase/supabase-js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).send('Method not allowed');

    const slug = (req.query.slug || '').trim();
    if (!slug) return res.redirect(302, '/blog');

    try {
        const supabase = getSupabaseClient();

        const { data: post, error } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('slug', slug)
            .eq('status', 'published')
            .single();

        if (error || !post) {
            return res.redirect(302, '/blog');
        }

        // Fetch related posts
        const { data: related } = await supabase
            .from('blog_posts')
            .select('title, slug, excerpt, category, reading_time_minutes, published_at')
            .eq('status', 'published')
            .eq('category', post.category)
            .neq('id', post.id)
            .order('published_at', { ascending: false })
            .limit(3);

        const postUrl = `https://www.creedv2.com/blog/${post.slug}`;
        const pubDate = formatDate(post.published_at);
        const tags = post.tags || [];
        const keywords = post.keywords || [];
        const wordCount = (post.content || '').replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w).length;
        // Keep thin legacy AI pages available to users without asking search
        // engines to index low-value, highly repetitive content.
        const robotsDirective = wordCount >= 900
            ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
            : 'noindex, follow';

        const articleSchema = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": post.title,
            "description": post.meta_description || post.excerpt,
            "datePublished": post.published_at,
            "dateModified": post.updated_at || post.published_at,
            "author": { "@type": "Organization", "name": "Creed", "url": "https://www.creedv2.com" },
            "publisher": {
                "@type": "Organization",
                "name": "Creed",
                "url": "https://www.creedv2.com",
                "logo": { "@type": "ImageObject", "url": "https://www.creedv2.com/assets/creedlogo.png" }
            },
            "mainEntityOfPage": { "@type": "WebPage", "@id": postUrl },
            "url": postUrl,
            "keywords": keywords.join(', '),
            "articleSection": post.category,
            "wordCount": wordCount,
            "inLanguage": "en-US"
        });

        const breadcrumbSchema = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.creedv2.com/" },
                { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.creedv2.com/blog" },
                { "@type": "ListItem", "position": 3, "name": post.title, "item": postUrl }
            ]
        });

        const relatedHtml = (related || []).length > 0 ? `
    <section class="related-section">
        <h3>Related Articles</h3>
        <div class="related-grid">
            ${(related || []).map(r => `
                <a href="/blog/${escHtml(r.slug)}" class="related-card">
                    <h4>${escHtml(r.title)}</h4>
                    <p>${r.reading_time_minutes || 5} min read &bull; ${escHtml(r.category || 'Gaming')}</p>
                </a>
            `).join('')}
        </div>
    </section>` : '';

        const tagsHtml = tags.length ? `
                        <div class="article-tags">
                            ${tags.map(t => `<a href="/blog?tag=${encodeURIComponent(t)}" class="article-tag">#${escHtml(t)}</a>`).join('')}
                        </div>` : '';

        const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(postUrl)}`;
        const redditShareUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(postUrl)}&title=${encodeURIComponent(post.title)}`;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-EJDCSEKBRW"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-EJDCSEKBRW');</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(post.title)} - Creed Blog</title>
    <meta name="description" content="${escHtml(post.meta_description || post.excerpt || '')}">
    <meta name="keywords" content="${escHtml(keywords.join(', '))}">
    <meta name="robots" content="${robotsDirective}">
    <meta name="author" content="${escHtml(post.author || 'Creed Team')}">
    <link rel="canonical" href="${postUrl}">
    <link rel="icon" type="image/png" href="/assets/creedlogo.png">
    <link rel="alternate" type="application/rss+xml" title="Creed Blog RSS" href="https://www.creedv2.com/api/rss">

    <meta property="og:type" content="article">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:title" content="${escHtml(post.title)}">
    <meta property="og:description" content="${escHtml(post.meta_description || post.excerpt || '')}">
    <meta property="og:image" content="https://www.creedv2.com/assets/creedembed.png">
    <meta property="og:site_name" content="Creed">
    <meta property="article:publisher" content="https://www.creedv2.com">
    <meta property="article:published_time" content="${post.published_at}">
    <meta property="article:modified_time" content="${post.updated_at || post.published_at}">
    <meta property="article:section" content="${escHtml(post.category)}">
    ${tags.map(t => `<meta property="article:tag" content="${escHtml(t)}">`).join('\n    ')}

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escHtml(post.title)}">
    <meta name="twitter:description" content="${escHtml(post.meta_description || post.excerpt || '')}">
    <meta name="twitter:image" content="https://www.creedv2.com/assets/creedembed.png">

    <script type="application/ld+json">${articleSchema}</script>
    <script type="application/ld+json">${breadcrumbSchema}</script>

    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* Blog article page - scoped with !important to override global styles.css */
        .blog-page-body {
            cursor: auto !important;
        }
        .blog-page-body * {
            cursor: auto !important;
        }
        .blog-page-body a, .blog-page-body button {
            cursor: pointer !important;
        }

        /* Kill global header styles bleeding into article-header */
        .article-header {
            position: static !important;
            z-index: auto !important;
            background: transparent !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            border: none !important;
            box-shadow: none !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
        }

        .article-wrapper {
            max-width: 780px;
            margin: 0 auto;
            padding: 160px 24px 80px;
            position: relative;
            z-index: 1;
        }

        /* Breadcrumbs */
        .breadcrumbs {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #555;
            margin-bottom: 32px;
            flex-wrap: wrap;
            font-family: 'Inter', sans-serif !important;
        }
        .breadcrumbs a {
            color: #777;
            text-decoration: none;
            transition: color 0.2s;
            font-family: 'Inter', sans-serif !important;
        }
        .breadcrumbs a:hover { color: #FFB800; }
        .breadcrumbs .sep { color: #333; user-select: none; }
        .breadcrumbs .current { color: #FFB800; font-weight: 500; }

        /* Article Header */
        .article-header {
            margin-bottom: 40px;
        }
        .article-category {
            display: inline-block;
            padding: 5px 14px;
            background: rgba(255, 184, 0, 0.1);
            border: 1px solid rgba(255, 184, 0, 0.15);
            border-radius: 20px;
            font-size: 11px !important;
            font-weight: 700 !important;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #FFB800;
            margin-bottom: 20px;
            font-family: 'Inter', sans-serif !important;
            line-height: 1 !important;
        }

        .article-header h1 {
            font-family: 'Space Grotesk', sans-serif !important;
            font-size: clamp(26px, 4.5vw, 40px) !important;
            font-weight: 700 !important;
            line-height: 1.25 !important;
            margin: 0 0 24px 0 !important;
            padding: 0 !important;
            color: #fff !important;
            letter-spacing: -0.5px;
            text-shadow: none !important;
            animation: none !important;
        }

        /* Article Meta */
        .article-meta {
            display: flex;
            align-items: center;
            gap: 20px;
            flex-wrap: wrap;
            font-size: 14px;
            color: #777;
            padding-bottom: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            font-family: 'Inter', sans-serif !important;
        }
        .article-meta-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .article-meta-item .material-symbols-outlined {
            font-size: 17px;
            color: #FFB800;
        }

        /* Article Content */
        .article-content {
            line-height: 1.85;
            font-size: 16.5px;
            color: #c8c8c8;
            font-family: 'Inter', sans-serif !important;
        }
        .article-content h2 {
            font-family: 'Space Grotesk', sans-serif !important;
            font-size: 26px !important;
            font-weight: 700 !important;
            color: #fff !important;
            margin: 52px 0 16px !important;
            padding: 0 !important;
            line-height: 1.3 !important;
            letter-spacing: -0.3px !important;
            text-shadow: none !important;
            animation: none !important;
        }
        .article-content h3 {
            font-family: 'Space Grotesk', sans-serif !important;
            font-size: 21px !important;
            font-weight: 600 !important;
            color: #eee !important;
            margin: 40px 0 12px !important;
            padding: 0 !important;
            line-height: 1.35 !important;
            animation: none !important;
        }
        .article-content p {
            margin: 0 0 20px 0;
        }
        .article-content a {
            color: #FFB800;
            text-decoration: underline;
            text-underline-offset: 3px;
            text-decoration-thickness: 1px;
        }
        .article-content a:hover { color: #FFD700; }
        .article-content ul, .article-content ol {
            margin: 16px 0 24px 28px;
            padding: 0;
        }
        .article-content li {
            margin-bottom: 10px;
            line-height: 1.75;
        }
        .article-content strong { color: #fff; font-weight: 600; }
        .article-content blockquote {
            border-left: 3px solid #FFB800;
            padding: 16px 24px;
            margin: 28px 0;
            background: rgba(255, 184, 0, 0.04);
            border-radius: 0 10px 10px 0;
            color: #aaa;
            font-style: italic;
        }
        .article-content pre {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 20px;
            overflow-x: auto;
            margin: 28px 0;
            font-size: 14px;
        }
        .article-content code {
            background: rgba(255, 184, 0, 0.08);
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 14px;
            color: #FFB800;
        }
        .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: 12px;
            margin: 28px 0;
        }

        /* Tags */
        .article-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 32px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            margin-top: 48px;
        }
        .article-tag {
            padding: 6px 14px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            font-size: 13px;
            color: #888;
            text-decoration: none;
            transition: all 0.2s;
            font-family: 'Inter', sans-serif !important;
        }
        .article-tag:hover {
            border-color: rgba(255, 184, 0, 0.3);
            color: #FFB800;
        }

        /* Share */
        .share-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 24px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .share-bar > span { font-size: 14px; color: #666; font-family: 'Inter', sans-serif; }
        .share-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #888;
            font-size: 16px;
            transition: all 0.2s;
            text-decoration: none;
        }
        .share-btn:hover { border-color: rgba(255, 184, 0, 0.3); color: #FFB800; }

        /* Related */
        .related-section {
            max-width: 780px;
            margin: 0 auto;
            padding: 0 24px 80px;
        }
        .related-section h3 {
            font-family: 'Space Grotesk', sans-serif !important;
            font-size: 22px !important;
            color: #fff !important;
            margin-bottom: 20px !important;
            font-weight: 600 !important;
        }
        .related-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
        }
        .related-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 20px;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s;
        }
        .related-card:hover { border-color: rgba(255, 184, 0, 0.2); transform: translateY(-2px); }
        .related-card h4 {
            font-size: 15px !important;
            color: #fff !important;
            margin-bottom: 8px !important;
            line-height: 1.4 !important;
            font-weight: 600 !important;
        }
        .related-card p { font-size: 13px; color: #666; margin: 0; }

        /* Mobile */
        @media (max-width: 768px) {
            .article-wrapper {
                padding: 120px 16px 60px;
            }
            .article-header h1 {
                font-size: 24px !important;
                line-height: 1.3 !important;
                margin-bottom: 18px !important;
            }
            .article-content h2 {
                font-size: 22px !important;
                margin: 36px 0 12px !important;
            }
            .article-content h3 {
                font-size: 18px !important;
                margin: 28px 0 10px !important;
            }
            .article-content {
                font-size: 15px;
                line-height: 1.75;
            }
            .article-meta {
                gap: 12px;
                font-size: 13px;
            }
            .breadcrumbs {
                font-size: 12px;
                margin-bottom: 24px;
            }
            .share-bar {
                flex-wrap: wrap;
                gap: 8px;
            }
            .related-grid {
                grid-template-columns: 1fr;
                gap: 12px;
            }
            .related-section {
                padding: 0 16px 60px;
            }
            .article-tags {
                margin-top: 32px;
                padding-top: 24px;
            }
        }

        @media (max-width: 480px) {
            .article-wrapper {
                padding: 110px 14px 48px;
            }
            .article-header h1 {
                font-size: 22px !important;
            }
            .article-meta {
                gap: 8px;
                font-size: 12px;
            }
            .article-meta-item .material-symbols-outlined {
                font-size: 15px;
            }
        }
    </style>
</head>
<body class="blog-page-body">
    <canvas id="bg-canvas"></canvas>
    <div id="cursor"></div>
    <div id="cursor-blur"></div>

    <header class="fade-in visible">
        <nav class="navbar glass-panel">
            <div class="logo"><img src="/assets/navlogo.png" alt="Creed Logo" class="logo-image"></div>
            <div class="nav-links">
                <a href="/"><i class="fas fa-home"></i> Home</a>
                <a href="/products"><i class="fas fa-box"></i> Products</a>
                <a href="/free-trial"><i class="fas fa-gamepad"></i> Free Trial</a>
                <a href="/support#faq"><i class="fas fa-circle-question"></i> FAQ</a>
                <a href="/status"><i class="fas fa-server"></i> Status</a>
                <a href="/vouches"><i class="fas fa-star"></i> Reviews</a>
                <a href="/support"><i class="fas fa-headset"></i> Support</a>
            </div>
            <div class="nav-icons">
                <a href="https://discord.gg/creedgg" target="_blank" class="icon-btn"><i class="fab fa-discord" style="font-size:20px"></i></a>
                <div class="icon-btn" id="cart-icon" style="position:relative;cursor:pointer">
                    <span class="material-symbols-outlined" style="font-size:20px">local_mall</span>
                    <span class="cart-badge" id="cart-badge" style="display:none">0</span>
                </div>
                <button class="hamburger-menu icon-btn" id="hamburger-menu" aria-label="Menu">
                    <span class="hamburger-line"></span><span class="hamburger-line"></span><span class="hamburger-line"></span>
                </button>
            </div>
        </nav>
        <div class="mobile-menu" id="mobile-menu">
            <div class="mobile-menu-content">
                <a href="/" class="mobile-menu-link"><i class="fas fa-home"></i> Home</a>
                <a href="/products" class="mobile-menu-link"><i class="fas fa-box"></i> Products</a>
                <a href="/free-trial" class="mobile-menu-link"><i class="fas fa-gamepad"></i> Free Trial</a>
                <a href="/support#faq" class="mobile-menu-link"><i class="fas fa-circle-question"></i> FAQ</a>
                <a href="/status" class="mobile-menu-link"><i class="fas fa-server"></i> Status</a>
                <a href="/vouches" class="mobile-menu-link"><i class="fas fa-star"></i> Reviews</a>
                <a href="/support" class="mobile-menu-link"><i class="fas fa-headset"></i> Support</a>
                <a href="https://discord.gg/creedgg" target="_blank" class="mobile-menu-link mobile-menu-discord"><i class="fab fa-discord"></i><span>Discord Server</span></a>
            </div>
        </div>
    </header>

    <article class="article-wrapper" itemscope itemtype="https://schema.org/Article">
        <div class="breadcrumbs" role="navigation" aria-label="Breadcrumb">
            <a href="/">Home</a><span class="sep">/</span>
            <a href="/blog">Blog</a><span class="sep">/</span>
            <span class="current">${escHtml(post.title)}</span>
        </div>
        <div class="article-header">
            <span class="article-category">${escHtml(post.category || 'gaming')}</span>
            <h1 itemprop="headline">${escHtml(post.title)}</h1>
            <div class="article-meta">
                <div class="article-meta-item">
                    <span class="material-symbols-outlined">person</span>
                    <span itemprop="author">${escHtml(post.author || 'Creed Team')}</span>
                </div>
                <div class="article-meta-item">
                    <span class="material-symbols-outlined">calendar_today</span>
                    <time itemprop="datePublished" datetime="${post.published_at}">${pubDate}</time>
                </div>
                <div class="article-meta-item">
                    <span class="material-symbols-outlined">schedule</span>
                    ${post.reading_time_minutes || 5} min read
                </div>
                <div class="article-meta-item">
                    <span class="material-symbols-outlined">visibility</span>
                    ${((post.views || 0) + 1).toLocaleString()} views
                </div>
            </div>
        </div>
        <div class="article-content" itemprop="articleBody">
            ${post.content}
        </div>
        ${tagsHtml}
        <div class="share-bar">
            <span>Share:</span>
            <a href="${twitterShareUrl}" target="_blank" rel="noopener" class="share-btn" aria-label="Share on Twitter"><i class="fab fa-twitter"></i></a>
            <a href="${redditShareUrl}" target="_blank" rel="noopener" class="share-btn" aria-label="Share on Reddit"><i class="fab fa-reddit-alien"></i></a>
            <button class="share-btn" onclick="navigator.clipboard.writeText('${postUrl}')" aria-label="Copy link">
                <span class="material-symbols-outlined" style="font-size:16px">link</span>
            </button>
        </div>
    </article>

    ${relatedHtml}

    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="footer-column footer-column-brand">
                    <div class="footer-brand"><img src="/assets/creedlogo.png" alt="Creed Logo" class="footer-logo"><h3>CREED</h3></div>
                    <p class="footer-description">Creed is a trusted provider of premium gaming software and enhancement tools, built for players who demand performance, reliability and consistency. Every release is maintained with stability, security and long-term compatibility in mind.</p>
                    <p class="footer-description">Instant access after purchase, frequent updates to match the latest game patches, and responsive 24/7 support — so you spend your time playing, not troubleshooting.</p>
                    <div class="footer-trust">
                        <span class="footer-trust-chip"><i class="fas fa-shield-halved"></i> Secure</span>
                        <span class="footer-trust-chip"><i class="fas fa-eye-slash"></i> Undetected</span>
                        <span class="footer-trust-chip"><i class="fas fa-headset"></i> 24/7 Support</span>
                    </div>
                </div>
                <div class="footer-column">
                    <h4>Quick Links</h4>
                    <ul class="footer-links">
                        <li><a href="/"><i class="fas fa-house"></i>Home</a></li>
                        <li><a href="/products"><i class="fas fa-box"></i>Products</a></li>
                        <li><a href="/free-trial"><i class="fas fa-gamepad"></i>Free Trial</a></li>
                        <li><a href="/faq"><i class="fas fa-circle-question"></i>FAQ</a></li>
                        <li><a href="/blog"><i class="fas fa-newspaper"></i>Blog</a></li>
                        <li><a href="/status"><i class="fas fa-server"></i>Status</a></li>
                        <li><a href="/vouches"><i class="fas fa-star"></i>Reviews</a></li>
                        <li><a href="/support"><i class="fas fa-headset"></i>Support</a></li>
                    </ul>
                </div>
                <div class="footer-column">
                    <h4>Products</h4>
                    <ul class="footer-links">
                        <li><a href="/product/fortnite"><i class="fas fa-gamepad"></i>Fortnite</a></li>
                        <li><a href="/product/valorant"><i class="fas fa-crosshairs"></i>Valorant</a></li>
                        <li><a href="/product/rust"><i class="fas fa-hammer"></i>Rust</a></li>
                        <li><a href="/product/apex-legends"><i class="fas fa-bolt"></i>Apex Legends</a></li>
                        <li><a href="/product/rainbowsiege"><i class="fas fa-shield-halved"></i>Rainbow Six Siege</a></li>
                        <li><a href="/product/cod-black-ops-7"><i class="fas fa-burst"></i>Call of Duty Black Ops</a></li>
                        <li><a href="/product/arc-raiders"><i class="fas fa-meteor"></i>ARC Raiders</a></li>
                        <li><a href="/product/temp-spoofer"><i class="fas fa-microchip"></i>HWID Spoofer</a></li>
                    </ul>
                </div>
                <div class="footer-column">
                    <h4>Support</h4>
                    <ul class="footer-links">
                        <li><a href="https://discord.gg/creedgg" target="_blank" rel="noopener noreferrer"><i class="fab fa-discord"></i>Discord Server</a></li>
                        <li><a href="/portal"><i class="fas fa-user-shield"></i>Customer Portal</a></li>
                        <li><a href="/support"><i class="fas fa-headset"></i>Contact Support</a></li>
                        <li><a href="/status"><i class="fas fa-server"></i>System Status</a></li>
                    </ul>
                </div>
            </div>

            <div class="footer-newsletter">
                <div class="footer-newsletter-copy">
                    <h4>Get <span>5%</span> off your first order</h4>
                    <p>Subscribe for updates, new releases and an instant welcome coupon.</p>
                </div>
                <form class="footer-newsletter-form" id="footer-newsletter" novalidate>
                    <input type="email" name="email" placeholder="Enter your email" aria-label="Email address" required>
                    <button type="submit" class="btn btn-primary">Subscribe</button>
                </form>
                <p class="footer-newsletter-msg" id="footer-newsletter-msg" role="status" hidden></p>
            </div>

            <div class="footer-bottom">
                <div class="footer-bottom-content">
                    <p>&copy; 2026 Creed. All rights reserved. | Number 1 Cheat Provider</p>
                    <div class="footer-bottom-right">
                        <a href="/faq">FAQ</a>
                        <a href="/support">Support</a>
                        <span class="footer-status"><span class="footer-status-dot"></span> All Systems Online</span>
                    </div>
                </div>
            </div>
        </div>
    </footer>

    <div id="cart-modal" class="cart-modal">
        <div id="cart-overlay" class="cart-overlay"></div>
        <div class="cart-content-wrapper">
            <div class="cart-header"><h2>Shopping Cart</h2><button id="close-cart" class="cart-close-btn"><span class="material-symbols-outlined">close</span></button></div>
            <div id="cart-empty" class="cart-empty" style="display:none"><span class="material-symbols-outlined">shopping_bag</span><p>Your cart is empty</p><a href="/products" class="btn btn-primary">Browse Products</a></div>
            <div id="cart-content" class="cart-content">
                <div id="cart-items" class="cart-items"></div>
                <div class="cart-footer">
                    <div class="cart-coupon-section"><div class="coupon-input-group"><input type="text" id="coupon-code-input" class="coupon-input" placeholder="Enter coupon code" maxlength="10"><button id="apply-coupon-btn" class="btn btn-secondary btn-coupon">Apply</button></div><div id="coupon-message" class="coupon-message"></div></div>
                    <div class="cart-total-section"><div id="cart-subtotal" class="cart-subtotal" style="display:none"><span class="cart-total-label">Subtotal:</span><span id="cart-subtotal-amount" class="cart-total-amount">$0.00</span></div><div id="cart-discount" class="cart-discount" style="display:none"><span class="cart-total-label">Discount:</span><span id="cart-discount-amount" class="cart-discount-amount">-$0.00</span></div><div class="cart-total-row"><span class="cart-total-label">Total:</span><span id="cart-total" class="cart-total-amount">$0.00</span></div></div>
                    <button id="cart-checkout" class="btn btn-primary btn-checkout">Proceed to Checkout</button>
                </div>
            </div>
        </div>
    </div>

    <script src="/cart.js"></script>
    <script src="/script.js"></script>
    <script>
        (() => {
            const key = ${JSON.stringify(`creed_blog_view_${post.slug}`)};
            if (sessionStorage.getItem(key)) return;
            fetch('/api/blog-view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: ${JSON.stringify(post.slug)} }),
                keepalive: true
            }).then((response) => {
                if (response.ok) sessionStorage.setItem(key, '1');
            }).catch(() => {});
        })();
    </script>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
        return res.status(200).send(html);

    } catch (err) {
        console.error('Blog SSR error:', err);
        return res.redirect(302, '/blog');
    }
}
