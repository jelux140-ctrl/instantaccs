import handler from '../../api/cron-seed-vouch.js';
import { adapt } from '../adapter.js';

const inner = adapt(handler);

/*
 * Netlify Scheduled Function. Vercel Cron auto-added an Authorization header
 * from CRON_SECRET; Netlify does not, so inject it here so verifyAuth() passes
 * for the automated invocation. Manual force-testing still works via the HTTP
 * route /api/cron-seed-vouch?force=1&token=<CRON_SECRET or ADMIN_TOKEN>.
 */
export default async (request) => {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_TOKEN || '';
  const headers = new Headers(request.headers);
  if (!headers.get('authorization') && secret) {
    headers.set('authorization', 'Bearer ' + secret);
  }
  const proxied = new Request(request.url, { method: 'POST', headers });
  return inner(proxied);
};

// Six evenly spaced opportunities daily; the handler stops at its daily target of 4 or 5.
export const config = { schedule: '0 */4 * * *' };
