/* =========================================
   CREED - STRIPE WEBHOOK HANDLER
   Handles payment completion notifications from Stripe
   ========================================= */

import Stripe from 'stripe';
import { getSupabase } from './lib-portal.js';
import { sendOrderPaidEmailsOnce } from './lib-order-emails.js';
import { mintResellerKey, usesReseller } from './lib-reseller-keys.js';
import { notifySale } from './lib-sales-notify.js';

/**
 * Canonical product ID aliases — maps old/short IDs to the cart's canonical IDs.
 * Keys already uploaded under old admin IDs will also be matched.
 */
const PRODUCT_ID_ALIASES = {
    'fortnite': 'fortnite-public',
    'apex': 'apex-legends',
    'cod': 'cod-black-ops-7',
    'spoofer-perm': 'perm-spoofer',
    'spoofer-temp': 'temp-spoofer',
    'aimbot': 'ai-aimbot',
};

/** Normalize a product ID to its canonical form */
function normalizeProductId(id) {
    if (!id) return id;
    return PRODUCT_ID_ALIASES[id] || id;
}

/**
 * Extract product ID from item - handles various formats
 */
function getProductId(item) {
    // Try various fields where product ID might be stored
    if (item.id) return normalizeProductId(item.id);
    if (item.product_id) return normalizeProductId(item.product_id);
    
    // Try to extract from name
    if (item.name) {
        const nameLower = item.name.toLowerCase();
        const productMap = {
            'valorant': 'valorant',
            'fortnite public': 'fortnite-public',
            'fortnite private': 'fortnite-private',
            'fortnite': 'fortnite-public',
            'apex legends': 'apex-legends',
            'apex': 'apex-legends',
            'rust': 'rust',
            'cod black ops': 'cod-black-ops-7',
            'black ops': 'cod-black-ops-7',
            'cod': 'cod-black-ops-7',
            'rainbow six': 'rainbow-six',
            'rainbow 6': 'rainbow-six',
            'permanent spoofer': 'perm-spoofer',
            'perm spoofer': 'perm-spoofer',
            'temporary spoofer': 'temp-spoofer',
            'temp spoofer': 'temp-spoofer',
            'ai aimbot': 'ai-aimbot',
            'aimbot': 'ai-aimbot',
            'arc raiders': 'arc-raiders'
        };
        
        for (const [keyword, productId] of Object.entries(productMap)) {
            if (nameLower.includes(keyword)) {
                return productId;
            }
        }
    }
    
    return null;
}

/**
 * Extract and normalize duration from item variant or name
 * Handles both full formats ("1 Day", "7 Days") and abbreviated ("Day", "Week")
 */
function getDuration(item) {
    // First check explicit variant field
    let variant = item.variant ? item.variant.trim() : null;
    
    // Normalize abbreviated formats to full duration strings
    // These must match the duration values stored in license_keys.metadata.duration
    const durationMap = {
        'day': '1 Day',
        '1 day': '1 Day',
        '1day': '1 Day',
        '3 day': '3 Days',
        '3 days': '3 Days',
        '3day': '3 Days',
        'week': '7 Days',
        '1 week': '7 Days',
        '1week': '7 Days',
        '7 day': '7 Days',
        '7 days': '7 Days',
        '7day': '7 Days',
        'month': '30 Days',
        '1 month': '30 Days',
        '1month': '30 Days',
        '30 day': '30 Days',
        '30 days': '30 Days',
        '30day': '30 Days',
        '90 day': '90 Days',
        '90 days': '90 Days',
        '90day': '90 Days',
        'lifetime': 'Lifetime',
        'life': 'Lifetime',
        'perm': 'Lifetime',
        'permanent': 'Lifetime',
        'lifetime usage': 'Lifetime',
        'one-time': '1 Day',
        'one-time usage': '1 Day'
    };
    
    if (variant) {
        const normalized = durationMap[variant.toLowerCase()];
        if (normalized) {
            console.log('Normalized duration:', variant, '->', normalized);
            return normalized;
        }
        // Return as-is if no mapping found
        return variant;
    }
    
    // Try to extract from name
    if (item.name) {
        const nameLower = item.name.toLowerCase();
        for (const [key, value] of Object.entries(durationMap)) {
            if (nameLower.includes(key)) {
                return value;
            }
        }
    }
    
    return null;
}

function normalizeDurationLabel(value) {
    const raw = String(value || '').toLowerCase().trim();
    const aliases = {
        'day': '1 Day', '1 day': '1 Day', '1day': '1 Day',
        'one-time': '1 Day', 'one-time usage': '1 Day',
        '3 day': '3 Days', '3 days': '3 Days', '3day': '3 Days',
        'week': '7 Days', '1 week': '7 Days', '1week': '7 Days',
        '7 day': '7 Days', '7 days': '7 Days', '7day': '7 Days',
        'month': '30 Days', '1 month': '30 Days', '1month': '30 Days',
        '30 day': '30 Days', '30 days': '30 Days', '30day': '30 Days',
        '90 day': '90 Days', '90 days': '90 Days', '90day': '90 Days',
        'lifetime': 'Lifetime', 'lifetime usage': 'Lifetime',
        'life': 'Lifetime', 'perm': 'Lifetime', 'permanent': 'Lifetime'
    };
    return aliases[raw] || String(value || '').trim();
}

/**
 * Safely log to order_key_assignment_log (table may not exist yet).
 * Never throws — returns silently on failure.
 */
async function logKeyAssignment(supabase, record) {
    try {
        const { error } = await supabase.from('order_key_assignment_log').insert(record);
        if (error) {
            console.warn('order_key_assignment_log insert skipped:', error.message);
        }
    } catch (e) {
        console.warn('order_key_assignment_log insert skipped (table may not exist):', e.message);
    }
}

/**
 * Persist a key minted by the reseller API into the normal local key tables.
 * This keeps email, portal, admin, and webhook retry/idempotency using the same
 * source of truth. Reseller keys are marked used immediately because they are
 * created for one paid order only.
 */
async function persistResellerKey(supabase, {
    orderId,
    productId,
    productName,
    duration,
    keyValue,
}) {
    const now = new Date().toISOString();
    const metadata = {
        source: 'reseller_api',
        duration: duration || '1 Day',
        assigned_at: now,
        assigned_to_order: orderId,
    };

    let keyRow = null;

    const { data: inserted, error: insertError } = await supabase
        .from('license_keys')
        .insert({
            product_id: productId,
            product_name: productName || productId,
            key_value: keyValue,
            order_id: orderId,
            used: true,
            used_at: now,
            created_at: now,
            metadata,
        })
        .select('id, product_id, product_name, key_value, metadata')
        .maybeSingle();

    if (insertError) {
        if (insertError.code !== '23505') {
            console.error('  ERROR storing reseller key in license_keys:', insertError.message);
            return null;
        }

        // If the reseller API/webhook retry ever gives the same key again, reuse
        // the existing row instead of creating a duplicate.
        const { data: existing, error: existingError } = await supabase
            .from('license_keys')
            .select('id, product_id, product_name, key_value, metadata')
            .eq('key_value', keyValue)
            .maybeSingle();

        if (existingError || !existing) {
            console.error('  ERROR loading duplicate reseller key row:', existingError?.message || 'not found');
            return null;
        }

        const { error: updateError } = await supabase
            .from('license_keys')
            .update({
                product_id: existing.product_id || productId,
                product_name: existing.product_name || productName || productId,
                order_id: orderId,
                used: true,
                used_at: now,
                metadata: {
                    ...(existing.metadata || {}),
                    ...metadata,
                },
            })
            .eq('id', existing.id);

        if (updateError) {
            console.warn('  Could not refresh duplicate reseller key assignment:', updateError.message);
        }
        keyRow = {
            ...existing,
            product_id: existing.product_id || productId,
            product_name: existing.product_name || productName || productId,
            metadata: { ...(existing.metadata || {}), ...metadata },
        };
    } else {
        keyRow = inserted;
    }

    if (!keyRow?.id) return null;

    const { error: assignError } = await supabase
        .from('order_license_assignments')
        .insert({
            order_id: orderId,
            license_key_id: keyRow.id,
            assigned_by: 'reseller_api',
            assigned_at: now,
        });

    if (assignError && assignError.code !== '23505') {
        console.warn('  reseller order_license_assignments insert error:', assignError.message);
    }

    return {
        license_key_id: keyRow.id,
        product_id: keyRow.product_id || productId,
        product_name: keyRow.product_name || productName || productId,
        duration: keyRow.metadata?.duration || duration || '1 Day',
        key: keyRow.key_value || keyValue,
    };
}

/**
 * Check order_key_assignment_log for a previous successful assignment.
 * Returns null if table missing or no match.
 */
async function checkPreviousAssignment(supabase, orderId, productId, duration) {
    try {
        // Query all successes for this order+product
        const { data, error } = await supabase
            .from('order_key_assignment_log')
            .select('id, license_key_id')
            .eq('order_id', orderId)
            .eq('product_id', productId)
            .eq('success', true);
        if (error || !data || data.length === 0) return null;
        return data; // array of previously assigned entries
    } catch (e) {
        console.warn('order_key_assignment_log check skipped (table may not exist):', e.message);
        return null;
    }
}

/**
 * Assign a single license key for one unit of product+duration.
 * Returns the assigned key object or null.
 */
async function assignOneKey(supabase, orderId, item, productId, duration, alreadyAssignedKeyIds) {
    // --- Reseller API path: mint a key on demand (all products except local-only) ---
    if (usesReseller(productId)) {
        const keyValue = await mintResellerKey(productId, duration);
        if (keyValue) {
            const persisted = await persistResellerKey(supabase, {
                orderId,
                productId,
                productName: item?.name || productId,
                duration,
                keyValue,
            });

            if (!persisted) {
                console.error(`  ERROR: reseller minted a key for ${productId}, but it could not be persisted for portal access.`);
                return null;
            }

            await logKeyAssignment(supabase, {
                order_id: orderId,
                product_id: productId,
                success: true,
                reason: 'reseller_minted',
                license_key_id: persisted.license_key_id,
            });
            console.log(`  SUCCESS (reseller): minted key for ${productId} -> ${keyValue}`);
            return persisted;
        }
        // Mint failed (API error / out of balance / unmapped) — fall through to local keys.
        console.warn(`  Reseller mint failed for ${productId}; falling back to local license_keys.`);
    }

    // Build list of product_id values to search — includes canonical + any old aliases
    const idsToSearch = [productId];
    for (const [oldId, canonId] of Object.entries(PRODUCT_ID_ALIASES)) {
        if (canonId === productId && !idsToSearch.includes(oldId)) {
            idsToSearch.push(oldId);
        }
    }
    console.log(`  Querying unused keys for product_ids: [${idsToSearch.join(', ')}]`);

    const { data: availableKeys, error: keysError } = await supabase
        .from('license_keys')
        .select('id, product_id, product_name, key_value, metadata, used, order_id')
        .in('product_id', idsToSearch)
        .eq('used', false)
        .is('order_id', null);

    if (keysError) {
        console.error('  ERROR querying license_keys:', keysError.message, keysError.code);
        return null;
    }

    // Filter out keys we already assigned in this same call (for qty > 1)
    const candidates = (availableKeys || []).filter(k => !alreadyAssignedKeyIds.has(k.id));
    console.log(`  Found ${candidates.length} available keys (${availableKeys?.length || 0} total unused, ${alreadyAssignedKeyIds.size} excluded)`);

    if (candidates.length === 0) {
        console.log(`  NO STOCK for product="${productId}" duration="${duration}"`);
        await logKeyAssignment(supabase, { order_id: orderId, product_id: productId, success: false, reason: `no_stock_${duration || 'any'}` });
        return null;
    }

    // Log first few for debugging
    candidates.slice(0, 3).forEach((k, i) => {
        console.log(`    Candidate ${i + 1}: id=${k.id} duration="${k.metadata?.duration}" product_name="${k.product_name}"`);
    });

    // Find key matching the duration
    let matchingKey = null;

    if (duration) {
        // Normalize both checkout and stored admin duration labels.
        matchingKey = candidates.find(k => {
            const raw = (k.metadata?.duration || '').toLowerCase().trim();
            const kd = normalizeDurationLabel(raw).toLowerCase().trim();
            const wanted = normalizeDurationLabel(duration).toLowerCase().trim();
            return kd === wanted;
        });

        // Partial match fallback
        if (!matchingKey) {
            matchingKey = candidates.find(k => {
                const kd = (k.metadata?.duration || '').toLowerCase();
                const id = duration.toLowerCase();
                return kd.includes(id) || id.includes(kd);
            });
        }

        if (!matchingKey) {
            console.log(`  WARNING: No duration match for "${duration}" among ${candidates.length} keys`);
            console.log(`  Available durations: ${[...new Set(candidates.map(k => k.metadata?.duration || 'null'))].join(', ')}`);
            // Don't fall back to any random key — wrong duration key is worse than no key
            await logKeyAssignment(supabase, { order_id: orderId, product_id: productId, success: false, reason: `no_match_duration_${duration}` });
            return null;
        }
    } else {
        // No duration info — take first available
        matchingKey = candidates[0];
    }

    console.log(`  Selected key: ${matchingKey.id} | duration="${matchingKey.metadata?.duration}" | value="${matchingKey.key_value.substring(0, 12)}..."`);

    // Mark key as used — use a WHERE clause that also checks used=false to prevent race conditions
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
        .from('license_keys')
        .update({
            used: true,
            used_at: now,
            order_id: orderId,
            metadata: {
                ...matchingKey.metadata,
                assigned_at: now,
                assigned_to_order: orderId
            }
        })
        .eq('id', matchingKey.id)
        .eq('used', false)              // race-condition guard
        .select('id')
        .maybeSingle();

    if (updateError) {
        console.error('  ERROR updating key as used:', updateError.message);
        return null;
    }
    if (!updated) {
        console.warn('  Key was claimed by another request (race condition), skipping');
        return null;
    }

    // Create assignment record in order_license_assignments
    const { error: assignError } = await supabase
        .from('order_license_assignments')
        .insert({
            order_id: orderId,
            license_key_id: matchingKey.id,
            assigned_by: 'system',
            assigned_at: now
        });

    if (assignError) {
        console.warn('  order_license_assignments insert error:', assignError.message);
        // Key is still marked used+assigned — this is just the junction record
    }

    // Log success
    await logKeyAssignment(supabase, {
        order_id: orderId,
        product_id: productId,
        success: true,
        license_key_id: matchingKey.id,
        reason: 'auto_assigned_on_payment'
    });

    console.log(`  SUCCESS: Assigned key ${matchingKey.key_value} to order ${orderId}`);

    return {
        product_id: productId,
        product_name: matchingKey.product_name || item.name || productId,
        duration: matchingKey.metadata?.duration || duration,
        key: matchingKey.key_value
    };
}

/**
 * Auto-assign license keys to order when paid.
 * Matches by product_id AND duration variant.
 * Handles quantity > 1 by assigning multiple keys.
 * @returns {Promise<Array>} assigned keys
 */
export async function assignLicenseKeysToOrder(supabase, orderId, items) {
    const assignedKeys = [];

    console.log('=== LICENSE KEY ASSIGNMENT START ===');
    console.log('Order:', orderId);
    console.log('Items count:', items?.length || 0);
    console.log('Items:', JSON.stringify(items));

    if (!items || items.length === 0) {
        console.log('=== No items to assign keys for ===');
        return assignedKeys;
    }

    // Track key IDs assigned in this call to avoid giving the same key twice for qty > 1
    const alreadyAssignedKeyIds = new Set();

    // Check if keys were already assigned to this order (idempotency on webhook retry)
    const { data: existingAssignments } = await supabase
        .from('order_license_assignments')
        .select('license_key_id, license_keys!inner(id, product_id, product_name, key_value, metadata)')
        .eq('order_id', orderId);

    if (existingAssignments && existingAssignments.length > 0) {
        console.log(`Order already has ${existingAssignments.length} key(s) assigned — returning existing`);
        for (const a of existingAssignments) {
            const k = a.license_keys;
            assignedKeys.push({
                product_id: k.product_id,
                product_name: k.product_name || k.product_id,
                duration: k.metadata?.duration || '',
                key: k.key_value
            });
        }
        return assignedKeys;
    }

    for (const item of items) {
        const productId = getProductId(item);
        const duration = getDuration(item);
        const qty = Math.max(1, parseInt(item.quantity) || 1);

        console.log(`\n--- Item: "${item.name}" variant="${item.variant}" qty=${qty} ---`);
        console.log(`  Resolved: productId="${productId}" duration="${duration}"`);

        if (!productId) {
            console.error(`  SKIP: Could not resolve product ID from item:`, JSON.stringify(item));
            continue;
        }

        // Assign one key per unit of quantity
        for (let q = 0; q < qty; q++) {
            if (qty > 1) console.log(`  Unit ${q + 1}/${qty}`);

            const assigned = await assignOneKey(supabase, orderId, item, productId, duration, alreadyAssignedKeyIds);
            if (assigned) {
                assignedKeys.push(assigned);
                // Find the key ID we just assigned to exclude it from future picks
                const { data: justAssigned } = await supabase
                    .from('license_keys')
                    .select('id')
                    .eq('key_value', assigned.key)
                    .maybeSingle();
                if (justAssigned) alreadyAssignedKeyIds.add(justAssigned.id);
            }
        }
    }

    console.log('\n=== LICENSE KEY ASSIGNMENT COMPLETE ===');
    console.log('Total assigned:', assignedKeys.length);
    assignedKeys.forEach((k, i) => {
        console.log(`  ${i + 1}. ${k.product_name} (${k.duration}) => ${k.key}`);
    });

    return assignedKeys;
}

const getBaseUrlFromRequest = (req) => {
    // Proxy headers can arrive comma-joined (e.g. "creedv2.com,https"), which
    // would build an invalid hostname. Take only the first value of each.
    const first = (v) => String(v || '').split(',')[0].trim();
    const rawProto = first(req.headers['x-forwarded-proto']);
    const proto = /^https?$/i.test(rawProto) ? rawProto : 'https';
    const host = (first(req.headers['x-forwarded-host']) || first(req.headers.host) || '')
        .replace(/^https?:\/\//i, '');

    if (!host) {
        throw new Error('Cannot resolve request host for internal API calls');
    }

    return `${proto}://${host}`;
};

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_SECRET_KEY) {
        console.error('Stripe secret key not configured');
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: '2024-11-20.acacia',
    });

    let event;
    let rawBody;

    try {
        // Get signature from header
        const sig = req.headers['stripe-signature'];
        
        // Never trust a webhook body without a valid Stripe signature. The old
        // fail-open fallback let anyone POST checkout.session.completed JSON and
        // create a completed order without paying.
        if (!STRIPE_WEBHOOK_SECRET || !sig) {
            return res.status(400).json({ error: 'Missing signed webhook payload' });
        }
        rawBody = req.rawBody || (typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : null);
        if (!rawBody) {
            return res.status(400).json({ error: 'Raw signed webhook payload unavailable' });
        }
        try {
            event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        console.log('Webhook received:', event.type, event.id);

        // Handle the event
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            const sessionId = session.id;
            const status = session.payment_status;
            const orderId = session.metadata?.order_id;
            const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00';
            const currency = session.currency?.toUpperCase() || 'USD';
            const customerEmail = session.customer_email || session.customer_details?.email || null;
            const discordUsername = session.metadata?.discord_username || null;
            const referralCode = session.metadata?.referral_code || null;

            let items = [];
            try {
                // Large carts are split across numbered keys to stay under
                // Stripe's 500-char-per-value cap; older sessions only ever
                // have the first.
                const rawItems = [
                    session.metadata?.order_items,
                    session.metadata?.order_items_2,
                    session.metadata?.order_items_3,
                ].filter(Boolean).join('');
                if (rawItems) {
                    items = JSON.parse(rawItems);
                    console.log('Parsed', items.length, 'items from Stripe metadata');
                }
            } catch (e) {
                console.error('Failed to parse order_items from Stripe metadata (possibly truncated):', e.message);
                console.error('Raw metadata.order_items:', String(session.metadata?.order_items).substring(0, 200));
            }

            console.log('Payment status:', status);
            console.log('Order ID:', orderId);
            console.log('Customer Email:', customerEmail);
            console.log('Items from Stripe:', JSON.stringify(items));

            if (status === 'paid') {
                const order = {
                    id: orderId || `order_${Date.now()}`,
                    sessionId: sessionId,
                    status: 'completed',
                    amount: amount,
                    currency: currency,
                    customerEmail: customerEmail,
                    discordUsername: discordUsername,
                    items: items,
                    createdAt: session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString(),
                    paidAt: new Date().toISOString()
                };

                console.log('Processing paid order:', order.id);

                try {
                    const { createClient } = await import('@supabase/supabase-js');
                    const supabaseUrl = process.env.SUPABASE_URL;
                    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

                    if (supabaseUrl && supabaseKey) {
                        const supabase = createClient(supabaseUrl, supabaseKey, {
                            auth: { autoRefreshToken: false, persistSession: false }
                        });

                        // Check if order exists
                        const { data: existingOrder } = await supabase
                            .from('orders')
                            .select('*')
                            .eq('id', order.id)
                            .single();

                        if (existingOrder) {
                            await supabase
                                .from('orders')
                                .update({
                                    status: 'completed',
                                    paid_at: order.paidAt,
                                    customer_email: customerEmail,
                                    discord_username: discordUsername,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', order.id);
                            console.log('Order updated:', order.id);

                            // If Stripe metadata items failed to parse, use the ones from the database
                            if ((!items || items.length === 0) && existingOrder.items && Array.isArray(existingOrder.items) && existingOrder.items.length > 0) {
                                items = existingOrder.items;
                                order.items = items;
                                console.log('Recovered', items.length, 'items from database (Stripe metadata was empty/truncated)');
                            }
                        } else {
                            await supabase
                                .from('orders')
                                .insert({
                                    id: order.id,
                                    session_id: sessionId,
                                    status: 'completed',
                                    amount: parseFloat(amount),
                                    currency: currency,
                                    customer_email: customerEmail,
                                    discord_username: discordUsername,
                                    referral_code: referralCode,
                                    items: items,
                                    created_at: order.createdAt,
                                    paid_at: order.paidAt
                                });
                            console.log('Order created:', order.id);
                        }

                        // Assign license keys (isolated: a key-assignment failure must
                        // NEVER block the customer receipt email below).
                        let assignedLicenseKeys = [];
                        try {
                            console.log('\n>>> STARTING KEY ASSIGNMENT <<<');
                            console.log('Items for assignment:', JSON.stringify(items));
                            assignedLicenseKeys = await assignLicenseKeysToOrder(supabase, order.id, items);
                            console.log('>>> KEY ASSIGNMENT RESULT:', assignedLicenseKeys.length, 'keys assigned <<<');
                        } catch (keyError) {
                            console.error('Key assignment error (email will still send):', keyError.message, keyError.stack);
                            assignedLicenseKeys = [];
                        }

                        // Send emails with assigned keys. Always attempt, independent of key assignment.
                        console.log('\n>>> STARTING EMAIL SEND <<<');
                        try {
                            const rowOrder = { ...order, items };
                            console.log('Calling sendOrderPaidEmailsOnce with', assignedLicenseKeys.length, 'keys');
                            const emailResult = await sendOrderPaidEmailsOnce(supabase, rowOrder, assignedLicenseKeys);
                            console.log('Email result:', JSON.stringify(emailResult));
                        } catch (emailError) {
                            console.error('Error sending email:', emailError.message, emailError.stack);
                        }
                        notifySale({ ...order, items, paymentMethod: 'stripe' }).catch(() => {});
                    } else {
                        console.error('Supabase credentials not configured');
                    }
                } catch (dbError) {
                    console.error('Database error:', dbError);
                }
            } else {
                console.log('Payment not completed, status:', status);
            }
        } else {
            console.log('Unhandled event type:', event.type);
        }

        return res.status(200).json({ received: true, eventType: event.type });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(400).json({ received: false, error: 'Invalid webhook request' });
    }
}
