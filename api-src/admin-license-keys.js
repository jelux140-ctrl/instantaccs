/*
  Admin API for managing license keys
  
  GET /api/admin-license-keys - List all license keys (with filters)
  POST /api/admin-license-keys - Add new license key(s)
  PATCH /api/admin-license-keys - Update a license key
  DELETE /api/admin-license-keys - Delete a license key
  
  Requires staff token
*/

import { createClient } from '@supabase/supabase-js';
import { verifyAdminRequest } from './lib-portal.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Creed-Staff-Token');
}

export default async function handler(req, res) {
  cors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Verify staff authentication
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized - Staff token required' });
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  try {
    switch (req.method) {
      case 'GET':
        return await listLicenseKeys(req, res, supabase);
      case 'POST':
        return await addLicenseKey(req, res, supabase);
      case 'PATCH':
        return await updateLicenseKey(req, res, supabase);
      case 'DELETE':
        return await deleteLicenseKey(req, res, supabase);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Admin license keys error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function listLicenseKeys(req, res, supabase) {
  const { product_id, used, order_id, page = '1', limit = '50' } = req.query;
  
  let query = supabase
    .from('license_keys')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  
  if (product_id) {
    query = query.eq('product_id', product_id);
  }
  
  if (used !== undefined) {
    query = query.eq('used', used === 'true');
  }
  
  if (order_id) {
    query = query.eq('order_id', order_id);
  }
  
  const from = (parseInt(page) - 1) * parseInt(limit);
  const to = from + parseInt(limit) - 1;
  query = query.range(from, to);
  
  const { data, error, count } = await query;
  
  if (error) {
    throw error;
  }
  
  // Get product download info for context
  const productIds = [...new Set(data.map(k => k.product_id))];
  const { data: products } = await supabase
    .from('product_downloads')
    .select('product_id, product_name')
    .in('product_id', productIds);
  
  const productMap = (products || []).reduce((acc, p) => {
    acc[p.product_id] = p.product_name;
    return acc;
  }, {});
  
  return res.status(200).json({
    keys: data.map(k => ({
      ...k,
      product_name: k.product_name || productMap[k.product_id] || k.product_id
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil((count || 0) / parseInt(limit))
    }
  });
}

async function addLicenseKey(req, res, supabase) {
  const { keys, product_id, product_name, duration, duration_days } = req.body;
  
  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: 'Keys array is required' });
  }
  
  if (!product_id) {
    return res.status(400).json({ error: 'Product ID is required' });
  }
  
  // Build metadata with duration info
  const metadata = {
    duration: duration || 'Unknown',
    ...(duration_days && { duration_days })
  };
  
  // Normalize keys
  const keyRecords = keys.map(key => ({
    product_id,
    product_name: product_name || product_id,
    key_value: key.trim(),
    used: false,
    created_at: new Date().toISOString(),
    metadata
  }));
  
  const { data, error } = await supabase
    .from('license_keys')
    .insert(keyRecords)
    .select();
  
  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'One or more keys already exist' });
    }
    throw error;
  }
  
  return res.status(201).json({
    success: true,
    added: data.length,
    keys: data
  });
}

async function updateLicenseKey(req, res, supabase) {
  const { id, ...updates } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'Key ID is required' });
  }
  
  const allowedUpdates = ['product_id', 'product_name', 'expires_at', 'metadata'];
  const updateData = {};
  
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      updateData[key] = updates[key];
    }
  }
  
  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  
  const { data, error } = await supabase
    .from('license_keys')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    throw error;
  }
  
  return res.status(200).json({
    success: true,
    key: data
  });
}

async function deleteLicenseKey(req, res, supabase) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Key ID is required' });
  }
  
  // Check if key is assigned
  const { data: key } = await supabase
    .from('license_keys')
    .select('used, order_id')
    .eq('id', id)
    .single();
  
  if (key?.used || key?.order_id) {
    return res.status(400).json({ error: 'Cannot delete a key that has been assigned to an order' });
  }
  
  const { error } = await supabase
    .from('license_keys')
    .delete()
    .eq('id', id);
  
  if (error) {
    throw error;
  }
  
  return res.status(200).json({
    success: true,
    message: 'Key deleted successfully'
  });
}
