/* =========================================
   CREED — Review generation helpers
   Shared by the seeding cron and the one-off reseed script.

   Two jobs:
     1. Build believable gamer-style usernames IN CODE (never from the model,
        which kept producing real-person names like "jake.hudson").
     2. Ask Gemini for a BATCH of reviews at once and force them to differ
        from one another — batching is what actually kills the repetition.
   ========================================= */

/* ---------- Product catalogue (must mirror the storefront) ---------- */
export const PRODUCT_CATALOG = [
    { product: 'Fortnite', short: 'Fortnite', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'Valorant', short: 'Valorant', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'Rust', short: 'Rust', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'Apex Legends', short: 'Apex', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'Rainbow Six Siege', short: 'R6', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'COD Black Ops 7', short: 'CoD', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'ARC Raiders', short: 'ARC', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'Temp Spoofer', short: 'HWID', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'Perm Spoofer', short: 'HWID', variants: ['One-Time Usage', 'Lifetime Usage'] },
    { product: 'Universal Aim', short: 'AI aim', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
    { product: 'Fortnite Skin Account', short: 'FN acc', variants: ['Account'] },
    { product: 'Valorant Skin Account', short: 'Val acc', variants: ['Account'] },
    { product: 'Apex Legends Skin Account', short: 'Apex acc', variants: ['Account'] },
    { product: 'Rainbow Six Skin Account', short: 'R6 acc', variants: ['Account'] },
    { product: 'Warzone Skin Account', short: 'WZ acc', variants: ['Account'] },
];

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function pickProduct() {
    const entry = pick(PRODUCT_CATALOG);
    return {
        product: entry.product,
        short: entry.short,
        variant: pick(entry.variants),
    };
}

/* ---------- Username generation ----------
   Deliberately avoids first/last names. These are built from neutral
   word fragments the way real gamer handles are. */

const WORDS_A = [
    'void', 'frost', 'lucid', 'murky', 'hazy', 'stale', 'feral', 'cozy', 'damp', 'rusty',
    'vivid', 'bleak', 'slick', 'grim', 'numb', 'plush', 'brisk', 'moody', 'silky', 'grainy',
    'muted', 'crisp', 'foggy', 'salty', 'sleepy', 'quiet', 'zesty', 'faint', 'blunt', 'wired',
    'glassy', 'velvet', 'amber', 'cobalt', 'ashen', 'ivory', 'onyx', 'sable', 'mellow', 'sour',
];

const WORDS_B = [
    'moth', 'fern', 'clay', 'pine', 'koi', 'lynx', 'vex', 'atlas', 'comet', 'drift',
    'ember', 'flux', 'gale', 'halo', 'iris', 'juno', 'kilo', 'lumen', 'mesa', 'nomad',
    'orbit', 'petal', 'quartz', 'ridge', 'sonar', 'tide', 'umbra', 'vapor', 'willow', 'zephyr',
    'basin', 'cinder', 'dune', 'echo', 'fjord', 'grove', 'harbor', 'inlet', 'jetty', 'knoll',
];

const SHORTS = [
    'zq', 'kx', 'nv', 'ry', 'tz', 'wq', 'yv', 'bz', 'dk', 'fj',
    'hq', 'gg', 'tv', 'exe', 'ttv', 'hs', 'og', 'xd', 'uwu', 'rn',
];

const ABSTRACT = [
    'qwynn', 'brixx', 'zeph', 'oduu', 'nyloh', 'kaido', 'sylo', 'vexa', 'muro', 'tavi',
    'renzo', 'oleander', 'wisp', 'crux', 'lorn', 'perl', 'axil', 'brume', 'cael', 'dorn',
    'eryn', 'fable', 'gwil', 'hollo', 'ivo', 'jorm', 'kepp', 'lume', 'morr', 'nixel',
];

const PREFIX = ['not', 'its', 'imm', 'real', 'just', 'only', 'prod', 'lil', 'big', 'yo'];

function leet(word) {
    return word
        .replace(/i/g, () => (Math.random() < 0.6 ? '1' : 'i'))
        .replace(/o/g, () => (Math.random() < 0.5 ? '0' : 'o'))
        .replace(/e/g, () => (Math.random() < 0.35 ? '3' : 'e'));
}

function digits() {
    const styles = [
        () => String(randInt(2, 99)),
        () => String(randInt(100, 999)),
        () => String(randInt(0, 9)).repeat(randInt(2, 3)),
        () => String(randInt(10, 31)),
    ];
    return pick(styles)();
}

const USERNAME_PATTERNS = [
    // vexx21 / drift404
    () => pick(WORDS_B) + digits(),
    // coldmoth / voidkoi
    () => pick(WORDS_A) + pick(WORDS_B),
    // notkaido / itsdrift
    () => pick(PREFIX) + pick(ABSTRACT),
    // grey_pine
    () => pick(WORDS_A) + '_' + pick(WORDS_B),
    // vex.hq / koi.gg
    () => pick(WORDS_B) + '.' + pick(SHORTS),
    // m1lky / sn0wy
    () => leet(pick(WORDS_B)),
    // kaidoo / auraaa
    () => { const w = pick(ABSTRACT); return w + w.slice(-1).repeat(randInt(1, 3)); },
    // qwynn / brixx
    () => pick(ABSTRACT),
    // zephyr_07
    () => pick(WORDS_B) + '_' + digits(),
    // ttvdrift / oghalo
    () => pick(SHORTS) + pick(WORDS_B),
    // driftxflux
    () => pick(WORDS_B) + 'x' + pick(WORDS_B),
    // ember.22
    () => pick(WORDS_B) + '.' + digits(),
];

/**
 * Build a username that does not collide with anything in `taken`.
 * @param {Set<string>} taken lowercase usernames already in use
 */
export function generateUsername(taken = new Set()) {
    for (let attempt = 0; attempt < 60; attempt++) {
        let name = pick(USERNAME_PATTERNS)();
        name = name.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
        if (name.length < 3) continue;
        if (taken.has(name)) continue;
        taken.add(name);
        return name;
    }
    // Extremely unlikely fallback
    const fallback = pick(ABSTRACT) + digits() + randInt(10, 99);
    taken.add(fallback);
    return fallback;
}

/* ---------- Content generation ---------- */

// Phrases the model has overused before — explicitly forbidden now.
const BANNED_PHRASES = [
    /* False claims: a spoofer resets HWID/hardware identifiers, it does NOT
       unban an account. These are filtered out even if the model ignores the
       accuracy rules in the prompt. */
    'unbanned my account',
    'unban my account',
    'account unbanned',
    'got me back on my main',
    'back on my main',
    'got my account back',
    'got my acc back',
    'recovered my account',
    'restored my account',
    'ban lifted',
    'lifted my ban',
    'removed my ban',
    'unbanned me',

    'was skeptical at first',
    'skeptical at first',
    'then it clicked',
    'it clicked',
    'game changer',
    'game-changer',
    'worth every penny',
    'highly recommend',
    'would recommend',
    '10/10',
    'hands down',
    'not gonna lie',
    'to be honest',
    'let me start',
    'no complaints here',
    'exceeded my expectations',
    'blown away',
    'like a charm',
    'worth it',
    'do the job',
    'does the job',
    'no issues so far',
];

export function looksRepetitive(content) {
    const c = String(content || '').toLowerCase();
    return BANNED_PHRASES.some((p) => c.includes(p));
}

/* Max characters allowed for each review style. A real reviews page is not
   uniform — most people drop a one-liner, but every few reviews someone writes
   a proper considered paragraph. Generating only short ones read as flat. */
export const STYLE_LIMITS = { short: 135, detailed: 620 };

/**
 * Decide which reviews in a batch are long-form.
 *
 * Runs of two or three short vouches, then one detailed write-up, repeating.
 * The run length varies so the rhythm never becomes an obvious pattern.
 */
export function assignStyles(count, startAt = 0) {
    const styles = [];
    let sinceDetailed = startAt % 4;
    for (let i = 0; i < count; i++) {
        const run = 2 + Math.floor(Math.random() * 2); // 2 or 3 short between long ones
        if (sinceDetailed >= run) {
            styles.push('detailed');
            sinceDetailed = 0;
        } else {
            styles.push('short');
            sinceDetailed++;
        }
    }
    return styles;
}

export function buildBatchPrompt(items) {
    const lines = items
        .map((it, i) => `${i + 1}. product="${it.product}", plan="${it.variant}" -> ${
            it.style === 'detailed' ? 'DETAILED review' : 'SHORT vouch'}`)
        .join('\n');

    const detailedCount = items.filter((it) => it.style === 'detailed').length;
    const shortCount = items.length - detailedCount;

    return `You write short, believable customer reviews for Creed (creedv2.com), a game enhancement / cheat provider. They appear in a reviews grid on the site.

Write EXACTLY ${items.length} reviews, one for each line below. Use the given product and plan for that review:
${lines}

THE SINGLE MOST IMPORTANT RULE: all ${items.length} reviews must read like ${items.length} completely different human beings wrote them. Vary sentence length, vocabulary, capitalisation, punctuation, structure and mood. If two reviews could be swapped without anyone noticing, you have failed.

VOICE: young gamers dropping a quick vouch in a Discord channel. NOT customers writing a product review. Think 16-24 year olds typing fast on their phone between matches.

TWO KINDS OF REVIEW — the list above marks which each one must be. ${shortCount} are SHORT, ${detailedCount} are DETAILED. Getting this wrong ruins the whole batch.

SHORT vouch (the majority):
- 15-70 characters. A few words to one short line. Some are literally 3-6 words.
- A few may reach 70-110 characters. NOTHING over 130.
- No paragraphs, no multi-sentence essays. Someone types one line and moves on.

DETAILED review (only the lines marked DETAILED):
- 220-500 characters, 3-5 sentences. A real write-up from someone who took the time.
- Still a gamer typing, not a marketing department — but calmer and more considered.
- Sentence case and normal punctuation. Far less slang than the short ones; an "ngl" or "honestly" is plenty.
- Give it specifics: how long they have used it, what they play, what actually happened, one concrete detail (a rank, an hour count, a setup time, a feature).
- Balanced is good — a small gripe alongside the praise reads far more real.
- Example shape (do not copy the wording): "Been running the monthly on Rust since the last wipe. Took me maybe ten minutes to get the config how I wanted it, menu is a bit fiddly at first. Since then it's been solid, no crashes across probably 40 hours. Support answered a question about the loader same evening too."

HOW THEY ACTUALLY TYPE:
- mostly lowercase, punctuation often skipped entirely
- gen-z slang used naturally, not stuffed: ts, icl, ngl, fr, lowkey, tuff, goated, W, mid, cooked, gng, sheesh, on god, aint, bro, crazy, insane, clean, hits different
- run-on or fragment is fine ("ts actually goated", "w purchase fr")
- occasional missing apostrophe (dont, isnt, its) reads real
- some reviews are literally 3-6 words

Good examples of the LENGTH and TONE wanted:
  "ts actually goated ngl"
  "aimbot smooth af, 2 day in no ban"
  "bro the setup took like 2 mins 😭"
  "W, hit pred first week"
  "icl i was doubting it but nah this hits"
  "been running it a month, zero issues"
  "support replied in like 3 mins, insane"
  "spoofer cleared my hwid ban first try"
  "kinda mid on fps ngl but works"
  "no bans yet, been 3 weeks"

Bad for a SHORT vouch (these are fine only where the line is marked DETAILED):
  "I used the 1-week plan on Fortnite. Had some solid runs, peaked with 15 kills..."
  "Having been HWID banned on three separate occasions with a competitor's product..."

CONTENT RULES
- Mention the game or product naturally, or don't mention it at all — plenty of real vouches just say "ts is clean".
- One idea per review. No lists, no feature rundowns.
- Emojis: at most one, and only in about a fifth of them (😭 💀 🔥 🙏 are the realistic ones).
- Vary hard — every review is a different person. Do not start two with the same word.
- NEVER use any of these phrases: ${BANNED_PHRASES.join(', ')}.
- Never sound like marketing. Never mention Creed more than once.

PRODUCT ACCURACY (these are NOT all cheats):
- GAME ACCOUNTS ("... Skin Account") are real accounts sold with full email access.
  A review of one talks about the login working, the skins/locker being as
  described, how fast it arrived, changing the email over. It NEVER mentions
  aimbot, ESP, FPS, being undetected in a match, or anything cheat related.
- UNIVERSAL AIM is an AI aim that reads the screen, not game memory. Reviews can
  mention it working across different games, the FOV/smoothing, triggerbot.

FACTUAL ACCURACY — SPOOFERS (do not get this wrong):
- A spoofer resets HWID / hardware identifiers ONLY. It does NOT unban, restore,
  recover or "get back" a banned ACCOUNT.
- Correct: "cleared my hwid ban", "spoofed and im back in on a new acc",
  "hwid reset worked first try", "got past the hardware ban".
- FORBIDDEN — never claim or imply any of these: that it unbanned an account,
  got someone back on their main/original account, recovered or restored a
  banned account, or lifted an account ban.
- If a review mentions returning to a game after a ban, it must be on a NEW or
  different account, never the banned one.

RATING: integer, mostly 5, about one in six is 4. A 4 can just be slightly less hyped ("works but fps dipped a bit").

STAFF REPLY: for roughly a quarter of the reviews include a short "staff_reply" (max 90 chars) from Creed support — friendly and human, matching the casual tone, never copy-paste identical. Things like "appreciate you 🙏" or "glad it's running clean, enjoy". Omit the field or use null for the rest.

Return ONLY a valid JSON array, no markdown fences:
[{"content":"...","rating":5,"staff_reply":"..."}, ...]`;
}

const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

/**
 * Tolerant parser: the model occasionally truncates the array mid-string or
 * wraps it in prose. Take whatever complete {...} objects we can salvage
 * rather than throwing the whole batch away.
 */
export function parseReviewJson(text) {
    const cleaned = String(text || '')
        .replace(/^\s*```(?:json)?/i, '')
        .replace(/```\s*$/, '')
        .trim();

    try {
        const direct = JSON.parse(cleaned);
        if (Array.isArray(direct)) return direct;
        if (direct && Array.isArray(direct.reviews)) return direct.reviews;
    } catch { /* fall through to salvage */ }

    // Salvage individual objects by scanning balanced braces (string-aware).
    const out = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
        if (ch === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                try { out.push(JSON.parse(cleaned.slice(start, i + 1))); } catch { /* skip */ }
                start = -1;
            }
        }
    }
    return out;
}

/**
 * Ask Gemini for a batch of reviews.
 * @returns {Promise<Array<{content:string, rating:number, staffReply:string|null, product:string, variant:string, short:string}>>}
 */
export async function generateReviewBatch(items, apiKey, modelOverride) {
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    const models = modelOverride ? [modelOverride] : DEFAULT_MODELS;
    const prompt = buildBatchPrompt(items);
    let lastErr = null;

    for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts: [{ text: prompt }] }],
                            generationConfig: {
                                temperature: 1.35,
                                topP: 0.97,
                                maxOutputTokens: 8192,
                                responseMimeType: 'application/json',
                            },
                        }),
                    }
                );

                if (!res.ok) {
                    const t = await res.text();
                    lastErr = new Error(`Gemini ${model} HTTP ${res.status}: ${t.slice(0, 300)}`);
                    if (res.status === 429 || res.status === 503) continue;
                    break;
                }

                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) { lastErr = new Error('Empty Gemini response'); continue; }

                const parsed = parseReviewJson(text);
                if (!parsed.length) { lastErr = new Error('No usable objects in response'); continue; }

                return parsed
                    .map((row, i) => {
                        const meta = items[i] || items[items.length - 1];
                        const content = String(row?.content || '').trim();
                        if (content.length < 8) return null;
                        // Cap per style: short vouches drift into paragraphs if
                        // unpoliced, but the DETAILED lines are meant to be long.
                        const limit = STYLE_LIMITS[meta.style] || STYLE_LIMITS.short;
                        if (content.length > limit) return null;
                        if (meta.style !== 'detailed' && looksRepetitive(content)) return null;
                        let rating = parseInt(row?.rating, 10);
                        if (rating !== 4 && rating !== 5) rating = 5;
                        const reply = row?.staff_reply ? String(row.staff_reply).trim().slice(0, 200) : null;
                        return {
                            content: content.slice(0, limit),
                            rating,
                            staffReply: reply && reply.length > 4 ? reply : null,
                            product: meta.product,
                            variant: meta.variant,
                            short: meta.short,
                            style: meta.style || 'short',
                        };
                    })
                    .filter(Boolean);
            } catch (e) {
                lastErr = e;
            }
        }
    }

    throw lastErr || new Error('Gemini generation failed');
}

/* ---------- avatars ----------
   pravatar only holds 70 real photos, so with 100+ reviews its ?u= seed was
   mapping many rows onto the same face. DiceBear generates a distinct avatar
   per seed with no pool limit, and the illustrated styles read more like real
   Discord PFPs than stock headshots anyway. */
const AVATAR_STYLES = [
    'adventurer', 'avataaars', 'big-smile', 'bottts', 'croodles', 'fun-emoji',
    'lorelei', 'micah', 'miniavs', 'notionists', 'open-peeps', 'personas',
    'pixel-art', 'thumbs', 'shapes',
];

/**
 * Unique avatar per review. `seed` must be unique (we pass the username, which
 * is already collision-checked), and the style rotates so the grid stays varied.
 */
export function avatarUrlFor(seed, index = 0) {
    const style = AVATAR_STYLES[Math.abs(index) % AVATAR_STYLES.length];
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}
