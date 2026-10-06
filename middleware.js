import { next } from '@vercel/edge';

export default async function middleware(request) {
    const url = new URL(request.url);
    const p = url.pathname;

    // Build/runtime internals are required in the deployment bundle but must
    // never be downloadable as static files.
    const internalPrefixes = ['/api-src/', '/supabase/', '/scripts/', '/netlify/', '/portal-site/', '/.cursor/'];
    const internalFiles = new Set(['/security-fix-rls.sql', '/supabase-schema.sql', '/cleanup-fraud-orders.sql', '/discord-bot-api-docs.txt', '/portal-response.txt', '/API-DOCUMENTATION.md', '/PORTAL-README.md', '/NETLIFY-MIGRATION.md', '/.rotation-temp-path.txt', '/.admin-token-rotation.tmp']);
    const hiddenPath = p.split('/').some((segment) => segment.startsWith('.') && segment !== '.well-known');
    if (internalPrefixes.some((prefix) => p.startsWith(prefix)) || internalFiles.has(p) || hiddenPath || /\.(sql|toml)$/i.test(p)) {
        return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }

    if (p.startsWith('/api/')) return next();
    if (p === '/admin' || p.startsWith('/admin')) return next();
    if (p === '/maintenance' || p === '/maintenance.html') return next();
    if (p.startsWith('/assets/')) return next();
    if (p === '/portal' || p.startsWith('/portal/')) return next();
    if (p === '/auth-callback' || p.startsWith('/auth-callback')) return next();
    if (p.startsWith('/blog-admin')) return next();

    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|map|txt|xml|json|webmanifest)$/i.test(p)) return next();

    /* Edge middleware must finish quickly; a slow Supabase/cold /api/maintenance-gate causes
       MIDDLEWARE_INVOCATION_TIMEOUT (504). Fail open: allow the storefront if the gate is slow. */
    const GATE_MS = 1800;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), GATE_MS);
    try {
        const gateUrl = new URL('/api/maintenance-gate', url.origin);
        const res = await fetch(gateUrl.toString(), {
            headers: { cookie: request.headers.get('cookie') || '' },
            signal: ac.signal,
        });
        clearTimeout(t);
        const data = await res.json().catch(() => ({ ok: true }));
        if (data.ok) return next();
        return Response.redirect(new URL('/maintenance.html', url.origin), 302);
    } catch {
        clearTimeout(t);
        return next();
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
