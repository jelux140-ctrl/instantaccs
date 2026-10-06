/* =========================================
   CREED - AI BLOG GENERATOR API
   Generates SEO-optimized blog posts using Google Gemini
   ========================================= */

console.log('generate-blog.js: module loading');

import { createClient } from '@supabase/supabase-js';

console.log('generate-blog.js: imports done');

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 80);
}

function estimateReadingTime(html) {
    const text = html.replace(/<[^>]*>/g, '');
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    return Math.max(1, Math.ceil(words / 220));
}

function contentWordCount(html) {
    return String(html || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
}

function titleTokens(title) {
    return new Set(String(title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', '2026'].includes(word)));
}

function titleSimilarity(a, b) {
    const left = titleTokens(a);
    const right = titleTokens(b);
    if (!left.size || !right.size) return 0;
    const shared = [...left].filter((word) => right.has(word)).length;
    return shared / new Set([...left, ...right]).size;
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    console.log('generate-blog.js: handler called', req.method, req.url);
    console.log('generate-blog.js: content-type:', req.headers?.['content-type']);
    cors(res);
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        console.log('generate-blog.js: rejected method', req.method);
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const authToken = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    if (!ADMIN_TOKEN || (authToken !== `Bearer ${ADMIN_TOKEN}` && authToken !== ADMIN_TOKEN)) {
        console.log('generate-blog.js: auth failed, token present:', !!authToken);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('generate-blog.js: auth OK');

    try {
        // Parse body safely
        let parsedBody = req.body;
        if (typeof parsedBody === 'string') {
            try { parsedBody = JSON.parse(parsedBody); } catch (e) {
                console.error('generate-blog.js: body parse failed:', e.message, 'raw:', String(parsedBody).substring(0, 200));
                return res.status(400).json({ error: 'Invalid JSON body' });
            }
        }
        if (!parsedBody || typeof parsedBody !== 'object') {
            console.error('generate-blog.js: body is empty/invalid, type:', typeof parsedBody);
            return res.status(400).json({ error: 'Request body is required (JSON with "topic" field)' });
        }
        console.log('generate-blog.js: body keys:', Object.keys(parsedBody));

        const { topic, category = 'gaming', tone = 'professional', autoPublish = false } = parsedBody;

        if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
            console.log('generate-blog.js: topic missing or invalid, got:', typeof topic, topic);
            return res.status(400).json({ error: 'Topic is required' });
        }
        console.log('generate-blog.js: topic:', topic.trim().substring(0, 80), '| category:', category, '| tone:', tone, '| autoPublish:', autoPublish);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
        console.log('generate-blog.js: GEMINI_API_KEY present:', !!GEMINI_API_KEY, '| SUPABASE_URL present:', !!process.env.SUPABASE_URL);

        // Gemini models to try (in priority order)
        const MODELS_TO_TRY = [
            'gemini-2.5-pro',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
        ];

        const systemPrompt = `You are an expert SEO content writer for Creed, a premium gaming enhancement provider. Your blog posts drive organic search traffic and establish authority in the gaming community.

BRAND CONTEXT:
- Creed provides gaming enhancement software for games like Fortnite, Valorant, Rust, Apex Legends, Call of Duty, Rainbow Six Siege, and ARC Raiders
- Products include aimbots, ESP, wallhacks, HWID spoofers
- Never invent detection-rate percentages, test results, customer counts, rankings, or guarantees
- Website: creedv2.com
- Discord: https://discord.gg/creedgg

SEO REQUIREMENTS:
- Write naturally for humans first, search engines second
- Use the primary keyword in the title, first paragraph, and 2-3 subheadings
- Cover the searcher's actual question completely; use related terms naturally
- Write engaging meta descriptions under 155 characters
- Structure with H2 and H3 subheadings for featured snippets
- Include internal link opportunities (mention products naturally)
- Write 1200-1800 substantive words. Do not pad with generic filler
- Use short paragraphs (2-3 sentences max) for readability
- Include bullet points and numbered lists where appropriate
- Add a compelling introduction that hooks the reader
- End with a clear conclusion and subtle call-to-action
- Choose one specific search intent and answer it. Do not write a generic overview
- Avoid templated titles such as "X Cheats in 2026", "Staying Undetected and Competitive", "Ultimate Guide", "Competitive Edge", or "Future of Gaming"
- Include concrete setup advice, comparisons, limitations, and decision criteria that are specific to the topic
- Do not claim that cheats are risk-free or guaranteed undetected; explain that game updates and anti-cheat changes always create risk

CREED PRODUCT CATALOG (use these exact URLs for internalLinks - never invent a slug):
- Universal Aim (AI aimbot: vision-based, works across titles, triggerbot, RCS, ESP, Arduino/MAKCU) -> /product/universal-aim
- Fortnite Public cheat -> /product/fortnite
- Valorant cheat -> /product/valorant
- Rust cheat -> /product/rust
- Apex Legends cheat -> /product/apex-legends
- ARC Raiders cheat -> /product/arc-raiders
- Call of Duty Black Ops / Warzone cheat -> /product/cod-black-ops-7
- Rainbow Six Siege cheat -> /product/rainbowsiege
- Temporary HWID spoofer -> /product/temp-spoofer
- Permanent HWID spoofer -> /product/perm-spoofer
- Game accounts with skins (Fortnite, Valorant, Apex, R6, Warzone) -> /products?filter=accounts
- Full catalogue -> /products

PRODUCT ACCURACY (do not get these wrong):
- Universal Aim is an AI aimbot driven by a vision model. It reads the SCREEN, not game memory, which is why it runs on virtually any title without a per-game build. Features: adjustable FOV, confidence thresholds, humanised movement (Bezier / Windmouse), triggerbot, recoil control (RCS), player ESP, Arduino and MAKCU hardware mouse support.
- A spoofer resets HARDWARE identifiers (disk, SMBIOS/UUID, MAC). It NEVER unbans, restores or recovers a banned ACCOUNT - the player returns on a new account.
- Game accounts are real accounts sold with full email access; they are not cheats and have no cheat features.

CONTENT GUIDELINES:
- Focus on gaming tips, guides, news, strategies, and community topics
- Be informative and genuinely helpful
- Subtly reference Creed products where natural (don't be overly promotional)
- Use a ${tone} tone
- Category: ${category}

You MUST respond with ONLY valid JSON (no markdown code fences, no extra text). Use this exact schema:
{
    "title": "SEO-optimized title (50-60 chars ideal)",
    "metaDescription": "Compelling meta description under 155 chars",
    "keywords": ["primary keyword", "secondary keyword", "long-tail keyword", "...more"],
    "excerpt": "2-3 sentence preview for blog listing cards",
    "content": "<article HTML content with h2, h3, p, ul, ol, strong, em tags - NO h1 tag>",
    "category": "${category}",
    "tags": ["tag1", "tag2", "tag3"],
    "featuredImageAlt": "Descriptive alt text for featured image",
    "internalLinks": [{"text": "anchor text", "url": "/product/universal-aim"}]
}`;

        const userPrompt = `Write a comprehensive, SEO-optimized blog post about: "${topic.trim()}"

Respond with ONLY the JSON object, nothing else.`;

        let geminiData = null;
        let lastError = '';

        for (const model of MODELS_TO_TRY) {
            console.log(`Trying model: ${model}`);

            const requestBody = {
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
                ],
                generationConfig: {
                    temperature: 0.8,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json',
                }
            };

            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    }
                );

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`Model ${model} failed (${response.status}):`, errText);
                    lastError = `${model}: ${response.status} - ${errText}`;
                    continue;
                }

                geminiData = await response.json();

                if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    console.log(`Success with model: ${model}`);
                    break;
                } else {
                    console.error(`Model ${model} returned empty response`);
                    lastError = `${model}: empty response`;
                    geminiData = null;
                }
            } catch (fetchErr) {
                console.error(`Model ${model} fetch error:`, fetchErr.message);
                lastError = `${model}: ${fetchErr.message}`;
            }
        }

        if (!geminiData) {
            console.error('generate-blog.js: ALL MODELS FAILED. Last error:', lastError);
            return res.status(500).json({
                error: 'All Gemini models failed to generate blog content',
                details: lastError
            });
        }

        console.log('generate-blog.js: Gemini succeeded, processing response...');
        return await processGeminiResponse(geminiData, topic, category, autoPublish, res);

    } catch (error) {
        console.error('generate-blog.js: UNHANDLED ERROR:', error.message);
        console.error('generate-blog.js: Stack:', error.stack);
        return res.status(500).json({
            error: 'Blog generation failed',
            message: error.message,
            stage: 'handler'
        });
    }
}

async function processGeminiResponse(geminiData, topic, category, autoPublish, res) {
    console.log('processGeminiResponse: starting');
    if (!geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
        const reason = geminiData.candidates?.[0]?.finishReason || 'unknown';
        console.error('processGeminiResponse: empty AI response, finishReason:', reason, JSON.stringify(geminiData).substring(0, 500));
        return res.status(500).json({ error: 'Empty response from AI', finishReason: reason });
    }

    const rawText = geminiData.candidates[0].content.parts[0].text;
    console.log('processGeminiResponse: rawText length:', rawText.length);
    let blogData;

    try {
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        blogData = JSON.parse(cleaned);
        console.log('processGeminiResponse: parsed blog JSON, title:', blogData.title?.substring(0, 60));
    } catch (parseError) {
        console.error('processGeminiResponse: JSON parse failed:', parseError.message);
        console.error('processGeminiResponse: raw (first 500 chars):', rawText.substring(0, 500));
        return res.status(500).json({
            error: 'Failed to parse AI response as JSON',
            parseError: parseError.message,
            raw: rawText.substring(0, 1000)
        });
    }

    const slug = generateSlug(blogData.title || topic);
    const readingTime = estimateReadingTime(blogData.content || '');

    // Process internal links into the content
    let processedContent = blogData.content || '';
    if (blogData.internalLinks && Array.isArray(blogData.internalLinks)) {
        blogData.internalLinks.forEach(link => {
            if (link.text && link.url) {
                const linkRegex = new RegExp(`(?<!<a[^>]*>)(${link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?!</a>)`, 'gi');
                processedContent = processedContent.replace(linkRegex,
                    `<a href="${link.url}" class="blog-internal-link">$1</a>`
                );
            }
        });
    }

    const postData = {
        title: blogData.title || topic,
        slug: slug,
        meta_description: (blogData.metaDescription || '').substring(0, 155),
        keywords: blogData.keywords || [],
        content: processedContent,
        excerpt: blogData.excerpt || '',
        category: blogData.category || category,
        tags: blogData.tags || [],
        featured_image_alt: blogData.featuredImageAlt || blogData.title,
        author: 'Creed Team',
        status: 'draft',
        reading_time_minutes: readingTime,
        published_at: null
    };

    let supabase;
    try {
        supabase = getSupabaseClient();
        console.log('processGeminiResponse: supabase client created');
    } catch (e) {
        console.error('processGeminiResponse: supabase init failed:', e.message);
        return res.status(500).json({ error: 'Database connection failed', message: e.message, stage: 'supabase-init' });
    }

    const qualityIssues = [];
    const words = contentWordCount(processedContent);
    const h2Count = (processedContent.match(/<h2\b/gi) || []).length;
    const internalLinkCount = (processedContent.match(/<a\s[^>]*href=["']\/(?:product|products)/gi) || []).length;
    if (words < 1200) qualityIssues.push(`Content is too thin (${words} words; minimum 1200)`);
    if (h2Count < 4) qualityIssues.push(`Needs at least 4 useful H2 sections (found ${h2Count})`);
    if (internalLinkCount < 2) qualityIssues.push(`Needs at least 2 relevant product links (found ${internalLinkCount})`);
    if (!postData.meta_description || postData.meta_description.length < 110) qualityIssues.push('Meta description must be 110-155 characters');

    const { data: existingTitles, error: titleError } = await supabase
        .from('blog_posts')
        .select('title')
        .eq('status', 'published')
        .limit(200);
    if (!titleError) {
        const closest = (existingTitles || [])
            .map((row) => ({ title: row.title, score: titleSimilarity(postData.title, row.title) }))
            .sort((a, b) => b.score - a.score)[0];
        if (closest?.score >= 0.62) {
            qualityIssues.push(`Title overlaps an existing article: "${closest.title}"`);
        }
    }

    const publishApproved = autoPublish && qualityIssues.length === 0;
    postData.status = publishApproved ? 'published' : 'draft';
    postData.published_at = publishApproved ? new Date().toISOString() : null;

    try {
        // Check for slug collision
        const { data: existing, error: slugCheckErr } = await supabase
            .from('blog_posts')
            .select('slug')
            .eq('slug', slug)
            .maybeSingle();

        if (slugCheckErr) {
            console.error('processGeminiResponse: slug check error:', slugCheckErr.message, slugCheckErr.code);
        }

        if (existing) {
            postData.slug = `${slug}-${Date.now().toString(36)}`;
            console.log('processGeminiResponse: slug collision, using:', postData.slug);
        }

        console.log('processGeminiResponse: saving post, slug:', postData.slug, 'status:', postData.status);
        const { data: savedPost, error: saveError } = await supabase
            .from('blog_posts')
            .insert([postData])
            .select()
            .single();

        if (saveError) {
            console.error('processGeminiResponse: SAVE FAILED:', saveError.message, saveError.code, saveError.details, saveError.hint);
            return res.status(500).json({
                error: 'Failed to save blog post to database',
                message: saveError.message,
                code: saveError.code,
                hint: saveError.hint || null,
                stage: 'supabase-insert'
            });
        }

        console.log('processGeminiResponse: post saved, id:', savedPost?.id);

        // Ping search engines if auto-published
        if (publishApproved && savedPost?.slug) {
            pingSearchEngines(savedPost.slug).catch((e) => console.error('pingSearchEngines failed:', e.message));
        }

        return res.status(200).json({
            success: true,
            post: savedPost,
            seoScore: calculateSeoScore(postData),
            publicationBlocked: autoPublish && !publishApproved,
            qualityIssues
        });
    } catch (dbError) {
        console.error('processGeminiResponse: DB ERROR:', dbError.message, dbError.stack);
        return res.status(500).json({
            error: 'Database operation failed',
            message: dbError.message,
            stage: 'database'
        });
    }
}

async function pingSearchEngines(slug) {
    const postUrl = `https://www.creedv2.com/blog/${slug}`;
    const pings = [
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

function calculateSeoScore(post) {
    let score = 0;
    const checks = [];

    if (post.title && post.title.length >= 30 && post.title.length <= 65) {
        score += 15;
        checks.push({ item: 'Title length', status: 'pass' });
    } else {
        checks.push({ item: 'Title length', status: 'warn', note: 'Should be 30-65 chars' });
        score += 5;
    }

    if (post.meta_description && post.meta_description.length >= 120 && post.meta_description.length <= 160) {
        score += 15;
        checks.push({ item: 'Meta description', status: 'pass' });
    } else {
        checks.push({ item: 'Meta description', status: 'warn', note: 'Should be 120-160 chars' });
        score += 5;
    }

    if (post.keywords && post.keywords.length >= 3) {
        score += 10;
        checks.push({ item: 'Keywords', status: 'pass' });
    } else {
        checks.push({ item: 'Keywords', status: 'warn', note: 'Need 3+ keywords' });
        score += 3;
    }

    if (post.content && post.content.includes('<h2')) {
        score += 10;
        checks.push({ item: 'H2 headings', status: 'pass' });
    } else {
        checks.push({ item: 'H2 headings', status: 'fail' });
    }

    if (post.content && post.content.includes('<h3')) {
        score += 5;
        checks.push({ item: 'H3 headings', status: 'pass' });
    }

    const wordCount = (post.content || '').replace(/<[^>]*>/g, '').split(/\s+/).length;
    if (wordCount >= 1200) {
        score += 15;
        checks.push({ item: 'Word count (1200+)', status: 'pass', note: `${wordCount} words` });
    } else if (wordCount >= 800) {
        score += 8;
        checks.push({ item: 'Word count', status: 'warn', note: `${wordCount} words (minimum 1200 to publish)` });
    } else {
        checks.push({ item: 'Word count', status: 'fail', note: `${wordCount} words` });
    }

    if (post.content && post.content.includes('blog-internal-link')) {
        score += 10;
        checks.push({ item: 'Internal links', status: 'pass' });
    } else {
        checks.push({ item: 'Internal links', status: 'warn' });
        score += 2;
    }

    if (post.excerpt) {
        score += 5;
        checks.push({ item: 'Excerpt', status: 'pass' });
    }

    if (post.slug && post.slug.length <= 60) {
        score += 10;
        checks.push({ item: 'URL slug', status: 'pass' });
    } else {
        score += 3;
        checks.push({ item: 'URL slug', status: 'warn', note: 'Keep under 60 chars' });
    }

    if (post.featured_image_alt) {
        score += 5;
        checks.push({ item: 'Image alt text', status: 'pass' });
    }

    return { score, maxScore: 100, checks };
}
