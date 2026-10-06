/*
  GET /api/portal-license-keys
  Returns license keys assigned to the authenticated order
  
  Requires portal token in Authorization header
*/

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sha256Hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Tokens in URLs leak into history, logs, analytics, and referrers.
    const authHeader = req.headers.authorization;
    const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '')?.trim();
    
    if (!token) {
      return res.status(401).json({ error: 'Portal token required' });
    }
    
    // Initialize Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    // Hash the token for lookup
    const tokenHash = sha256Hex(token);
    
    // Verify portal token and get order
    const { data: tokenData, error: tokenError } = await supabase
      .from('order_portal_tokens')
      .select('order_id, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    
    if (tokenError || !tokenData) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if token is expired or revoked
    if (tokenData.revoked_at || new Date(tokenData.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    const orderId = tokenData.order_id;
    
    // Get license keys for this order
    const { data: keys, error: keysError } = await supabase
      .from('order_license_assignments')
      .select(`
        assigned_at,
        license_keys!inner(
          id,
          product_id,
          product_name,
          key_value,
          used,
          expires_at,
          metadata
        )
      `)
      .eq('order_id', orderId);
    
    if (keysError) {
      console.error('Error fetching license keys:', keysError);
      return res.status(500).json({ error: 'Failed to fetch license keys' });
    }
    
    // Format response
    let formattedKeys = (keys || []).map(k => ({
      id: k.license_keys.id,
      product_id: k.license_keys.product_id,
      product_name: k.license_keys.product_name,
      key: k.license_keys.key_value,
      used: k.license_keys.used,
      assigned_at: k.assigned_at,
      expires_at: k.license_keys.expires_at,
      metadata: k.license_keys.metadata
    }));

    // Backward-compatible fallback: the key row is authoritative and already
    // stores order_id even if an older webhook failed to create the junction row.
    const { data: directKeys } = await supabase
      .from('license_keys')
      .select('id, product_id, product_name, key_value, used, used_at, expires_at, metadata')
      .eq('order_id', orderId);

    const seenKeyIds = new Set(formattedKeys.map(k => k.id));
    for (const k of directKeys || []) {
      if (seenKeyIds.has(k.id)) continue;
      formattedKeys.push({
        id: k.id,
        product_id: k.product_id,
        product_name: k.product_name,
        key: k.key_value,
        used: k.used,
        assigned_at: k.used_at || k.metadata?.assigned_at || null,
        expires_at: k.expires_at,
        metadata: k.metadata
      });
      seenKeyIds.add(k.id);
    }
    
    // Get order details to find all products in the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('items')
      .eq('id', orderId)
      .single();
    
    // Collect all product IDs from order items
    const orderItems = order?.items || [];
    const orderProductIds = orderItems
      .map(item => item.product_id || item.id)
      .filter(Boolean);
    
    // Also include products that have keys assigned
    const keyProductIds = formattedKeys.map(k => k.product_id);
    
    // Combine and deduplicate product IDs
    const allProductIds = [...new Set([...orderProductIds, ...keyProductIds])];
    
    // Get download info for all products
    let downloads = [];
    if (allProductIds.length > 0) {
      const { data: downloadData, error: downloadError } = await supabase
        .from('product_downloads')
        .select('*')
        .eq('is_active', true);
      
      if (!downloadError && downloadData) {
        downloads = downloadData;
      }
    }
    
    return res.status(200).json({
      order_id: orderId,
      keys: formattedKeys,
      downloads: downloads.map(d => ({
        product_id: d.product_id,
        product_name: d.product_name,
        download_url: d.download_url,
        version: d.version,
        supports: d.supports
      }))
    });
    
  } catch (error) {
    console.error('License keys error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
