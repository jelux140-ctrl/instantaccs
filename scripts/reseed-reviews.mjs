/* =========================================
   CREED — one-off reseed of AI-generated reviews
   Deletes existing synthetic rows (discord_user_id LIKE 'seed:%') and
   regenerates them with the current generator. Real customer reviews
   (any row without the seed: prefix) are never touched.

   Usage:
     node scripts/reseed-reviews.mjs            # dry run, prints a sample
     node scripts/reseed-reviews.mjs --apply    # actually replace the rows
     node scripts/reseed-reviews.mjs --apply --count 70
   ========================================= */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load env from .env.local / .env
for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
}

const { pickProduct, generateReviewBatch, generateUsername, avatarUrlFor, assignStyles } = await import(
    new URL('../api-src/lib-review-gen.js', import.meta.url)
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase service credentials missing');
if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY missing');

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
// --top-up adds new reviews without deleting the existing synthetic ones.
const TOP_UP = args.includes('--top-up');
const countArg = args.indexOf('--count');
const OVERRIDE_COUNT = countArg !== -1 ? parseInt(args[countArg + 1], 10) : null;

async function rest(pathname, init = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    return { res, body: text ? JSON.parse(text) : null };
}

/** Do the product/staff-reply columns exist yet? */
async function hasReviewColumns() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vouches?select=id,product,staff_reply&limit=1`, { headers: H });
    return res.ok;
}


/** Spread created_at over the past `days`, newest first, with jitter. */
function spreadDates(n, days = 75) {
    const now = Date.now();
    const span = days * 24 * 60 * 60 * 1000;
    return Array.from({ length: n }, (_, i) => {
        const base = now - (span * (i + 0.5)) / n;
        const jitter = (Math.random() - 0.5) * (span / n) * 0.8;
        return new Date(Math.min(now - 60_000, base + jitter)).toISOString();
    });
}

async function main() {
    const withColumns = await hasReviewColumns();
    console.log(`product/staff-reply columns present: ${withColumns}`);
    if (!withColumns) {
        console.log('  -> run reviews-upgrade.sql to enable product tags + staff replies.');
    }

    const { body: seeded } = await rest('vouches?select=id,discord_username&discord_user_id=like.seed:*&limit=1000');
    const { body: real } = await rest('vouches?select=id&discord_user_id=not.like.seed:*&limit=1000');
    console.log(`existing synthetic rows: ${seeded.length} | real customer rows (kept): ${real.length}`);

    const target = OVERRIDE_COUNT || seeded.length || 60;
    console.log(`generating ${target} replacement reviews...`);

    // Keep real users' handles out of the generated pool
    const { body: allNames } = await rest('vouches?select=discord_username&limit=2000');
    const taken = new Set((allNames || []).map((r) => String(r.discord_username || '').toLowerCase()));

    const BATCH = 8;
    const generated = [];
    while (generated.length < target) {
        const need = Math.min(BATCH, target - generated.length);
        // Mix short vouches with the occasional full-length review; the offset
        // keeps the rhythm continuous across batches.
        const styles = assignStyles(need, generated.length);
        const items = Array.from({ length: need }, (_, k) => ({ ...pickProduct(), style: styles[k] }));
        let ok = false;
        for (let retry = 0; retry < 3 && !ok; retry++) {
            try {
                const batch = await generateReviewBatch(items, GEMINI_KEY, process.env.VOUCH_SEED_GEMINI_MODEL);
                generated.push(...batch);
                process.stdout.write(`  ${generated.length}/${target}\r`);
                ok = true;
            } catch (e) {
                console.error(`\nbatch failed (retry ${retry + 1}/3): ${e.message}`);
                await new Promise((r) => setTimeout(r, 4000 * (retry + 1)));
            }
        }
        if (!ok) { console.error('giving up on further batches'); break; }
        await new Promise((r) => setTimeout(r, 1200)); // be gentle on rate limits
    }
    console.log(`\ngenerated ${generated.length} reviews`);

    const dates = spreadDates(generated.length);
    const rows = generated.map((r, i) => {
        const username = generateUsername(taken);
        const uid = `seed:${randomUUID()}`;
        const created_at = dates[i];
        const row = {
            discord_user_id: uid,
            discord_username: username,
            avatar_url: avatarUrlFor(username, i),
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
        return row;
    });

    console.log('\n--- sample ---');
    rows.slice(0, 6).forEach((r) => {
        console.log(`[${r.discord_username}] ${r.rating}*  ${r.product || '(no tag)'} ${r.product_variant || ''}`);
        console.log(`   ${r.content}`);
        if (r.staff_reply) console.log(`   support: ${r.staff_reply}`);
    });

    if (!APPLY) {
        console.log('\nDRY RUN — nothing written. Re-run with --apply to replace.');
        return;
    }

    if (TOP_UP) {
        console.log('\ntop-up mode: keeping existing rows.');
    } else {
        console.log('\ndeleting old synthetic rows...');
        await fetch(`${SUPABASE_URL}/rest/v1/vouches?discord_user_id=like.seed:*`, { method: 'DELETE', headers: H });
    }

    console.log('inserting new rows...');
    for (let i = 0; i < rows.length; i += 25) {
        await rest('vouches', { method: 'POST', body: JSON.stringify(rows.slice(i, i + 25)) });
        process.stdout.write(`  ${Math.min(i + 25, rows.length)}/${rows.length}\r`);
    }

    const { res: countRes } = await rest('vouches?select=id&limit=1', { headers: { Prefer: 'count=exact', Range: '0-0' } });
    console.log(`\ndone. vouches table now: ${countRes.headers.get('content-range')}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
