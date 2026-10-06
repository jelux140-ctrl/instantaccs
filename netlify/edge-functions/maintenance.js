/* =========================================================================
   MAINTENANCE GATE — Netlify Edge Function
   Port of the old Vercel Edge `middleware.js`. Decides whether a visitor
   sees the storefront or the maintenance page. Fails OPEN (shows storefront)
   if the gate is slow/unreachable, so the shop is never blocked by an outage.
   ========================================================================= */

export default async (request, context) => {
    const url = new URL(request.url);
    const p = url.pathname;

    // Never gate API, admin, the maintenance page itself, assets, portal, etc.
    if (p.startsWith('/api/')) return;
    if (p === '/admin' || p.startsWith('/admin')) return;
    if (p === '/maintenance' || p === '/maintenance.html') return;
    if (p.startsWith('/assets/')) return;
    if (p === '/portal' || p.startsWith('/portal/')) return;
    if (p === '/auth-callback' || p.startsWith('/auth-callback')) return;
    if (p.startsWith('/blog-admin')) return;
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|map|txt|xml|json|webmanifest)$/i.test(p)) return;

    // Edge must finish quickly; fail open if the gate is slow.
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
        if (data.ok) return; // pass through to storefront
        return Response.redirect(new URL('/maintenance.html', url.origin), 302);
    } catch {
        clearTimeout(t);
        return; // fail open
    }
};

export const config = {
    path: '/*',
    // Skip the heavy/irrelevant paths at the platform level too.
    excludedPath: ['/api/*', '/assets/*', '/blog-admin/*'],
};
