/* =========================================
   CREED - PAYMENT VERIFICATION API
   Verify payment status using Stripe
   ========================================= */

import Stripe from 'stripe';

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId, paymentId, sessionId } = req.body;

        if (!orderId && !paymentId && !sessionId) {
            return res.status(400).json({ error: 'Order ID, Payment ID, or Session ID required' });
        }

        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        if (!STRIPE_SECRET_KEY) {
            return res.status(500).json({ error: 'Payment service not configured' });
        }

        // Initialize Stripe
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
            apiVersion: '2024-11-20.acacia',
        });

        // Use sessionId if provided, otherwise try paymentId or orderId
        const checkoutSessionId = sessionId || paymentId || orderId;

        // Retrieve checkout session from Stripe
        const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

        // Check payment status
        const isPaid = session.payment_status === 'paid';

        return res.status(200).json({
            success: isPaid,
            status: session.payment_status,
            sessionId: session.id,
            orderId: session.metadata?.order_id,
            amount: session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00',
            currency: session.currency?.toUpperCase() || 'USD'
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(404).json({ error: 'Payment session not found' });
    }
}
