import { getSupabase, verifyAdminRequest } from './lib-portal.js';
import { assignLicenseKeysToOrder } from './webhook.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Creed-Staff-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const supabase = getSupabase();
    const requestedOrderId = String(req.body?.order_id || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.body?.limit) || 100));
    const offset = Math.max(0, Number(req.body?.offset) || 0);

    let query = supabase
      .from('orders')
      .select('id, items, status, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (requestedOrderId) query = query.eq('id', requestedOrderId);

    const { data: orders, error } = await query;
    if (error) throw error;

    const results = [];
    for (const order of orders || []) {
      const assigned = await assignLicenseKeysToOrder(supabase, order.id, order.items || []);
      results.push({ order_id: order.id, assigned_count: assigned.length });
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      offset,
      fulfilled: results.filter(r => r.assigned_count > 0).length,
      results
    });
  } catch (error) {
    console.error('admin-repair-fulfillment:', error);
    return res.status(500).json({ error: error.message || 'Repair failed' });
  }
}
