/**
 * Sale alerts → Pushover (iPhone app, custom sounds). Optional ntfy / Discord.
 *
 * PUSHOVER_USER_KEY   — Your User Key from https://pushover.net/
 * PUSHOVER_API_TOKEN  — App token (create "Creed" at https://pushover.net/apps/build)
 * PUSHOVER_SOUND      — optional, default cashregister
 *   https://pushover.net/api#sounds
 */
function itemNames(items) {
  if (!Array.isArray(items) || !items.length) return 'sale';
  return items
    .map((i) => {
      const name = i?.name || i?.title || i?.product || 'item';
      const variant = i?.variant || i?.size || '';
      return variant ? `${name} (${variant})` : name;
    })
    .slice(0, 4)
    .join(', ');
}

function money(amount, currency) {
  const n = Number(amount);
  const cur = String(currency || 'USD').toUpperCase();
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
}

export function saleNotifyPayload(order) {
  const id = order?.id || order?.orderId || '';
  const amount = money(order?.amount, order?.currency);
  const products = itemNames(order?.items);
  const email = order?.customerEmail || order?.customer_email || '';
  const method = order?.paymentMethod || order?.payment_method || '';
  const title = amount ? `${amount} · ${products}` : `Creed sale · ${products}`;
  const body = [amount && `Amount: ${amount}`, `Product: ${products}`, email && `Email: ${email}`, method && `Paid: ${method}`, id && `Order: ${id}`]
    .filter(Boolean)
    .join('\n');
  return { title: title.slice(0, 250), body, id: String(id) };
}

async function postPushover({ title, body }) {
  const user = String(process.env.PUSHOVER_USER_KEY || '').trim();
  const token = String(process.env.PUSHOVER_API_TOKEN || '').trim();
  if (!user || !token) return;
  const sound = String(process.env.PUSHOVER_SOUND || 'cashregister').trim() || 'cashregister';
  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      user,
      title,
      message: body || title,
      sound,
      priority: '1',
      url: 'https://www.creedv2.com/admin',
      url_title: 'Open admin',
    }),
  });
  if (!res.ok) {
    console.warn('pushover sale notify failed', res.status, await res.text().catch(() => ''));
  }
}

async function postNtfy({ title, body, id }) {
  const topic = String(process.env.NTFY_TOPIC || '').trim().replace(/^\/+|\/+$/g, '');
  if (!topic) return;
  const server = String(process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  const res = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: {
      Title: title,
      Priority: 'high',
      Tags: 'moneybag,creed',
      Click: 'https://www.creedv2.com/admin',
      ...(id ? { 'X-Event-Id': id } : {}),
    },
    body,
  });
  if (!res.ok) {
    console.warn('ntfy sale notify failed', res.status, await res.text().catch(() => ''));
  }
}

async function postDiscord({ title, body }) {
  const url = String(process.env.DISCORD_SALES_WEBHOOK_URL || '').trim();
  if (!url) return;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `**${title}**\n${body}` }),
  });
  if (!res.ok) {
    console.warn('discord sale notify failed', res.status);
  }
}

export async function notifySale(order) {
  try {
    const payload = saleNotifyPayload(order);
    await Promise.allSettled([postPushover(payload), postNtfy(payload), postDiscord(payload)]);
  } catch (e) {
    console.warn('sale notify error', e?.message || e);
  }
}

/** Supabase `orders` row (snake_case). */
export function notifySaleFromRow(row, paymentMethod) {
  if (!row) return Promise.resolve();
  return notifySale({
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    items: row.items,
    customerEmail: row.customer_email,
    paymentMethod,
  });
}
