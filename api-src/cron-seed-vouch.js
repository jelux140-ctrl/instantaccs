/* =========================================
   CREED — AI-seeded reviews (Gemini + Supabase)
   Triggered by Vercel Cron or a manual GET/POST with auth.
   Synthetic rows use a discord_user_id prefix of "seed:" (not real Discord accounts).

   Generation logic lives in ./lib-review-gen.js so the one-off reseed
   script and this cron produce identical, equally varied output.
   ========================================= */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { pickProduct, generateReviewBatch, generateUsername, avatarUrlFor, assignStyles } from './lib-review-gen.js';

const getServiceClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !key) throw new Error('Supabase service role not configured');
    return createClient(supabaseUrl, key);
};

function verifyAuth(req) {
    const raw = req.headers.authorization || '';
    const bearer = raw.replace(/^Bearer\s+/i, '').trim();
    const token = bearer;

    const admin = process.env.ADMIN_TOKEN;
    const cronSecret = process.env.CRON_SECRET;

    if (token && admin && token === admin) return true;
    if (token && cronSecret && token === cronSecret) return true;
    return false;
}


function randomCreatedAtForToday(now = new Date(), index = 0, total = 1) {
    const dayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const elapsedMs = Math.max(60_000, now.getTime() - dayStartMs);
    const slotMs = elapsedMs / Math.max(1, total);
    const min = dayStartMs + slotMs * index;
    const max = Math.min(now.getTime() - 60_000, dayStartMs + slotMs * (index + 1) - 1);
    const safeMax = Math.max(min, max);
    return new Date(min + Math.random() * (safeMax - min)).toISOString();
}

/** Usernames already in the table, so new handles never collide. */
async function loadTakenUsernames(supabase) {
    const taken = new Set();
    const { data } = await supabase.from('vouches').select('discord_username').limit(2000);
    (data || []).forEach((r) => r.discord_username && taken.add(String(r.discord_username).toLowerCase()));
    return taken;
}

/** The product/staff-reply columns only exist after reviews-upgrade.sql has been run. */
async function hasReviewColumns(supabase) {
    const { error } = await supabase.from('vouches').select('id, product, staff_reply').limit(1);
    return !error;
}

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!verifyAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const enabled = process.env.VOUCH_SEED_ENABLED !== 'false';
    if (!enabled) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'VOUCH_SEED_DISABLED' });
    }

    const probability = Math.min(1, Math.max(0, parseFloat(process.env.VOUCH_SEED_PROBABILITY || '1')));
    const force =
        req.query?.force === '1' ||
        req.query?.force === 'true' ||
        req.query?.force === 'yes';

    const wantBatch = force || req.query?.batch === '1' || req.query?.mode === 'count';

    if (!force && !wantBatch && Math.random() > probability) {
        return res.status(200).json({
            ok: true,
            skipped: true,
            reason: 'random_skip',
            probability,
            hint: 'Add &force=1 (or &batch=1) to this URL (same token) to generate the full day quota for testing.',
        });
    }

    try {
        const supabase = getServiceClient();
        const now = new Date();
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
        const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
        const configuredMax = Math.min(5, Math.max(4, parseInt(process.env.VOUCH_SEED_DAILY_LIMIT || '5', 10) || 5));
        const dailyLimit = configuredMax;

        const { count, error: countError } = await supabase
            .from('vouches')
            .select('id', { count: 'exact', head: true })
            .like('discord_user_id', 'seed:%')
            .gte('created_at', dayStart)
            .lt('created_at', dayEnd);

        if (countError) throw countError;
        const existing = count || 0;

        if (existing >= dailyLimit) {
            return res.status(200).json({ ok: true, skipped: true, reason: 'daily_limit_reached', count: existing, dailyLimit });
        }

        const toGenerate = Math.min(dailyLimit - existing, 6);
        const withColumns = await hasReviewColumns(supabase);
        const taken = await loadTakenUsernames(supabase);

        // One batched call — the model is told to make every review differ from the others.
        // Mix lengths: a couple of quick vouches, then a proper write-up.
        // `existing` keeps the rhythm going across separate cron runs.
        const styles = assignStyles(toGenerate, existing);
        const items = Array.from({ length: toGenerate }, (_, k) => ({ ...pickProduct(), style: styles[k] }));
        const reviews = await generateReviewBatch(items, process.env.GEMINI_API_KEY, process.env.VOUCH_SEED_GEMINI_MODEL);

        const generated = [];
        for (let i = 0; i < reviews.length; i++) {
            const r = reviews[i];
            const discord_username = generateUsername(taken);
            const discord_user_id = `seed:${randomUUID()}`;
            const created_at = randomCreatedAtForToday(now, existing + i, dailyLimit);

            const row = {
                discord_user_id,
                discord_username,
                avatar_url: avatarUrlFor(discord_username, existing + i),
                rating: r.rating,
                content: r.content,
                proof_url: null,
                created_at,
            };

            if (withColumns) {
                row.product = r.product;
                row.product_variant = r.variant;
                row.product_short = r.short;
                row.staff_reply = r.staffReply;
                row.staff_reply_at = r.staffReply
                    ? new Date(new Date(created_at).getTime() + 1000 * 60 * 60 * (1 + Math.random() * 20)).toISOString()
                    : null;
                row.verified_purchase = true;
            }

            const { data: inserted, error } = await supabase
                .from('vouches')
                .insert(row)
                .select('id')
                .single();

            if (error) {
                console.error('cron-seed-vouch: insert failed:', error.message);
                continue;
            }
            generated.push({ id: inserted?.id, discord_username, rating: r.rating, product: r.product });
        }

        return res.status(201).json({
            ok: true,
            forced: Boolean(force),
            generated: generated.length,
            taggedWithProducts: withColumns,
            dailyLimit,
            existing,
            items: generated,
        });
    } catch (e) {
        console.error('cron-seed-vouch error:', e);
        return res.status(500).json({ error: 'Seeding failed', message: e.message });
    }
}
