/* =========================================
   CREED — Signed HttpOnly cookie for storefront maintenance unlock
   ========================================= */

import { createHmac, timingSafeEqual } from 'crypto';

export const MAINTENANCE_COOKIE_NAME = 'creed_maint';
const MAX_AGE_SEC = 7 * 24 * 60 * 60;

export function maintenanceCookieSecret() {
    return String(process.env.MAINTENANCE_COOKIE_SECRET || process.env.ADMIN_TOKEN || '').trim();
}

/** @returns {string} "expUnix.sigHex" */
export function signMaintenanceCookie() {
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
    const payload = String(exp);
    const sig = createHmac('sha256', maintenanceCookieSecret()).update(payload).digest('hex');
    return `${payload}.${sig}`;
}

/** @param {string|undefined} cookieHeader */
export function verifyMaintenanceCookie(cookieHeader) {
    if (!cookieHeader || typeof cookieHeader !== 'string') return false;
    const re = new RegExp(`(?:^|;\\s*)${MAINTENANCE_COOKIE_NAME}=([^;]+)`);
    const m = re.exec(cookieHeader);
    if (!m) return false;
    let raw = m[1].trim();
    try {
        raw = decodeURIComponent(raw);
    } catch (_) {
        /* keep */
    }
    const dot = raw.indexOf('.');
    if (dot === -1) return false;
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const expected = createHmac('sha256', maintenanceCookieSecret()).update(payload).digest('hex');
    try {
        if (sig.length !== expected.length) return false;
        if (!timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) return false;
    } catch {
        return false;
    }
    if (Number(payload) < Math.floor(Date.now() / 1000)) return false;
    return true;
}
