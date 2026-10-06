/* =========================================
   CREED - SERVER-SIDE PRICING (single source of truth)

   Prices are NEVER taken from the client. Every checkout path - Stripe,
   manual crypto/PayPal, and wallet credits - prices the cart here, so a
   tampered request cannot buy a lifetime licence for a penny.

   This lives in one module deliberately. The catalog was previously copied
   into create-payment.js and create-manual-payment.js; identical at the time,
   but any future drift between them would itself be an exploit - the
   attacker simply sends the cart to whichever endpoint is cheapest.
   ========================================= */

export const VALID_DISCOUNT_CODES = Object.freeze({
    CREED5: 5,
    CREED10: 10,
    CREED20: 20,
    CREEDEM20: 20,
    CREEDFLASH: 40,
});

/* Must stay in step with DigitalVault's api/lib-pricing.js - that catalog
   governs card checkout, this one governs crypto/PayPal and wallet credits.
   Both spellings of the weekly/monthly keys are carried because product pages
   send data-duration verbatim ("1 Week") while older carts used "7 days".

   fortnite-private and ai-aimbot are deliberately omitted: discontinued. They
   were absent from DigitalVault but still present here, which meant they could
   no longer be bought by card yet remained purchasable via crypto/PayPal. */
export const PRICE_CATALOG = Object.freeze({
    'fortnite-public': { '1 day': 7.99, '1 week': 27.99, '1 month': 47.99, lifetime: 249.99 },
    'rainbow-six': { '1 day': 7.99, '1 week': 32.99, '7 days': 32.99, '1 month': 59.99, '30 days': 59.99, lifetime: 299.99 },
    rust: { '1 day': 9.99, '3 days': 18.99, '1 week': 32.99, '1 month': 61.99, lifetime: 299.99 },
    'apex-legends': { '1 day': 7.90, '3 days': 16.90, '1 week': 24.99, '7 days': 24.99, '1 month': 49.90, lifetime: 179.99 },
    'arc-raiders': { '1 day': 9.99, '1 week': 32.99, '7 days': 32.99, '1 month': 54.99, '30 days': 54.99, lifetime: 279.99 },
    'cod-black-ops-7': { day: 4.99, week: 19.99, month: 39.99, lifetime: 119.99 },
    valorant: { day: 7.99, week: 19.99, month: 34.99, lifetime: 169.99 },
    'temp-spoofer': { day: 4.99, week: 19.99, month: 24.99, lifetime: 49.99, 'add-on protection': 19.65 },
    'perm-spoofer': { 'one-time usage': 24.99, 'lifetime usage': 69.99 },
    // --- Game accounts (skins). Variant keys must match the data-duration
    // values the product pages send, lowercased by catalogVariant(). ---
    'fortnite-skins': { account: 2.99 },
    'valorant-skins': { account: 4.99 },
    'apex-skins': { account: 1.99 },
    'rainbow-six-skins': { account: 3.99 },
    'warzone-skins': { account: 2.49 },
    // --- Universal aim ---
    'universal-aim': { day: 5.99, week: 22.99, month: 44.99, lifetime: 129.99 },
    'installation-service': { 'one-time setup': 9.95 },
});
const PRODUCT_NAMES = Object.freeze({'fortnite-public':'Fortnite Public','rainbow-six':'Rainbow Six Siege',rust:'Rust','apex-legends':'Apex Legends','arc-raiders':'Arc Raiders','cod-black-ops-7':'Call of Duty Black Ops',valorant:'Valorant','temp-spoofer':'Temp Spoofer','perm-spoofer':'Permanent Spoofer','fortnite-skins':'Fortnite Skin Account','valorant-skins':'Valorant Skin Account','apex-skins':'Apex Legends Skin Account','rainbow-six-skins':'Rainbow Six Skin Account','warzone-skins':'Warzone Skin Account','universal-aim':'Universal Aim','installation-service':'Installation Service'});

export function catalogVariant(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function serverPriceFor(item) {
    const id = String(item?.id || '').trim().toLowerCase();
    const variant = catalogVariant(item?.variant);
    const product = PRICE_CATALOG[id];
    if (!product || product[variant] == null) {
        throw new Error(`Invalid cart item: ${id || 'unknown'} ${variant || ''}`.trim());
    }
    return product[variant];
}

export function normalizeDiscount(code) {
    const normalized = String(code || '').trim().toUpperCase();
    const percent = VALID_DISCOUNT_CODES[normalized] || 0;
    if (normalized && !percent) {
        throw new Error('Invalid discount code');
    }
    return {
        code: percent > 0 ? normalized : '',
        percent,
    };
}

export function normalizeCartItems(items) {
    return items.map((item) => {
        const price = serverPriceFor(item);
        const quantity = Math.max(1, Math.min(10, Number(item?.quantity) || 1));
        return {
            id: String(item?.id || '').slice(0, 80),
            name: PRODUCT_NAMES[String(item?.id || '').trim().toLowerCase()] || 'Product',
            variant: catalogVariant(item?.variant).slice(0, 80),
            price,
            quantity,
            image: item?.image,
            slug: item?.slug,
        };
    });
}

export function calculateServerPricing(rawItems, requestedCode) {
    const items = normalizeCartItems(rawItems);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = normalizeDiscount(requestedCode);
    const discountAmount = Number((subtotal * (discount.percent / 100)).toFixed(2));
    const total = Number(Math.max(0.5, subtotal - discountAmount).toFixed(2));
    return { items, subtotal, total, discountAmount, discountCode: discount.code, discountPercent: discount.percent };
}
