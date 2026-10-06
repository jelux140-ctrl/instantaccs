/*
  Admin API for managing product download links
  
  GET /api/admin-product-downloads - List all product downloads
  POST /api/admin-product-downloads - Add or update a product download
  DELETE /api/admin-product-downloads - Delete a product download
  
  Requires staff token
*/

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Creed-Staff-Token');
}

function verifyStaffToken(req) {
  const authHeader = req.headers.authorization;
  const staffToken = req.headers['x-creed-staff-token'];
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : staffToken)?.trim();
  
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}

export default async function handler(req, res) {
  cors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (!verifyStaffToken(req)) {
    return res.status(401).json({ error: 'Unauthorized - Staff token required' });
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  try {
    switch (req.method) {
      case 'GET':
        return await listDownloads(req, res, supabase);
      case 'POST':
        return await saveDownload(req, res, supabase);
      case 'DELETE':
        return await deleteDownload(req, res, supabase);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Admin product downloads error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function listDownloads(req, res, supabase) {
  const { data, error } = await supabase
    .from('product_downloads')
    .select('*')
    .order('product_name', { ascending: true });
  
  if (error) {
    throw error;
  }
  
  return res.status(200).json({
    downloads: data || []
  });
}

async function saveDownload(req, res, supabase) {
  const { product_id, product_name, download_url, version, supports, is_active } = req.body;
  
  if (!product_id || !product_name || !download_url) {
    return res.status(400).json({ 
      error: 'Product ID, name, and download URL are required' 
    });
  }
  let parsedDownload;
  try { parsedDownload = new URL(download_url); } catch { return res.status(400).json({ error: 'Valid HTTPS download URL required' }); }
  if (parsedDownload.protocol !== 'https:' || /['"<>]/.test(download_url)) return res.status(400).json({ error: 'Valid HTTPS download URL required' });
  
  const record = {
    product_id,
    product_name,
    download_url,
    version: version || '1.0.0',
    supports: supports || 'Windows 10/11',
    is_active: is_active !== false,
    updated_at: new Date().toISOString()
  };
  
  // Upsert - insert or update
  const { data, error } = await supabase
    .from('product_downloads')
    .upsert(record, { onConflict: 'product_id' })
    .select()
    .single();
  
  if (error) {
    throw error;
  }
  
  return res.status(200).json({
    success: true,
    download: data
  });
}

async function deleteDownload(req, res, supabase) {
  const { product_id } = req.query;
  
  if (!product_id) {
    return res.status(400).json({ error: 'Product ID is required' });
  }
  
  const { error } = await supabase
    .from('product_downloads')
    .delete()
    .eq('product_id', product_id);
  
  if (error) {
    throw error;
  }
  
  return res.status(200).json({
    success: true,
    message: 'Download removed successfully'
  });
}
