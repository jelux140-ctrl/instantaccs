/* =========================================
   CREED — RESELLER KEY INTEGRATION
   Mints license keys on-demand from the reseller API
   (https://access.chairfbi.com) instead of pulling from the
   local license_keys table. Used for all products EXCEPT those
   listed in LOCAL_ONLY_PRODUCTS (Rainbow Six Siege + Temp Spoofer),
   which keep using the local license_keys table.
   ========================================= */

const RESELLER_BASE_URL = process.env.RESELLER_API_URL || 'https://access.chairfbi.com';
const RESELLER_API_TOKEN = process.env.RESELLER_API_TOKEN || '';

/**
 * Creed canonical product id  ->  reseller "cheat"/product id.
 * Values taken from the reseller /api/cheats catalog.
 * Rainbow Six (4112) and Temp Spoofer are intentionally omitted
 * (handled locally). Update these as the reseller catalog changes.
 */
const PRODUCT_TO_CHEAT = {
    'fortnite-public': 3438,   // Fortnite External
    'fortnite-private': 3438,  // Fortnite External
    'apex-legends': 3848,      // Apex Legends
    'rust': 4240,              // Rust Internal (fallback 4096 Rust External)
    'arc-raiders': 3847,       // Arc Raiders
    'cod-black-ops-7': 3559,   // COD BO6/BO7/Warzone
    'perm-spoofer': 4252,      // Spoofer
    // valorant / ai-aimbot / marvel-rivals are NOT in the
    // reseller catalog — they fall through to local keys (or no key if empty).
};

/** Products that must always use the local license_keys table. */
const LOCAL_ONLY_PRODUCTS = new Set(['rainbow-six', 'temp-spoofer']);

/** Map a Creed duration label to reseller "days". */
function durationToDays(duration) {
    const d = String(duration || '').toLowerCase();
    if (d.includes('lifetime') || d.includes('perm') || d.includes('life')) return 365;
    if (d.includes('90')) return 90;
    if (d.includes('month') || d.includes('30')) return 30;
    if (d.includes('week') || d.includes('7')) return 7;
    if (d.includes('3 day')) return 3;
    return 1; // default: 1 Day
}

export function usesReseller(productId) {
    if (!productId) return false;
    if (LOCAL_ONLY_PRODUCTS.has(productId)) return false;
    return Boolean(PRODUCT_TO_CHEAT[productId]);
}

/**
 * Mint a single key from the reseller API for a given product + duration.
 * Returns the key string, or null on any failure (caller falls back to local).
 */
export async function mintResellerKey(productId, duration) {
    if (!usesReseller(productId)) return null;
    if (!RESELLER_API_TOKEN) {
        console.error('[reseller] RESELLER_API_TOKEN missing — cannot mint key for', productId);
        return null;
    }
    const cheat = PRODUCT_TO_CHEAT[productId];
    const days = durationToDays(duration);

    const body = JSON.stringify({ cheat, amount: 1, days });
    try {
        const res = await fetch(`${RESELLER_BASE_URL}/api/keys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${RESELLER_API_TOKEN}`,
            },
            body,
        });

        const text = await res.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = {};
        }

        if (!res.ok) {
            console.error('[reseller] create key failed:', res.status, data?.message || data?.code || text);
            return null;
        }

        const keys = data?.keys;
        if (Array.isArray(keys) && keys.length > 0) {
            console.log(`[reseller] minted key for ${productId} (cheat ${cheat}, ${days}d):`, keys[0]);
            return keys[0];
        }
        console.error('[reseller] no keys in response for', productId, data);
        return null;
    } catch (e) {
        console.error('[reseller] request error for', productId, e.message);
        return null;
    }
}
