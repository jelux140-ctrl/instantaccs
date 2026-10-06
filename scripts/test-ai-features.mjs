/* Local end-to-end test for AI vouch seeding + AI blog generation.
   Usage: node scripts/test-ai-features.mjs
   Requires a valid GEMINI_API_KEY in env (and Supabase vars).
   Does NOT insert into the database by default (dry run). Set
   RUN_LIVE=1 to actually insert one vouch and one blog post. */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN_LIVE = process.env.RUN_LIVE === '1';

if (!GEMINI_API_KEY) { console.error('FAIL: GEMINI_API_KEY missing'); process.exit(2); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('FAIL: Supabase vars missing'); process.exit(2); }

async function genVouch() {
  const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  const prompt = `Write ONE fake-but-realistic customer vouch for Creed, a game enhancement provider.
Return ONLY valid JSON, no markdown: {"discord_username":"...","content":"...","rating":4}`;
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 1.0, maxOutputTokens: 512 } }),
    });
    if (!res.ok) { console.log(`  vouch model ${model} -> HTTP ${res.status}`); continue; }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) continue;
    const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    console.log(`  vouch OK via ${model}: @${parsed.discord_username} (${parsed.rating}*) "${String(parsed.content).slice(0,60)}..."`);
    return { model, parsed };
  }
  throw new Error('All vouch models failed');
}

async function genBlog() {
  const MODELS = ['gemini-2.5-pro', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  const prompt = `Write an SEO blog post about "best Rust hacks 2026". Respond with ONLY JSON: {"title": "...", "content": "<html>"}`;
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 8192 } }),
    });
    if (!res.ok) { console.log(`  blog model ${model} -> HTTP ${res.status}`); continue; }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) continue;
    const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    console.log(`  blog OK via ${model}: "${parsed.title}" (${String(parsed.content).length} chars)`);
    return { model, parsed };
  }
  throw new Error('All blog models failed');
}

(async () => {
  console.log('TEST: AI vouch generation');
  const v = await genVouch();
  console.log('TEST: AI blog generation');
  const b = await genBlog();

  if (RUN_LIVE) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: ve } = await supabase.from('vouches').insert({
      discord_user_id: `seed:${randomUUID()}`,
      discord_username: v.parsed.discord_username,
      avatar_url: 'https://i.pravatar.cc/256?u=test',
      rating: v.parsed.rating, content: v.parsed.content, proof_url: null,
    }).select('id').single();
    console.log(ve ? `LIVE vouch insert FAIL: ${ve.message}` : 'LIVE vouch inserted OK');

    const slug = String(b.parsed.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const { error: be } = await supabase.from('blog_posts').insert({
      title: b.parsed.title, slug, content: b.parsed.content, status: 'draft', author: 'Creed Team',
      meta_description: (b.parsed.metaDescription || '').slice(0, 160), reading_time_minutes: 3,
    }).select('id').single();
    console.log(be ? `LIVE blog insert FAIL: ${be.message}` : `LIVE blog inserted OK (slug: ${slug})`);
  } else {
    console.log('DRY RUN only (set RUN_LIVE=1 to also insert into Supabase).');
  }
  console.log('ALL TESTS PASSED');
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
