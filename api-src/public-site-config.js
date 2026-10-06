/* =========================================
   CREED — Public client config (safe to expose in browser)
   STRIPE_PUBLISHABLE_KEY, optional STRIPE_CHECKOUT_API_URL
   ========================================= */

const DEFAULT_CHECKOUT = 'https://pay.creedv2.com/api/create-checkout';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    res.setHeader('Cache-Control', 'private, max-age=60');
    const stripePublishableKey = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
    const stripeCheckoutApiUrl = (process.env.STRIPE_CHECKOUT_API_URL || DEFAULT_CHECKOUT).trim();
    return res.status(200).json({
        stripePublishableKey,
        stripeCheckoutApiUrl,
    });
}
