/* POST create vouch — requires valid Supabase session + Discord identity. */

console.log('vouch.js: module loading started');

import { createClient } from '@supabase/supabase-js';

console.log('vouch.js: supabase imported');

const MAX_CONTENT = 2000;
const MIN_CONTENT = 10;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB decoded

// In-memory rate limit: max 1 vouch per Discord user ID ever (enforced at DB + here)
// Also hard IP-based throttle: max 3 attempts per IP per 10 minutes
const ipAttempts = new Map(); // ip -> { count, resetAt }
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 3;

function checkIpRateLimit(ip) {
    const now = Date.now();
    const entry = ipAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        ipAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_MAX_ATTEMPTS) return false;
    entry.count++;
    return true;
}

const getServiceClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('getServiceClient: URL exists:', !!supabaseUrl, 'Key exists:', !!key);
    if (!supabaseUrl || !key) {
        console.error('Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        throw new Error('Server misconfigured: Missing Supabase credentials');
    }
    return createClient(supabaseUrl, key);
};

function buildDiscordAvatarUrl(user, d, discordUserId) {
    const meta = user.user_metadata || {};
    const tryUrl = (u) => (u && /^https?:\/\//i.test(String(u)) ? String(u) : null);

    let u = tryUrl(d.avatar_url) || tryUrl(meta.avatar_url) || tryUrl(meta.picture);
    if (u) return u;

    const hash = d.avatar || meta.avatar;
    if (discordUserId && hash) {
        const ext = String(hash).startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${discordUserId}/${hash}.${ext}?size=128`;
    }

    if (discordUserId && /^\d+$/.test(discordUserId)) {
        try {
            const n = BigInt(discordUserId);
            const idx = Number((n >> 22n) % 6n);
            return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
        } catch {
            /* fall through */
        }
    }
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function getDiscordIdentity(user) {
    const discord = user.identities?.find((i) => i.provider === 'discord');
    if (!discord) return null;
    const d = discord.identity_data || {};
    const discordUserId = String(d.sub || discord.provider_id || '').trim();
    if (!discordUserId) return null;
    const cc = d.custom_claims || user.user_metadata?.custom_claims || {};
    const username =
        cc.global_name ||
        cc.username ||
        d.preferred_username ||
        d.full_name ||
        d.name ||
        d.username ||
        d.custom_claims?.global_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.preferred_username ||
        'Discord User';
    const avatarUrl = buildDiscordAvatarUrl(user, d, discordUserId);
    return { discordUserId, discordUsername: String(username).slice(0, 80), avatarUrl };
}

function parseDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1].toLowerCase();
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(mime)) return { error: 'Image must be JPEG, PNG, GIF, or WebP' };
    let buf;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch {
        return { error: 'Invalid image data' };
    }
    if (buf.length > MAX_IMAGE_BYTES) return { error: 'Image must be 2MB or smaller' };
    if (buf.length === 0) return { error: 'Empty image' };
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    return { buffer: buf, mime, ext };
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    console.log('vouch.js: handler called', req.method, req.url);
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkIpRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in with Discord to submit a vouch' });
    }
    const token = authHeader.slice(7);

    let rating;
    let content;
    let proofDataUrl = null;
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body || '{}');
        } catch {
            return res.status(400).json({ error: 'Invalid JSON' });
        }
    }
    ({ rating, content, proofDataUrl } = req.body || {});

    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
        return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
    }
    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Vouch text is required' });
    }
    const trimmed = content.trim();
    if (trimmed.length < MIN_CONTENT) {
        return res.status(400).json({ error: `Vouch must be at least ${MIN_CONTENT} characters` });
    }
    if (trimmed.length > MAX_CONTENT) {
        return res.status(400).json({ error: `Vouch must be at most ${MAX_CONTENT} characters` });
    }

    try {
        const supabase = getServiceClient();
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) {
            return res.status(401).json({ error: 'Invalid or expired session — sign in again' });
        }
        const user = userData.user;
        const profile = getDiscordIdentity(user);
        if (!profile) {
            return res.status(403).json({ error: 'Vouches require a Discord-linked account' });
        }

        const { count: existingCount } = await supabase
            .from('vouches')
            .select('id', { count: 'exact', head: true })
            .eq('discord_user_id', profile.discordUserId);

        if (existingCount >= 3) {
            return res.status(409).json({
                error: 'You have already submitted 3 vouches. That\'s the maximum per account.',
                code: 'vouch_limit_reached',
            });
        }

        let proofUrl = null;
        if (proofDataUrl) {
            const parsed = parseDataUrl(proofDataUrl);
            if (parsed?.error) {
                return res.status(400).json({ error: parsed.error });
            }
            if (!parsed?.buffer) {
                return res.status(400).json({ error: 'Invalid proof image' });
            }
            const path = `vouches/${profile.discordUserId}/${Date.now()}.${parsed.ext}`;
            const { error: upErr } = await supabase.storage
                .from('vouch-proofs')
                .upload(path, parsed.buffer, { contentType: parsed.mime, upsert: false });
            if (upErr) {
                console.error('storage upload:', upErr);
                return res.status(500).json({
                    error: 'Could not upload proof image. Ensure the vouch-proofs bucket exists.',
                    details: upErr.message,
                });
            }
            const { data: pub } = supabase.storage.from('vouch-proofs').getPublicUrl(path);
            proofUrl = pub?.publicUrl || null;
        }

        const { data: inserted, error: insErr } = await supabase
            .from('vouches')
            .insert({
                discord_user_id: profile.discordUserId,
                discord_username: profile.discordUsername,
                avatar_url: profile.avatarUrl,
                rating: r,
                content: trimmed,
                proof_url: proofUrl,
            })
            .select('id, discord_username, avatar_url, rating, content, proof_url, created_at')
            .single();

        if (insErr) {
            console.error('vouch insert:', insErr);
            // Check for duplicate key error
            if (insErr.code === '23505' && insErr.message.includes('discord_user_id')) {
                return res.status(409).json({
                    error: 'You have already submitted 3 vouches. That\'s the maximum per account.',
                    code: 'vouch_limit_reached',
                });
            }
            return res.status(500).json({ error: 'Could not save vouch', details: insErr.message });
        }

        return res.status(201).json({
            success: true,
            vouch: {
                id: inserted.id,
                discordUsername: inserted.discord_username,
                avatarUrl: inserted.avatar_url,
                rating: inserted.rating,
                content: inserted.content,
                proofUrl: inserted.proof_url,
                createdAt: inserted.created_at,
            },
        });
    } catch (e) {
        console.error('VOUCH ERROR:', e);
        console.error('Stack:', e.stack);
        return res.status(500).json({ error: 'Server error', message: e.message, stack: e.stack });
    }
}
