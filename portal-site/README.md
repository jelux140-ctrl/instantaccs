# Portal (separate Vercel project)

Deploy this folder as **its own Vercel project** and attach **`portal.creedv2.com`**.

- **Do not** add `portal.creedv2.com` to the main storefront project.
- Main site stays on **creedv2.com** (APIs + Stripe + Supabase live there).
- **`vercel.json`** rewrites **`/api/:path*`** → **`https://creedv2.com/api/:path*`** (edge proxy). The browser only talks to **`portal.creedv2.com`**, so no cross-origin **“Failed to fetch”**. No Next.js / dynamic `api/[...]` route required.
- It loads `styles.css`, `portal-shell.js`, and `portal.js` from `https://creedv2.com` (no main `script.js`).
- **`index.html`** sets `<meta name="creed-api-proxy" content="1">` so `portal.js` calls same-origin **`/api/...`** (rewritten upstream).

**Vercel:** New Project → import repo → **Root Directory** = `portal-site` → deploy → add domain `portal.creedv2.com`.

### Environment variables (important)

- **`ADMIN_TOKEN` belongs on the main Creed project** (the one that serves **creedv2.com** / `www.creedv2.com` and runs `/api/*` serverless functions).
- **Do not** rely on `ADMIN_TOKEN` set only on the **portal** project (`portal-site`). The portal is static + rewrites; it never executes those APIs, so `process.env.ADMIN_TOKEN` is read **only** on the main deployment. Staff sign-in compares your pasted key to that value.
- After adding or changing `ADMIN_TOKEN` on the main project, **redeploy** that project (or wait for the next deploy) so functions pick it up.

### Staff (admin) workflow

Team members use **serverless APIs on the main site** with the same secret as `ADMIN_TOKEN` on the **main** Vercel project:

| Action | Method | Endpoint |
|--------|--------|----------|
| List tickets | GET | `https://creedv2.com/api/admin-portal-tickets` |
| Reply as staff | POST | `https://creedv2.com/api/portal-messages` — JSON `{ "ticket_id", "body" }` |
| Close ticket | PATCH | `https://creedv2.com/api/admin-portal-tickets` — JSON `{ "id", "status": "closed" }` |
| Post announcement | POST | `https://creedv2.com/api/admin-portal-announcements` |

Use **Postman**, **curl**, or a future internal dashboard. Customer order list remains on **`/admin`** on the main site.

If your production domain differs from `creedv2.com`, update the meta tag and script URLs in `index.html`.
