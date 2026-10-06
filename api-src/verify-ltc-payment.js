import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { guardPublicPost } from './lib-abuse-guard.js';
import { assignLicenseKeysToOrder } from './webhook.js';
import { sendOrderPaidEmailsOnce } from './lib-order-emails.js';
import { notifySale } from './lib-sales-notify.js';

const getSupabase = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hash = (value) => createHash('sha256').update(String(value || '')).digest('hex');
const TXID_RE = /^[a-f0-9]{64}$/i;

function publicSession(row, message) {
    return {
        success: true,
        status: row.status,
        amountLtc: Number(row.amount_ltc).toFixed(8),
        address: row.wallet_address,
        expiresAt: row.expires_at,
        confirmations: Number(row.confirmations || 0),
        requiredConfirmations: 2,
        txid: row.txid || null,
        explorerUrl: row.txid ? `https://live.blockcypher.com/ltc/tx/${row.txid}/` : null,
        message,
    };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const supabase = getSupabase();
    const guard = await guardPublicPost(req, supabase, { bucket: 'ltc-payment-tracker', max: 240, windowSec: 3600 });
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    try {
        const orderId = String(req.body?.orderId || '').trim();
        const trackerToken = String(req.body?.trackerToken || '').trim();
        const submittedTxid = String(req.body?.txid || '').trim().toLowerCase();
        if (!orderId || !trackerToken) return res.status(400).json({ error: 'Payment tracker is missing' });

        const { data: session, error } = await supabase
            .from('ltc_payment_sessions')
            .select('*')
            .eq('order_id', orderId)
            .eq('tracker_token_hash', hash(trackerToken))
            .maybeSingle();
        if (error) throw error;
        if (!session) return res.status(404).json({ error: 'Payment tracker not found' });
        if (session.status === 'confirmed') return res.status(200).json(publicSession(session, 'Payment confirmed. Your order is being delivered.'));

        let txid = submittedTxid || session.txid || '';
        if (!txid) {
            if (new Date(session.expires_at) <= new Date()) {
                await supabase.from('ltc_payment_sessions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('order_id', orderId);
                return res.status(200).json(publicSession({ ...session, status: 'expired' }, 'This quote expired. Start a new checkout for a fresh amount.'));
            }
            return res.status(200).json(publicSession(session, 'Waiting for your transaction ID.'));
        }
        if (!TXID_RE.test(txid)) return res.status(400).json({ error: 'Enter a valid 64-character Litecoin transaction ID.' });

        const { data: used } = await supabase.from('ltc_payment_sessions').select('order_id').eq('txid', txid).neq('order_id', orderId).maybeSingle();
        if (used) return res.status(409).json({ error: 'This transaction has already been used for another order.' });

        const chainResponse = await fetch(`https://api.blockcypher.com/v1/ltc/main/txs/${encodeURIComponent(txid)}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'Creed-LTC-Verifier/1.0' },
            signal: AbortSignal.timeout(10000),
        });
        if (chainResponse.status === 404) {
            if (new Date(session.expires_at) <= new Date()) {
                const expired = { ...session, txid, status: 'expired', updated_at: new Date().toISOString() };
                await supabase.from('ltc_payment_sessions').update({ status: 'expired', updated_at: expired.updated_at }).eq('order_id', orderId);
                return res.status(200).json(publicSession(expired, 'This quote expired before the transaction was detected. Start a new checkout.'));
            }
            return res.status(200).json(publicSession({ ...session, txid, status: 'awaiting' }, 'Transaction not found yet. Wait a moment and try again.'));
        }
        if (!chainResponse.ok) return res.status(503).json({ error: 'Litecoin network lookup is temporarily unavailable.' });
        const tx = await chainResponse.json();
        if (tx.double_spend) return res.status(400).json({ error: 'This transaction was flagged as a double spend.' });

        const received = (tx.outputs || []).reduce((sum, output) => {
            return Array.isArray(output.addresses) && output.addresses.includes(session.wallet_address)
                ? sum + Number(output.value || 0)
                : sum;
        }, 0);
        const receivedAt = new Date(tx.received || tx.confirmed || 0).getTime();
        const earliest = new Date(session.created_at).getTime() - 5 * 60 * 1000;
        const latest = new Date(session.expires_at).getTime() + 5 * 60 * 1000;
        if (!receivedAt || receivedAt < earliest || receivedAt > latest) {
            return res.status(400).json({ error: 'This transaction is outside this checkout window.' });
        }
        if (received < Number(session.amount_litoshi)) {
            const patch = { txid, received_litoshi: received, confirmations: Number(tx.confirmations || 0), status: 'underpaid', updated_at: new Date().toISOString() };
            await supabase.from('ltc_payment_sessions').update(patch).eq('order_id', orderId);
            return res.status(200).json(publicSession({ ...session, ...patch }, 'The detected payment is below the required amount. Contact support before sending more.'));
        }

        const confirmations = Number(tx.confirmations || 0);
        const status = confirmations >= 2 ? 'confirmed' : confirmations >= 1 ? 'confirming' : 'detected';
        const patch = { txid, received_litoshi: received, confirmations, status, updated_at: new Date().toISOString(), ...(status === 'confirmed' ? { verified_at: new Date().toISOString() } : {}) };
        let updateQuery = supabase.from('ltc_payment_sessions').update(patch).eq('order_id', orderId);
        // Claim the confirmed transition exactly once. Concurrent polls must
        // never fulfill or email the same order twice.
        if (status === 'confirmed') updateQuery = updateQuery.neq('status', 'confirmed');
        const { data: updated, error: updateError } = await updateQuery.select('*').maybeSingle();
        if (updateError) throw updateError;

        if (status === 'confirmed' && updated) {
            const paidAt = new Date().toISOString();
            const { data: order } = await supabase.from('orders').update({ status: 'completed', paid_at: paidAt }).eq('id', orderId).eq('status', 'pending').select('*').maybeSingle();
            if (order) {
                const keys = await assignLicenseKeysToOrder(supabase, order.id, order.items || []);
                await sendOrderPaidEmailsOnce(supabase, order, keys);
                notifySale({
                    id: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    items: order.items,
                    customerEmail: order.customer_email,
                    paymentMethod: 'litecoin',
                }).catch(() => {});
            }
        }

        const message = status === 'confirmed' ? 'Payment confirmed. Your order is being delivered.' : status === 'confirming' ? 'Payment found. Waiting for one more confirmation.' : 'Payment detected. Waiting for network confirmations.';
        return res.status(200).json(publicSession(updated || { ...session, ...patch }, message));
    } catch (error) {
        console.error('verify-ltc-payment:', error);
        return res.status(500).json({ error: 'Could not verify the Litecoin payment.' });
    }
}
