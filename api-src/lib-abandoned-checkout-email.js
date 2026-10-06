import { productPathFor } from './lib-abandoned-checkout-score.js';

const EMAIL_CAMPAIGN = 'abandoned-checkout';

export function storeBase() {
  return String(process.env.STORE_URL || 'https://www.creedv2.com').replace(/\/$/, '');
}

export function withEmailTracking(targetUrl, content, token, extra = {}) {
  const hop = new URL('/email-go.html', `${storeBase()}/`);
  hop.searchParams.set('utm_medium', 'email');
  hop.searchParams.set('utm_source', 'creed');
  hop.searchParams.set('utm_campaign', EMAIL_CAMPAIGN);
  if (content) hop.searchParams.set('utm_content', String(content));
  if (token) hop.searchParams.set('t', String(token));
  if (extra.discount) hop.searchParams.set('discount', String(extra.discount));
  if (targetUrl) hop.searchParams.set('next', String(targetUrl));
  return hop.toString();
}

export function productImageFor(items = []) {
  const text = items.map((i) => `${i?.name || ''} ${i?.variant || ''} ${i?.id || ''}`).join(' ').toLowerCase();
  const base = storeBase();
  if (text.includes('rust')) return `${base}/assets/rustproduct.png`;
  if (text.includes('fortnite')) return `${base}/assets/fortnitepublic.png`;
  if (text.includes('rainbow') || text.includes('r6')) return `${base}/assets/rainbow6product.png`;
  if (text.includes('apex')) return `${base}/assets/apexproduct.png`;
  if (text.includes('arc')) return `${base}/assets/arcaraidersproduct.png`;
  if (text.includes('spoof')) return `${base}/assets/tempspoofer.png`;
  if (text.includes('cod') || text.includes('warzone') || text.includes('black ops')) return `${base}/assets/callofdutyproduct.png`;
  return `${base}/assets/creedembed.png`;
}

export function normalizeItems(raw) {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter((item) => item && item.id !== '_meta')
    .map((item) => ({
      id: String(item?.id || item?.product_id || ''),
      name: String(item?.name || item?.title || item?.product || 'Creed access'),
      variant: String(item?.variant || item?.duration || 'Access'),
      quantity: Math.max(1, Number(item?.quantity) || 1),
      price: Number.parseFloat(String(item?.price || 0)) || 0,
    }));
}

function money(value, currency = 'USD') {
  const n = Number.parseFloat(String(value || 0));
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)} ${String(currency || 'USD').toUpperCase()}`;
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

export function buildAbandonedCheckoutEmail({ order, checkoutUrl, token, tier }) {
  const base = storeBase();
  const items = normalizeItems(order.items);
  const mainItem = items[0] || { name: 'Your Creed cart', variant: 'Instant access', quantity: 1, price: 0 };
  const productImage = productImageFor(items);
  const discount = tier?.code || 'ACE5';
  const percent = tier?.percent || 5;
  const extra = { discount };
  const ctaUrl = withEmailTracking(checkoutUrl, 'complete-checkout', token, extra);
  const productUrl = withEmailTracking(`${base}${productPathFor(items)}`, 'product', token, extra);
  const discordUrl = withEmailTracking('https://discord.gg/creedgg', 'discord', token, extra);
  const supportUrl = withEmailTracking(`${base}/support`, 'support', token, extra);
  const productsUrl = withEmailTracking(`${base}/products`, 'browse', token, extra);
  const openPixel = token ? `${base}/api/email-open?t=${encodeURIComponent(token)}` : '';
  const productRows = items
    .map((item) => {
      const line = item.price * item.quantity;
      return `
          <tr>
            <td style="padding:13px 0;border-bottom:1px solid #25210f;color:#ffffff;">
              <strong style="display:block;font-size:15px;line-height:1.35;">${escapeHtml(item.name)}</strong>
              <span style="display:block;margin-top:4px;color:#aaa;font-size:12px;">${escapeHtml(item.variant)} &bull; Qty ${item.quantity}</span>
            </td>
            <td style="padding:13px 0;border-bottom:1px solid #25210f;text-align:right;color:#f6c445;font-size:15px;font-weight:900;white-space:nowrap;">$${line.toFixed(2)}</td>
          </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You left your cheat behind</title>
</head>
<body style="margin:0;padding:0;background:#050505;color:#fff;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">You left your cheat behind. Use ${escapeHtml(discount)} for ${percent}% off.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505;padding:26px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#000000;overflow:hidden;">
          <tr>
            <td style="padding:0;text-align:center;">
              <a href="${escapeAttr(ctaUrl)}"><img src="https://res.cloudinary.com/ediv581m/image/upload/v1786141579/foai3dljj9l9ynxvaxkt.jpg" width="600" alt="Don't forget your cheat" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a>
              <a href="${escapeAttr(ctaUrl)}"><img src="https://res.cloudinary.com/ediv581m/image/upload/v1786141582/tm7yglsxiwf6uiokwn0g.jpg" width="600" alt="Complete your order" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px 28px;">
              <a href="${escapeAttr(ctaUrl)}" style="display:block;text-decoration:none;margin:0 0 18px;padding:16px 18px;background:#16120a;border:1px solid #f6c445;border-radius:16px;text-align:center;">
                <p style="margin:0 0 6px;color:#f6c445;font-size:11px;letter-spacing:1.8px;text-transform:uppercase;font-weight:900;">Your checkout discount</p>
                <p style="margin:0;color:#fff;font-size:28px;font-weight:900;letter-spacing:1px;">${escapeHtml(discount)}</p>
                <p style="margin:8px 0 0;color:#f6c445;font-size:16px;font-weight:900;">${percent}% off if you finish now</p>
              </a>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#101010;border:1px solid #2b2b2b;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="padding:16px;width:104px;vertical-align:top;">
                    <a href="${escapeAttr(ctaUrl)}"><img src="${escapeAttr(productImage)}" width="92" height="92" alt="${escapeAttr(mainItem.name)}" style="display:block;width:92px;height:92px;object-fit:cover;border-radius:14px;border:1px solid #343434;"></a>
                  </td>
                  <td style="padding:16px 16px 16px 0;vertical-align:middle;">
                    <p style="margin:0 0 6px;color:#8f8f8f;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;font-weight:900;">Waiting in cart</p>
                    <p style="margin:0;color:#fff;font-size:19px;font-weight:900;line-height:1.24;">${escapeHtml(mainItem.name)}</p>
                    <p style="margin:7px 0 0;color:#bdbdbd;font-size:13px;line-height:1.45;">${escapeHtml(mainItem.variant)}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:collapse;">
                ${productRows}
                <tr>
                  <td style="padding:17px 0 0;color:#fff;font-size:18px;font-weight:900;">Cart total</td>
                  <td style="padding:17px 0 0;color:#f6c445;font-size:20px;font-weight:900;text-align:right;white-space:nowrap;">${escapeHtml(money(order.amount, order.currency))}</td>
                </tr>
              </table>

              <div style="margin:28px 0 12px;text-align:center;">
                <a href="${escapeAttr(ctaUrl)}" style="display:block;padding:16px 20px;background:#f6c445;color:#070500;text-decoration:none;font-weight:900;border-radius:12px;font-size:15px;text-transform:uppercase;letter-spacing:0.2px;">Complete checkout · ${percent}% off</a>
              </div>
              <div style="margin:0 0 8px;text-align:center;">
                <a href="${escapeAttr(productsUrl)}" style="display:inline-block;padding:12px 16px;color:#f6c445;text-decoration:none;font-weight:800;font-size:13px;">Browse products</a>
              </div>

              <p style="margin:18px 0 0;color:#888;font-size:12px;line-height:1.65;text-align:center;">Code <strong style="color:#fff;">${escapeHtml(discount)}</strong> is applied when you come back through this email. No pressure if you changed your mind.</p>
            </td>
          </tr>
          <tr><td style="padding:0;"><a href="${escapeAttr(ctaUrl)}"><img src="https://res.cloudinary.com/ediv581m/image/upload/v1786141583/ux61vzuvgi1lgg4kgf6l.jpg" width="600" alt="If you can't beat them, cheat them" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>
          <tr><td style="padding:0;"><a href="${escapeAttr(discordUrl)}"><img src="https://res.cloudinary.com/ediv581m/image/upload/v1786141581/maotpwucwby8i41parm1.jpg" width="600" alt="Join the Creed community" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>
          <tr>
            <td style="padding:18px 28px;background:#080808;border-top:1px solid #202020;text-align:center;color:#777;font-size:12px;line-height:1.7;">
              Creed reminder &bull; <a href="${escapeAttr(supportUrl)}" style="color:#f6c445;font-weight:700;">Support</a> &bull; <a href="${escapeAttr(productUrl)}" style="color:#f6c445;font-weight:700;">Your product</a> &bull; <a href="${escapeAttr(`${base}/unsubscribe?email=${encodeURIComponent(order.customer_email || '')}`)}" style="color:#999;">Unsubscribe</a>
              ${openPixel ? `<img src="${escapeAttr(openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
