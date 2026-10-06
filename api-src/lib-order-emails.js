/* =========================================
   CREED — Order confirmation emails (Resend + EmailJS)
   Called directly from webhook / portal-bootstrap (avoid serverless self-fetch).
   ========================================= */

/** Accepts Supabase row or webhook/camelCase body */
export function normalizeOrderInput(body) {
    if (!body || typeof body !== 'object') return null;
    const row =
        body.customer_email != null
            ? body
            : {
                  id: body.id,
                  session_id: body.sessionId,
                  customer_email: body.customerEmail,
                  amount: body.amount,
                  currency: body.currency,
                  items: body.items,
                  created_at: body.createdAt,
                  paid_at: body.paidAt,
              };
    return orderRowToEmailPayload(row);
}

/** @param {object} row — Supabase `orders` row */
export function orderRowToEmailPayload(row) {
    const raw = row?.items;
    let items = Array.isArray(raw) ? raw : [];
    const normalized = items.map((i) => ({
        name: i?.name || i?.title || i?.product || 'Item',
        variant: i?.variant || i?.size || '—',
        quantity: Math.max(1, Number(i?.quantity) || 1),
        price: Number(i?.price ?? i?.unitPrice ?? 0) || 0,
    }));
    const amt = parseFloat(String(row?.amount ?? '0')) || 0;
    if (!normalized.length) {
        normalized.push({ name: 'Order', variant: '—', quantity: 1, price: amt });
    }
    return {
        id: row.id,
        sessionId: row.session_id || '',
        customerEmail: row.customer_email || '',
        amount: String(row.amount ?? amt.toFixed(2)),
        currency: (row.currency || 'USD').toString().toUpperCase(),
        items: normalized,
        createdAt: row.created_at || row.paid_at || new Date().toISOString(),
    };
}

export function getPortalBaseUrl() {
    const p = process.env.PORTAL_PUBLIC_URL || 'https://portal.creedv2.com';
    return String(p).replace(/\/$/, '');
}

export function getStoreBaseUrl() {
    return String(process.env.STORE_URL || 'https://www.creedv2.com').replace(/\/$/, '');
}

/**
 * Sender address. The old `onboarding@resend.dev` fallback silently sent from
 * Resend's shared demo domain, which carries no DKIM alignment with
 * creedv2.com and lands in spam essentially every time. A missing env var
 * should surface as an error, not as quietly-unreachable mail.
 */
export function resolveFromEmail() {
    return String(process.env.RESEND_FROM_EMAIL || '').trim();
}

/**
 * Reply-To, only when a real inbox exists. creedv2.com currently has no MX
 * record, so pointing replies at an @creedv2.com address would bounce — this
 * stays opt-in via SUPPORT_EMAIL until a mailbox is actually reachable.
 */
export function resolveReplyTo() {
    return String(process.env.SUPPORT_EMAIL || '').trim();
}

/**
 * Plain-text alternative derived from the HTML body.
 *
 * Resend sends exactly what it is given, so an `html`-only payload produces a
 * message with no text/plain part. Every major filter treats single-part HTML
 * as a spam signal, and it renders as nothing in text-only clients. Deriving
 * the text part from the HTML keeps the two halves in sync automatically.
 */
export function htmlToText(html) {
    return String(html || '')
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        // Keep link targets readable: "Open portal (https://...)"
        .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
            const text = String(label).replace(/<[^>]+>/g, '').trim();
            return text && !/^https?:/i.test(text) ? `${text} (${href})` : href;
        })
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '\n- ')
        // Cells need a separator or label and value collide ("Ordercreed_123")
        .replace(/<\/t[dh]>/gi, '\t')
        .replace(/<\/(p|div|tr|h[1-6]|li|table|section)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(nbsp|amp|lt|gt|quot|apos|mdash|ndash|hellip|bull|copy|trade|reg|lsquo|rsquo|ldquo|rdquo);/gi, (_m, name) => ({
            nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
            mdash: '—', ndash: '–', hellip: '…', bull: '-', copy: '(c)',
            trade: '(tm)', reg: '(r)', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"',
        }[String(name).toLowerCase()] ?? ' '))
        .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ' '; } })
        .replace(/&#(\d+);/g, (_m, dec) => { try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ' '; } })
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function isPlaceholderCustomerEmail(email) {
    const e = String(email || '')
        .trim()
        .toLowerCase();
    return !e || e === 'customer@creed.com';
}

function buildPremiumCustomerReceiptHtml(order, portalBaseUrl, licenseKeys = [], downloads = [], supportUrl) {
    const totalAmount = parseFloat(String(order.amount)).toFixed(2);
    const when = new Date(order.createdAt).toLocaleString();
    const storeBaseUrl = getStoreBaseUrl();
    const guideUrl = 'https://asd-57.gitbook.io/creedv2-product-guide/l7LValhrIxIUPOFNH6gc/';
    const heroImage = `${storeBaseUrl}/assets/creedbanner.png`;
    const firstItemName = String(order.items?.[0]?.name || 'Creed access');
    const firstItemVariant = String(order.items?.[0]?.variant || 'Instant access');
    const productImage = (() => {
        const text = `${firstItemName} ${firstItemVariant}`.toLowerCase();
        if (text.includes('rust')) return `${storeBaseUrl}/assets/rustproduct.png`;
        if (text.includes('fortnite')) return `${storeBaseUrl}/assets/fortnitepublic.png`;
        if (text.includes('rainbow') || text.includes('r6')) return `${storeBaseUrl}/assets/r6product.png`;
        if (text.includes('apex')) return `${storeBaseUrl}/assets/apexproduct.png`;
        if (text.includes('arc')) return `${storeBaseUrl}/assets/arcproduct.png`;
        if (text.includes('spoof')) return `${storeBaseUrl}/assets/tempspoofer.png`;
        return `${storeBaseUrl}/assets/creedembed.png`;
    })();
    const itemRows = (order.items || []).map((item) => {
        const line = (parseFloat(item.price) || 0) * (item.quantity || 1);
        return `
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #242424;color:#fff;">
              <strong style="display:block;font-size:15px;line-height:1.35;">${escapeHtml(String(item.name))}</strong>
              <small style="display:block;color:#a7a7a7;font-size:12px;margin-top:4px;">${escapeHtml(String(item.variant))} &bull; Qty ${item.quantity}</small>
            </td>
            <td style="padding:14px 0;border-bottom:1px solid #242424;color:#fff;text-align:right;font-weight:800;white-space:nowrap;">$${line.toFixed(2)}</td>
          </tr>`;
    }).join('');

    const licenseKeysHTML = licenseKeys && licenseKeys.length > 0 ? `
      <div style="margin:20px 0 0;padding:20px;background:#0b0b0b;border-radius:18px;border:1px solid #2f2a16;">
        <p style="margin:0 0 8px;color:#F6C445;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:900;">Access keys</p>
        <h3 style="color:#fff;margin:0 0 8px;font-size:20px;letter-spacing:-0.02em;">Your key is live.</h3>
        <p style="color:#bdbdbd;font-size:14px;line-height:1.55;margin:0 0 16px;">Keep it private. It is also saved inside your customer portal.</p>
        ${licenseKeys.map((k) => `
          <div style="margin:12px 0;padding:16px;background:#121212;border:1px solid rgba(246,196,69,0.34);border-radius:14px;">
            <p style="margin:0 0 10px;color:#F6C445;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:900;">${escapeHtml(k.product_name || 'License key')}</p>
            <p style="margin:0;padding:14px;background:#050505;border:1px dashed rgba(246,196,69,0.36);border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px;color:#fff;letter-spacing:0.8px;word-break:break-all;">${escapeHtml(k.key)}</p>
          </div>
        `).join('')}
        <p style="color:#8f8f8f;font-size:12px;line-height:1.5;margin:16px 0 0;">Open your <a href="${escapeAttr(portalBaseUrl)}/" style="color:#F6C445;font-weight:800;">customer portal</a> anytime to view keys, downloads, and tickets.</p>
      </div>` : `
      <div style="margin:20px 0 0;padding:18px;background:rgba(246,196,69,0.08);border:1px solid rgba(246,196,69,0.24);border-radius:16px;">
        <h3 style="color:#F6C445;margin:0 0 8px;font-size:17px;">Your key is being attached</h3>
        <p style="color:#c7c7c7;font-size:14px;line-height:1.55;margin:0;">If it is not visible instantly, staff will attach it shortly. Your portal always shows the newest status.</p>
      </div>`;

    const downloadsHTML = downloads && downloads.length > 0 ? `
      <div style="margin:20px 0 0;padding:20px;background:#101010;border-radius:18px;border:1px solid #2b2b2b;">
        <p style="margin:0 0 8px;color:#F6C445;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:900;">Loader download</p>
        <h3 style="color:#fff;margin:0 0 8px;font-size:20px;">Grab the right loader.</h3>
        <p style="color:#b8b8b8;font-size:14px;line-height:1.55;margin:0 0 16px;">Use the matching loader below, then sign in with your license key.</p>
        ${downloads.map((d) => `
          <div style="margin:10px 0;padding:16px;background:#090909;border:1px solid #2e2e2e;border-radius:14px;">
            <p style="margin:0 0 12px;color:#fff;font-size:15px;"><strong>${escapeHtml(d.product_name || 'Product loader')}</strong>${d.version ? ` <span style="color:#999;font-size:12px;">${escapeHtml(d.version)}</span>` : ''}</p>
            <a href="${escapeAttr(d.download_url)}" style="display:inline-block;padding:12px 18px;background:#F6C445;color:#0b0700;text-decoration:none;font-weight:900;border-radius:10px;">Download loader</a>
          </div>
        `).join('')}
        <p style="color:#8f8f8f;font-size:12px;margin:14px 0 0;">Loader links are also available in your customer portal.</p>
      </div>` : '';

    return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Creed order is confirmed</title>
</head>
<body style="margin:0;padding:0;background:#050505;color:#fff;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Creed order is confirmed. License keys, loader links, and portal access are inside.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505;padding:26px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#0b0b0b;border:1px solid #26210f;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.55);">
          <tr>
            <td style="padding:0;background:#050505;">
              <img src="${escapeAttr(heroImage)}" width="660" alt="Creed" style="display:block;width:100%;max-width:660px;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px 24px;background:#080808;border-bottom:1px solid #231f12;">
              <p style="margin:0 0 14px;color:#F6C445;font-size:12px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">Payment confirmed</p>
              <h1 style="margin:0;color:#fff;font-size:48px;line-height:0.95;letter-spacing:-2.5px;text-transform:uppercase;">You're in.</h1>
              <p style="margin:16px 0 0;color:#d7d7d7;font-size:16px;line-height:1.65;max-width:520px;">Your Creed order cleared. Your key, loader, and portal access are below — no hunting around, no “where is my stuff?” moment.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#101010;border:1px solid #2a2a2a;border-radius:16px;">
                <tr>
                  <td style="padding:16px;width:96px;vertical-align:top;">
                    <img src="${escapeAttr(productImage)}" width="84" height="84" alt="${escapeAttr(firstItemName)}" style="display:block;width:84px;height:84px;object-fit:cover;border-radius:12px;border:1px solid #2d2d2d;">
                  </td>
                  <td style="padding:16px 16px 16px 0;vertical-align:middle;">
                    <p style="margin:0 0 6px;color:#8f8f8f;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:900;">Main item</p>
                    <p style="margin:0;color:#fff;font-size:18px;font-weight:900;line-height:1.25;">${escapeHtml(firstItemName)}</p>
                    <p style="margin:7px 0 0;color:#bdbdbd;font-size:13px;line-height:1.4;">${escapeHtml(firstItemVariant)}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f0f0f;border:1px solid #272727;border-radius:16px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 7px;color:#8f8f8f;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:900;">Order ID</p>
                    <p style="margin:0;color:#F6C445;font-family:Consolas,Menlo,Monaco,monospace;font-size:15px;word-break:break-all;">${escapeHtml(order.id)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 16px;color:#bdbdbd;font-size:13px;">Purchased on ${escapeHtml(when)}</td>
                </tr>
              </table>

              ${licenseKeysHTML}
              ${downloadsHTML}

              <div style="margin:20px 0 0;padding:18px;background:#101010;border:1px solid #2b2b2b;border-radius:16px;">
                <p style="margin:0 0 7px;color:#F6C445;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:900;">Setup guide</p>
                <p style="margin:0 0 13px;color:#c7c7c7;font-size:14px;line-height:1.55;">Use the official product guide for setup steps and common troubleshooting.</p>
                <a href="${guideUrl}" style="display:inline-block;padding:11px 16px;background:#1b1b1b;border:1px solid rgba(246,196,69,0.36);color:#F6C445;text-decoration:none;font-weight:800;border-radius:10px;">Open product guide</a>
              </div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 0;padding:0;border-collapse:collapse;">
                <tr>
                  <td colspan="2" style="padding:0 0 10px;color:#F6C445;font-size:12px;font-weight:900;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid #333;">Receipt</td>
                </tr>
                ${itemRows}
                <tr>
                  <td style="padding:18px 0 0;color:#fff;font-size:18px;font-weight:900;">Total</td>
                  <td style="padding:18px 0 0;color:#F6C445;font-size:20px;font-weight:900;text-align:right;white-space:nowrap;">$${totalAmount} ${escapeHtml(order.currency)}</td>
                </tr>
              </table>

              <div style="margin:28px 0 10px;text-align:center;">
                <a href="${escapeAttr(portalBaseUrl)}/" style="display:block;padding:16px 20px;background:#F6C445;color:#0b0700;text-decoration:none;font-weight:900;border-radius:10px;font-size:15px;text-transform:uppercase;letter-spacing:0.3px;">Open customer portal</a>
              </div>
              <p style="margin:0;text-align:center;color:#999;font-size:13px;line-height:1.6;">Use your order ID to view keys, downloads, support tickets, and setup help.</p>

              <div style="margin-top:22px;padding:16px;border-radius:16px;background:rgba(246,196,69,0.08);border:1px solid rgba(246,196,69,0.2);color:#d8d8d8;font-size:13px;line-height:1.6;">
                <strong style="color:#F6C445;">Need help?</strong> Open a ticket from the portal and staff can check your order directly.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:#080808;border-top:1px solid #202020;text-align:center;color:#777;font-size:12px;line-height:1.7;">
              Need help? <a href="${escapeAttr(supportUrl)}" style="color:#F6C445;font-weight:700;">Contact support</a><br>
              Creed automated receipt. Replies to this address may not be monitored.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Customer receipt via Resend (HTML includes order id + portal URL + license keys).
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
export async function sendCustomerReceiptResend(order, portalBaseUrl, licenseKeys = [], downloads = []) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = resolveFromEmail();

    if (!RESEND_API_KEY) {
        console.error('lib-order-emails: RESEND_API_KEY missing');
        return { ok: false, error: 'RESEND_API_KEY missing' };
    }
    if (!FROM_EMAIL) {
        console.error('lib-order-emails: RESEND_FROM_EMAIL missing');
        return { ok: false, error: 'RESEND_FROM_EMAIL missing' };
    }
    if (isPlaceholderCustomerEmail(order.customerEmail)) {
        return { ok: false, error: 'No real customer email' };
    }

    const supportUrl = `${getStoreBaseUrl()}/support`;
    const guideUrl = 'https://asd-57.gitbook.io/creedv2-product-guide/l7LValhrIxIUPOFNH6gc/';
    const itemsListHTML = (order.items || []).map((item) => {
        const line = (parseFloat(item.price) || 0) * (item.quantity || 1);
        return `
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #222; color: #fff;">
                    <strong style="font-size: 16px;">${escapeHtml(String(item.name))} — ${escapeHtml(String(item.variant))}</strong><br>
                    <small style="color: #aaa; font-size: 13px;">Quantity: ${item.quantity}</small>
                </td>
                <td style="padding: 12px 0; border-bottom: 1px solid #222; color: #fff; text-align: right; font-weight: bold;">
                    $${line.toFixed(2)}
                </td>
            </tr>`;
    }).join('');

    // Build license keys HTML section
    let licenseKeysHTML = '';
    if (licenseKeys && licenseKeys.length > 0) {
        const keysList = licenseKeys.map(k => `
            <div style="margin: 12px 0; padding: 16px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px;">
                <p style="margin: 0 0 8px; color: #10b981; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;"><strong>${escapeHtml(k.product_name)}</strong></p>
                <p style="margin: 0; font-family: ui-monospace, monospace; font-size: 18px; color: #fff; letter-spacing: 1px;">${escapeHtml(k.key)}</p>
            </div>
        `).join('');
        
        licenseKeysHTML = `
            <div style="margin: 24px 0; padding: 20px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #333;">
                <h3 style="color: #10b981; margin: 0 0 16px; font-size: 16px;"><i>🔑</i> YOUR LICENSE KEYS</h3>
                <p style="color: #aaa; font-size: 13px; margin: 0 0 16px;">Save these keys — you'll need them to activate your product:</p>
                ${keysList}
                <p style="color: #888; font-size: 12px; margin: 16px 0 0;">These same keys are available in your <a href="${escapeAttr(portalBaseUrl)}/" style="color: #FFB800;">customer portal</a> anytime.</p>
            </div>
        `;
    }

    let downloadsHTML = '';
    if (downloads && downloads.length > 0) {
        downloadsHTML = `
            <div style="margin: 24px 0; padding: 20px; background: rgba(255,184,0,0.06); border-radius: 8px; border: 1px solid #4a3a00;">
                <h3 style="color: #FFB800; margin: 0 0 16px; font-size: 16px;">DOWNLOAD YOUR LOADER</h3>
                ${downloads.map(d => `
                    <div style="margin: 10px 0; padding: 14px; background: #151515; border: 1px solid #333; border-radius: 6px;">
                        <p style="margin: 0 0 10px; color: #fff;"><strong>${escapeHtml(d.product_name || 'Product loader')}</strong>${d.version ? ` <span style="color:#888;font-size:12px;">${escapeHtml(d.version)}</span>` : ''}</p>
                        <a href="${escapeAttr(d.download_url)}" style="display:inline-block;padding:10px 16px;background:#FFB800;color:#000;text-decoration:none;font-weight:bold;border-radius:5px;">Download loader</a>
                    </div>
                `).join('')}
                <p style="color:#888;font-size:12px;margin:14px 0 0;">Loader links are also available in your customer portal.</p>
            </div>`;
    }

    const totalAmount = parseFloat(String(order.amount)).toFixed(2);
    const when = new Date(order.createdAt).toLocaleString();

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0d0d; color: #ffffff; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111; border-radius: 8px; overflow: hidden; border: 1px solid #333;">
    <div style="background: linear-gradient(135deg, #FFB800 0%, #FFD700 100%); padding: 28px; text-align: center;">
      <h1 style="margin: 0; color: #000; font-size: 24px;">Order confirmed</h1>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 16px;">Hi,</p>
      <p style="color: #aaa; font-size: 15px;">Thanks for your purchase. Here are your details.</p>
      
      ${licenseKeysHTML}
      ${downloadsHTML}
      
      <div style="margin: 20px 0; padding: 16px; background: rgba(255,184,0,0.08); border-left: 4px solid #FFB800; border-radius: 4px;">
        <p style="margin: 6px 0; color: #eee;"><strong>Order id</strong></p>
        <p style="margin: 6px 0; font-family: ui-monospace, monospace; font-size: 16px; color: #FFB800;">${escapeHtml(order.id)}</p>
        <p style="margin: 12px 0 4px; color: #eee;"><strong>Date</strong></p>
        <p style="margin: 0; color: #ccc; font-size: 14px;">${escapeHtml(when)}</p>
      </div>
      <h3 style="color: #FFB800; border-bottom: 1px solid #333; padding-bottom: 10px;">Items</h3>
      <table style="width: 100%; border-collapse: collapse;">${itemsListHTML}</table>
      <table style="width: 100%; margin-top: 16px;">
        <tr>
          <td style="padding-top: 12px; border-top: 2px solid #333; color: #FFB800; font-size: 18px; font-weight: bold;">Total</td>
          <td style="padding-top: 12px; border-top: 2px solid #333; color: #FFB800; font-size: 18px; font-weight: bold; text-align: right;">$${totalAmount} ${escapeHtml(order.currency)}</td>
        </tr>
      </table>
      <div style="text-align: center; margin: 28px 0 12px;">
        <a href="${escapeAttr(portalBaseUrl)}/" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #FFB800 0%, #FFD700 100%); color: #000; text-decoration: none; font-weight: bold; border-radius: 6px;">Open customer portal</a>
      </div>
      <p style="color: #999; font-size: 13px; line-height: 1.5;">Sign in with your <strong>order id</strong> above to open support tickets and download loaders.</p>
      <div style="text-align: center; margin-top: 16px;">
        <a href="${guideUrl}" style="color: #FFB800;">Open product guide</a>
        <span style="color:#666; padding:0 7px;">&bull;</span>
        <a href="${escapeAttr(supportUrl)}" style="color: #FFB800;">Help &amp; support</a>
      </div>
    </div>
    <div style="text-align: center; padding: 16px; color: #666; font-size: 12px; background: #0a0a0a; border-top: 1px solid #222;">
      Creed — automated message. Replies to this address may not be monitored.
    </div>
  </div>
</body></html>`;

    const premiumEmailHtml = buildPremiumCustomerReceiptHtml(order, portalBaseUrl, licenseKeys, downloads, supportUrl);

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: `Creed Store <${FROM_EMAIL}>`,
            to: [order.customerEmail.trim()],
            subject: 'Your order is confirmed — Creed',
            html: premiumEmailHtml,
            text: htmlToText(premiumEmailHtml),
            ...(resolveReplyTo() ? { reply_to: resolveReplyTo() } : {}),
        }),
    });

    const rawText = await res.text();
    let data;
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        data = { raw: rawText };
    }
    if (!res.ok) {
        console.error('Resend error:', res.status, data);
        return { ok: false, error: data?.message || rawText || res.statusText };
    }
    console.log('Resend customer receipt sent:', data?.id || 'ok');
    return { ok: true, data };
}

/**
 * Email customer when staff replies on a portal ticket (Resend).
 * @returns {{ ok: boolean, error?: string }}
 */
export async function sendTicketReplyNotificationEmail({
    customerEmail,
    orderId,
    ticketId,
    ticketSubject,
    replySnippet,
}) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = resolveFromEmail();

    if (!RESEND_API_KEY) {
        console.error('sendTicketReplyNotificationEmail: RESEND_API_KEY missing');
        return { ok: false, error: 'RESEND_API_KEY missing' };
    }
    if (!FROM_EMAIL) {
        console.error('sendTicketReplyNotificationEmail: RESEND_FROM_EMAIL missing');
        return { ok: false, error: 'RESEND_FROM_EMAIL missing' };
    }
    const em = String(customerEmail || '')
        .trim()
        .toLowerCase();
    if (!em || em === 'customer@creed.com') {
        return { ok: false, error: 'No real customer email' };
    }

    const portalBase = getPortalBaseUrl();
    const supportUrl = `${getStoreBaseUrl()}/support`;
    const preview = String(replySnippet || '')
        .trim()
        .slice(0, 600);
    const subj = String(ticketSubject || 'Support ticket').trim().slice(0, 120);

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0d0d; color: #ffffff; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111; border-radius: 8px; overflow: hidden; border: 1px solid #333;">
    <div style="background: linear-gradient(135deg, #FFB800 0%, #FFD700 100%); padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #000; font-size: 22px;">New reply on your support ticket</h1>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; color: #ccc;">Our team replied to your ticket <strong style="color:#FFB800;">${escapeHtml(subj)}</strong>.</p>
      <div style="margin: 18px 0; padding: 16px; background: rgba(0,0,0,0.45); border-radius: 8px; border-left: 4px solid #FFB800;">
        <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #888;">Preview</p>
        <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.55; color: #e5e5e5;">${escapeHtml(preview)}</p>
      </div>
      <p style="font-size: 13px; color: #888;">Order id: <code style="color:#FFB800;">${escapeHtml(String(orderId))}</code></p>
      <div style="text-align: center; margin: 28px 0 12px;">
        <a href="${escapeAttr(portalBase)}/" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #FFB800 0%, #FFD700 100%); color: #000; text-decoration: none; font-weight: bold; border-radius: 6px;">Open customer portal</a>
      </div>
      <p style="color: #777; font-size: 13px; line-height: 1.5;">Sign in with your <strong>order id</strong> and open <strong># support</strong> to read the full thread.</p>
      <div style="text-align: center; margin-top: 16px;">
        <a href="${escapeAttr(supportUrl)}" style="color: #FFB800;">Help &amp; support</a>
      </div>
    </div>
    <div style="text-align: center; padding: 16px; color: #666; font-size: 12px; background: #0a0a0a; border-top: 1px solid #222;">
      Creed — ticket notification. Replies to this email may not be monitored; use the portal thread instead.
    </div>
  </div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: `Creed Support <${FROM_EMAIL}>`,
            to: [em],
            subject: `Re: ${subj} — Creed support`,
            html: emailHtml,
            text: htmlToText(emailHtml),
            ...(resolveReplyTo() ? { reply_to: resolveReplyTo() } : {}),
        }),
    });

    const rawText = await res.text();
    let data;
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        data = { raw: rawText };
    }
    if (!res.ok) {
        console.error('sendTicketReplyNotificationEmail Resend:', res.status, data);
        return { ok: false, error: data?.message || rawText || res.statusText };
    }
    return { ok: true, data };
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
}

/**
 * Admin notification via EmailJS (existing integration).
 * @returns {Promise<{ ok: boolean }>}
 */
export async function sendAdminOrderEmailJS(order, portalBaseUrl, licenseKeys = []) {
    const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
    const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
    const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
    const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;

    const ADMIN_EMAILS = ['circuitcash5@gmail.com'];

    const itemsList = (order.items || []).map(
        (item) =>
            `  • ${item.name} — ${item.variant} (x${item.quantity}) — $${(parseFloat(item.price) * item.quantity).toFixed(2)}`
    ).join('\n');

    const totalUSD = (order.items || []).reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

    const adminDashboard = process.env.ADMIN_DASHBOARD_URL || `${getStoreBaseUrl()}/admin`;
    
    // Build license keys section for admin
    let keysSection = '';
    if (licenseKeys && licenseKeys.length > 0) {
        const keysList = licenseKeys.map(k => `  ✓ ${k.product_name}: ${k.key}`).join('\n');
        keysSection = `\n\nLICENSE KEYS ASSIGNED:\n${keysList}`;
    } else {
        keysSection = '\n\n⚠ No license keys available (out of stock)';
    }

    const emailHtml = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff;">
    <div style="background: linear-gradient(135deg, #FFB800 0%, #FFD700 100%); padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #000;">New order</h1>
    </div>
    <div style="padding: 24px;">
      <p><strong>Order id:</strong> ${escapeHtml(order.id)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(order.customerEmail || '—')}</p>
      <p><strong>Portal:</strong> <a href="${escapeAttr(portalBaseUrl)}/">${escapeHtml(portalBaseUrl)}/</a></p>
      <p><strong>Total:</strong> $${totalUSD.toFixed(2)} (${escapeHtml(String(order.amount))} ${escapeHtml(order.currency)})</p>
      <pre style="background: #f5f5f5; padding: 12px; white-space: pre-wrap;">${escapeHtml(itemsList)}</pre>
      ${licenseKeys && licenseKeys.length > 0 
          ? `<div style="background: #e8f5e9; border: 1px solid #4caf50; padding: 12px; margin: 16px 0; border-radius: 4px;"><strong>✓ License Keys Assigned:</strong><br>${licenseKeys.map(k => `• ${escapeHtml(k.product_name)}: ${escapeHtml(k.key)}`).join('<br>')}</div>`
          : `<div style="background: #fff3e0; border: 1px solid #ff9800; padding: 12px; margin: 16px 0; border-radius: 4px;"><strong>⚠ No license keys available</strong> (out of stock)</div>`
      }
      <p><a href="${escapeAttr(adminDashboard)}">Admin</a></p>
    </div>
  </div>
</body></html>`;

    const emailText = `New order ${order.id}\nCustomer: ${order.customerEmail}\nPortal: ${portalBaseUrl}/\nTotal: $${totalUSD.toFixed(2)}\n\n${itemsList}${licenseKeys && licenseKeys.length > 0 ? '\n\nLicense Keys:\n' + licenseKeys.map(k => `• ${k.product_name}: ${k.key}`).join('\n') : '\n\n⚠ No license keys available'}`;

    let anyOk = false;
    for (const adminEmail of ADMIN_EMAILS) {
        const templateParams = {
            to_email: adminEmail,
            to_name: 'Admin',
            order_id: order.id,
            session_id: order.sessionId,
            customer_email: order.customerEmail || 'N/A',
            order_date: new Date(order.createdAt).toLocaleString(),
            items_html: (order.items || [])
                .map(
                    (item) =>
                        `<strong>${escapeHtml(item.name)} — ${escapeHtml(item.variant)}</strong> × ${item.quantity} — $${(parseFloat(item.price) * item.quantity).toFixed(2)}`
                )
                .join('<br>'),
            items_text: itemsList,
            total_usd: `$${totalUSD.toFixed(2)}`,
            portal_url: `${portalBaseUrl}/`,
            email_html: emailHtml,
            email_subject: `🎮 New order #${order.id} — $${totalUSD.toFixed(2)}`,
            email_message: emailText,
            license_keys: licenseKeys && licenseKeys.length > 0 
                ? licenseKeys.map(k => `${k.product_name}: ${k.key}`).join('\n')
                : 'No keys available (out of stock)',
        };

        try {
            const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: EMAILJS_SERVICE_ID,
                    template_id: EMAILJS_TEMPLATE_ID,
                    user_id: EMAILJS_PUBLIC_KEY,
                    accessToken: EMAILJS_PRIVATE_KEY,
                    template_params: templateParams,
                }),
            });

            if (!emailResponse.ok) {
                const errText = await emailResponse.text();
                console.error('EmailJS admin', adminEmail, errText);
            } else {
                anyOk = true;
            }
        } catch (e) {
            console.error('EmailJS admin', adminEmail, e.message);
        }
    }

    return { ok: anyOk };
}

/**
 * Send admin + customer emails once per order (deduped via `receipt_email_sent_at` when column exists).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} orderRow — full `orders` row from Supabase
 * @param {Array} licenseKeys — optional license keys to include in customer email
 */
export async function sendOrderPaidEmailsOnce(supabase, orderRow, licenseKeys = []) {
    console.log('sendOrderPaidEmailsOnce called for order:', orderRow?.id, 'with', licenseKeys?.length || 0, 'keys');
    
    if (!orderRow?.id) {
        console.log('Skipping email: invalid row (no id)');
        return { skipped: true, reason: 'invalid row' };
    }
    
    // Only check status if it's explicitly set
    if (orderRow.status && orderRow.status !== 'completed') {
        console.log('Skipping email: status is', orderRow.status);
        return { skipped: true, reason: 'not completed', status: orderRow.status };
    }
    
    if (orderRow.receipt_email_sent_at) {
        console.log('Warning: email already sent at', orderRow.receipt_email_sent_at, '- sending again anyway');
        // Don't skip - still send even if already marked (for retries)
    }

    // Normalize so callers passing camelCase (webhook.js: customerEmail) or
    // snake_case (portal-bootstrap.js: full DB row) both resolve correctly.
    // Previously only snake_case was read, so webhook-fired emails were skipped.
    const payload = normalizeOrderInput(orderRow) || orderRowToEmailPayload(orderRow);
    const portalBase = getPortalBaseUrl();

    const canonicalProduct = (value, name = '') => {
        const raw = String(value || '').toLowerCase().trim();
        const text = `${raw} ${String(name || '').toLowerCase()}`;
        if (raw === 'perm-spoofer' || raw === 'spoofer-perm') return 'spoofer-perm';
        if (raw === 'temp-spoofer' || raw === 'spoofer-temp') return 'spoofer-temp';
        if (raw === 'cod-black-ops-7' || raw === 'cod') return 'cod';
        if (raw === 'apex-legends' || raw === 'apex') return 'apex';
        if (raw === 'fortnite-public' || raw === 'fortnite-private' || raw === 'fortnite') return 'fortnite';
        if (text.includes('fortnite')) return 'fortnite';
        if (text.includes('apex')) return 'apex';
        if (text.includes('rainbow')) return 'rainbow-six';
        if (text.includes('rust')) return 'rust';
        if (text.includes('arc')) return 'arc-raiders';
        if (text.includes('valorant')) return 'valorant';
        if (text.includes('perm') && text.includes('spoofer')) return 'spoofer-perm';
        if (text.includes('temp') && text.includes('spoofer')) return 'spoofer-temp';
        if (text.includes('aimbot') || text.includes('ai-aim')) return 'aimbot';
        if (text.includes('cod') || text.includes('call of duty') || text.includes('black-ops')) return 'cod';
        return String(value || '').toLowerCase().trim();
    };
    const orderedProducts = new Set((orderRow.items || []).map(i => canonicalProduct(i.product_id || i.id, i.name)));
    let matchedDownloads = [];
    const { data: configuredDownloads, error: downloadsError } = await supabase
        .from('product_downloads')
        .select('product_id, product_name, download_url, version, supports, is_active')
        .eq('is_active', true);
    if (downloadsError) {
        console.warn('Could not load product downloads for receipt:', downloadsError.message);
    } else {
        matchedDownloads = (configuredDownloads || []).filter(d =>
            d.download_url && d.download_url !== '#' && orderedProducts.has(canonicalProduct(d.product_id, d.product_name))
        );
    }

    let adminOk = false;
    let customerResult = { ok: false };

    try {
        const ar = await sendAdminOrderEmailJS(payload, portalBase, licenseKeys);
        adminOk = ar.ok === true;
    } catch (e) {
        console.error('sendOrderPaidEmailsOnce admin:', e.message);
    }

    if (!isPlaceholderCustomerEmail(payload.customerEmail)) {
        customerResult = await sendCustomerReceiptResend(payload, portalBase, licenseKeys, matchedDownloads);
    } else {
        customerResult = { ok: false, error: 'placeholder email' };
    }

    const shouldMark =
        (customerResult.ok === true) ||
        (isPlaceholderCustomerEmail(payload.customerEmail) && adminOk);

    if (shouldMark) {
        const { error: upErr } = await supabase
            .from('orders')
            .update({ receipt_email_sent_at: new Date().toISOString() })
            .eq('id', orderRow.id);
        if (upErr) {
            console.warn('receipt_email_sent_at update (run SQL migration if missing):', upErr.message);
        }
    }

    return {
        adminOk,
        customer: customerResult,
        markedSent: shouldMark,
    };
}
