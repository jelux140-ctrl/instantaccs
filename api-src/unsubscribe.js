/* =========================================
   CREED — one-click unsubscribe

   Backs the List-Unsubscribe / List-Unsubscribe-Post headers on the
   promotional (abandoned-cart) mail. Gmail and Yahoo both require bulk senders
   to honour one-click unsubscribe, and a header pointing at a 404 counts
   against deliverability rather than for it.

   GET  /unsubscribe?email=...  -> confirmation page (also records the opt-out)
   POST /unsubscribe            -> one-click, returns 200 with no body

   Transactional mail (order receipts, ticket replies) deliberately ignores
   this list — a customer who paid still needs their licence keys.
   ========================================= */

import { createClient } from '@supabase/supabase-js';

function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    // Deliberately permissive: this only ever gates outbound marketing.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function page(title, message) {
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — Creed</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b0b0d; color:#f5f5f7;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .card { max-width:34rem; padding:2.5rem; text-align:center;
          background:#141417; border:1px solid #26262b; border-radius:16px; margin:1.5rem; }
  h1 { margin:0 0 .75rem; font-size:1.35rem; color:#e8c26a; }
  p  { margin:0 0 1.5rem; line-height:1.6; color:#b6b6bd; }
  a  { display:inline-block; padding:.7rem 1.4rem; border-radius:10px;
       background:#e8c26a; color:#0b0b0d; text-decoration:none; font-weight:600; }
</style>
</head><body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://www.creedv2.com">Back to Creed</a>
  </div>
</body></html>`;
}

/** Records the opt-out. Returns true on success, false if storage is unavailable. */
async function recordOptOut(email) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error('unsubscribe: Supabase not configured');
        return false;
    }

    const supabase = createClient(url, key);
    const { error } = await supabase
        .from('email_optouts')
        .upsert({ email, created_at: new Date().toISOString() }, { onConflict: 'email' });

    if (error) {
        console.error('unsubscribe: failed to record opt-out', error);
        return false;
    }
    return true;
}

export default async function handler(req, res) {
    // One-click: Gmail POSTs with no useful body, so the address rides in the
    // query string that we put in the List-Unsubscribe URL.
    const email = normalizeEmail(req.query?.email ?? req.body?.email);

    if (req.method === 'POST') {
        // RFC 8058 wants a plain 200 regardless; never leak whether the address
        // was known. Still record it when we can.
        if (email) await recordOptOut(email);
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).send(page('Method not allowed', 'Please use the link from your email.'));
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (!email) {
        return res.status(400).send(page(
            'Link incomplete',
            'That unsubscribe link is missing a valid email address. Reply to any Creed email and we will remove you manually.'
        ));
    }

    const ok = await recordOptOut(email);
    if (!ok) {
        return res.status(500).send(page(
            'Something went wrong',
            'We could not update your preferences just now. Please try the link again shortly.'
        ));
    }

    return res.status(200).send(page(
        'You are unsubscribed',
        `<strong>${email}</strong> will no longer receive Creed marketing or cart reminder emails. Order confirmations and support replies will still be delivered.`
    ));
}
