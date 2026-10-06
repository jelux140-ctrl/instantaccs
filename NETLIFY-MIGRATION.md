# Vercel → Netlify Migration Guide

## ✅ DEPLOYED (done via CLI on 2026-07-05)

All three sites are **live on Netlify** with env vars set and verified:

| Site | Netlify URL | Site ID |
|------|-------------|---------|
| Main (Creed) | https://creedv2-site.netlify.app | `94a96966-e673-459d-aef2-f2e51bfe745a` |
| DigitalVault | https://creed-digitalvault.netlify.app | `dbb26509-1c8d-483a-a4ab-55fdd79f0177` |
| Portal | https://creed-portal.netlify.app | `d379c76a-c2a2-48f8-8841-a0608b7ee15c` |

Verified live: home/products/blog pages, `/api/public-site-config`, `/api/vouches`,
`/sitemap.xml` (xml), clean-URL rewrites, CORS preflight (204), API source files
blocked (404), the scheduled cron (`cron-seed-vouch` returned 201), DigitalVault
checkout + webhook. Env vars set on main + DV via CLI; portal needs none (static).

### ⏳ What's LEFT FOR YOU (can't be done from here):
1. **Attach custom domains + DNS** — §4 below. Until then the sites run on the
   `*.netlify.app` URLs above. Portal already calls `www.creedv2.com`, so it keeps
   working against Vercel until you flip DNS, then switches to Netlify automatically.
2. **Update Stripe webhook URLs** — §5. Point them at the new domains (or the
   `*.netlify.app` URLs if you want to test before DNS).
3. **Decide on `/reviews`** — you added a real `reviews.html`, so `/reviews` now
   serves that page (200) instead of redirecting to `/vouches`. Tell me if you want
   the old redirect back.
4. When fully cut over: delete the Vercel projects and remove `vercel.json` /
   `middleware.js`.

---


This repo (and the sibling **DigitalVault** project) has been prepared to run on
**Netlify** with **zero loss of functionality**. All serverless functions keep
their original logic — they run unchanged through a thin compatibility adapter.

The old Vercel config is left in place, so **Vercel keeps working** until you
finish testing on Netlify and flip DNS. Nothing is deleted.

---

## 1. What changed in the code (already done for you)

### Main site (`Creed/`)
| New file | Purpose |
|---|---|
| `netlify/adapter.js` | Translates each Vercel `(req,res)` handler → Netlify Functions v2 `(Request)→Response`. Handles body parsing, `req.rawBody` (Stripe), query, cookies, CORS, OPTIONS. |
| `netlify/functions/api.mjs` | **API dispatcher** — owns `/api/*`, routes every endpoint (42 of them) to its original handler in `/api`. Also prevents the raw `/api/*.js` sources from being served as static downloads. |
| `netlify/functions/cron-seed-vouch.mjs` | **Scheduled function** — replaces the Vercel cron (`*/9 * * * *`). Injects the CRON auth header automatically. |
| `netlify/edge-functions/maintenance.js` | **Edge function** — replaces `middleware.js` (the maintenance gate). Same logic, same fail-open behaviour. |
| `netlify.toml` | Redirects, clean-URL rewrites, headers, function/edge wiring (translated from `vercel.json`). |

Your original `/api/*.js` handler files were **not modified** and neither was
`vercel.json` / `middleware.js`.

> Regenerate the dispatcher any time you add/remove an endpoint:
> `node scratchpad/gen-dispatcher.mjs` (script saved in the session scratchpad).

### DigitalVault site (`../DigitalVault/`)
- `netlify/adapter.js`, `netlify/functions/api.mjs`, `netlify.toml` added.
- `api/webhook.js` — the only logic edit anywhere: it now reads `req.rawBody`
  (provided by the adapter) instead of `raw-body`/`getRawBody`, which needed a
  Node stream that doesn't exist on Netlify. `raw-body` removed from deps.

### Portal site (`Creed/portal-site/`)
- `netlify.toml` added (pure static + `/api/*` proxy to `www.creedv2.com`).

---

## 2. Create the Netlify sites

You'll create **3 separate Netlify sites** (one per project). Easiest is
"Add new site → Import from Git", or drag-and-drop the folder.

| Netlify site | Base directory | Publish dir | Functions |
|---|---|---|---|
| **creed-main** | repo root | `.` | `netlify/functions` |
| **creed-portal** | `portal-site` | `.` | (none) |
| **digitalvault** | the DigitalVault repo root | `.` | `netlify/functions` |

- No build command is needed (static sites). Netlify auto-detects `netlify.toml`.
- **Set `NODE_VERSION = 20`** in each site's environment (Site config → Environment)
  so the functions run on a modern Node runtime.

---

## 3. Environment variables (you must set these in Netlify)

Set these under **Site configuration → Environment variables** for each site.
Values are the ones from your `envexport.txt`.

### `creed-main`
```
GEMINI_API_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
ADMIN_TOKEN
PORTAL_PUBLIC_URL          = https://portal.creedv2.com
CRON_SECRET                = creed2026
RESEND_FROM_EMAIL          = orders@creedv2.com
RESEND_API_KEY
EMAILJS_PRIVATE_KEY
EMAILJS_PUBLIC_KEY
EMAILJS_SERVICE_ID
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
SUPABASE_URL               = https://jlptgdlbtfqmkdmlmfgl.supabase.co
STRIPE_CHECKOUT_API_URL    = https://<YOUR-DIGITALVAULT-DOMAIN>/api/create-checkout   # <-- IMPORTANT (see §6)
```

### `creed-portal`
```
ADMIN_TOKEN
```
(Portal is static; it calls the main site's API. `ADMIN_TOKEN` is only used if
the staff admin view runs here.)

### `digitalvault`
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_URL               = https://jlptgdlbtfqmkdmlmfgl.supabase.co
SUPABASE_SERVICE_ROLE_KEY
SITE_URL                   = https://<YOUR-DIGITALVAULT-DOMAIN>     # <-- set to the new Netlify/custom domain
CREED_WEBSITE_URL          = https://creedv2.com
```

> ⚠️ **Rotate your keys.** These secrets were shared in plain text in this chat.
> After migrating, consider rotating the Stripe secret key, Supabase service-role
> key, Resend key, and Gemini key in their dashboards, then update Netlify.

---

## 4. Domains & DNS (your action)

| Site | Domain to attach |
|---|---|
| creed-main | `creedv2.com` **and** `www.creedv2.com` (add both — `portal.js` calls `www.`) |
| creed-portal | `portal.creedv2.com` |
| digitalvault | pick one, e.g. `pay.creedv2.com` or keep a `*.netlify.app` |

Steps per site: **Domain management → Add domain** → follow Netlify's DNS
instructions (either move the domain to Netlify DNS, or add the `A`/`CNAME`
records they show you at your current registrar). Netlify provisions HTTPS
automatically.

- Make sure **both** `creedv2.com` and `www.creedv2.com` resolve to creed-main
  (Netlify handles the redirect between them; the portal needs `www` to answer).

---

## 5. Stripe webhooks (critical for payments)

Stripe currently points at your Vercel URLs. After DNS cutover, update the
endpoint URLs in the **Stripe Dashboard → Developers → Webhooks**:

- Main site webhook → `https://www.creedv2.com/api/webhook`
- DigitalVault webhook → `https://<YOUR-DIGITALVAULT-DOMAIN>/api/webhook`

Keep the **same signing secret** (`STRIPE_WEBHOOK_SECRET`) or, if you create a
new endpoint, copy its new signing secret into the env vars. Send a test event
from Stripe and confirm a `200`.

---

## 6. DigitalVault checkout URL

The main site asks customers to pay via DigitalVault's `create-checkout`. The URL
comes from the `STRIPE_CHECKOUT_API_URL` env var on **creed-main** (§3). Set it to
your new DigitalVault domain.

There are two hardcoded fallbacks still pointing at the old Vercel URL, used only
if that env var is missing or the config request fails:
- `api/public-site-config.js` line 6
- `cart.js` line 5

Once you've picked the DigitalVault domain, tell me and I'll update those two
lines so there's no stale `digitalvault…vercel.app` reference anywhere.

---

## 7. Test locally before deploying (optional but recommended)

```bash
# from Creed/ (netlify-cli is in devDependencies, or use the global one)
npm install
netlify dev            # serves the site + functions at http://localhost:8888
```
Then hit `http://localhost:8888/api/public-site-config`, `/products`, `/blog`,
add to cart, etc. (Set the env vars in a local `.env` first, or `netlify link`
to pull them.)

The compatibility adapter and both dispatchers were unit-smoke-tested (OPTIONS/CORS,
404 routing, body parsing, rawBody preservation, redirects, error handling) — all green.

---

## 8. Go-live checklist

- [ ] 3 Netlify sites created, `NODE_VERSION=20` set
- [ ] Env vars set on each site (§3)
- [ ] `STRIPE_CHECKOUT_API_URL` (main) + `SITE_URL` (DV) point to the new DV domain
- [ ] Deploy each site; confirm `*.netlify.app` URLs work end-to-end
- [ ] `/api/public-site-config`, `/api/vouches`, `/blog`, `/sitemap.xml` return correctly
- [ ] A test purchase completes and the order lands in Supabase + email sends
- [ ] Scheduled function `cron-seed-vouch` appears under Site → Functions and runs
- [ ] Maintenance mode toggles the storefront (edge function works)
- [ ] Attach custom domains + DNS (§4)
- [ ] Update Stripe webhook URLs (§5) and send a test event
- [ ] Watch live for a day, then remove the Vercel projects

---

## 9. Known caveats

- **Function timeout:** Netlify synchronous functions time out at **10s**. A few
  handlers call Gemini and can be slow — `generate-blog`, `chatbot`,
  `cron-seed-vouch`, and long `blog-ssr` renders. If any time out, we can convert
  the admin-only/scheduled ones to Netlify **background functions** (15-min limit).
  `chatbot` needs a live response, so if it's slow we'd stream or trim the prompt.
- **`middleware.js` / `vercel.json`** are left in place for Vercel parallel-running.
  They're ignored by Netlify. Delete them once you're fully off Vercel.
- **Email logo images** in `discord-update-email.html` still reference an old
  `*.vercel.app` asset URL — cosmetic; update to `creedv2.com` when convenient.
