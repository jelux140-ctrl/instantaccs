/* =========================================
   CREED - PUBLIC ENDPOINT ABUSE GUARD
   Shared protection for endpoints that must stay unauthenticated
   (promo signup, order receipts, manual checkout).

   These endpoints run with the service role, which BYPASSES RLS. Locking
   down the database therefore does nothing for them - they are their own
   trust boundary and must validate their own input. This is how
   `redteam-probe@test.local` reached promo_signups while every direct
   anon-key write was returning 42501.
   ========================================= */

/** Hosts allowed to call the public endpoints. */
function allowedHosts() {
    const hosts = new Set(['creedv2.com', 'www.creedv2.com']);
    for (const raw of [process.env.STORE_URL, process.env.PORTAL_PUBLIC_URL]) {
        if (!raw) continue;
        try { hosts.add(new URL(raw).host.toLowerCase()); } catch { /* ignore */ }
    }
    return hosts;
}

/**
 * Reject requests that did not originate from our own pages.
 * Not a security boundary on its own (headers are forgeable), but it stops
 * drive-by scanners and scripted abuse, which is the observed threat.
 * @returns {boolean}
 */
export function originAllowed(req) {
    const raw = req.headers?.origin || req.headers?.referer || '';
    if (!raw) return false;
    try {
        return allowedHosts().has(new URL(raw).host.toLowerCase());
    } catch {
        return false;
    }
}

/** Reserved / non-deliverable TLDs used by scanners and probes. */
const RESERVED_TLDS = new Set(['local', 'test', 'invalid', 'example', 'localhost', 'internal']);

/**
 * Strict email validation. The previous check was `email.includes('@')`,
 * which accepted `redteam-probe@test.local`.
 * @returns {boolean}
 */
export function validEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (email.length < 6 || email.length > 254) return false;
    if (!/^[^\s@,;:<>()[\]\\"]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(email)) return false;
    if (email.includes('..')) return false;

    const domain = email.split('@')[1] || '';
    const tld = domain.split('.').pop() || '';
    if (RESERVED_TLDS.has(tld)) return false;
    // Bare IPs and single-label hosts are never real signup domains.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return false;
    return true;
}

/** Caller identity for rate limiting. Vercel puts the real IP first. */
export function clientIp(req) {
    const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || String(req.headers?.['x-real-ip'] || '').trim() || 'unknown';
}

/**
 * Fixed-window rate limit backed by Supabase, so it holds across serverless
 * instances (an in-memory counter would reset on every cold start).
 * Fails OPEN on infrastructure errors - a broken limiter must not take
 * checkout down - but fails CLOSED on an actual limit breach.
 *
 * @returns {Promise<{allowed: boolean, count: number}>}
 */
export async function rateLimit(supabase, bucket, ident, max, windowSec) {
    if (!supabase) return { allowed: true, count: 0 };
    const since = new Date(Date.now() - windowSec * 1000).toISOString();

    try {
        const { count, error } = await supabase
            .from('api_abuse_log')
            .select('id', { count: 'exact', head: true })
            .eq('bucket', bucket)
            .eq('ident', ident)
            .gte('created_at', since);

        if (error) return { allowed: true, count: 0 };
        if ((count || 0) >= max) return { allowed: false, count: count || 0 };

        await supabase.from('api_abuse_log').insert({ bucket, ident });
        return { allowed: true, count: (count || 0) + 1 };
    } catch {
        return { allowed: true, count: 0 };
    }
}

/**
 * Standard guard for a public POST endpoint.
 * @returns {Promise<{ok: true} | {ok: false, status: number, error: string}>}
 */
export async function guardPublicPost(req, supabase, { bucket, max, windowSec }) {
    if (!originAllowed(req)) {
        return { ok: false, status: 403, error: 'Forbidden' };
    }
    const { allowed } = await rateLimit(supabase, bucket, clientIp(req), max, windowSec);
    if (!allowed) {
        return { ok: false, status: 429, error: 'Too many requests. Please try again later.' };
    }
    return { ok: true };
}
