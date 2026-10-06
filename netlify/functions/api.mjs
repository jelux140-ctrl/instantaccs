/* =========================================================================
   API DISPATCHER  —  Netlify Function owning  /api/*
   -------------------------------------------------------------------------
   Owning the whole /api/* namespace (instead of one function per endpoint)
   means the raw handler source files under /api/ are never served as static
   downloads. Each request is routed by name to its original Vercel handler,
   run through the compatibility adapter. AUTO-GENERATED — do not edit by hand;
   re-run scratchpad/gen-dispatcher.mjs after adding/removing an endpoint.
   ========================================================================= */

import { adapt } from '../adapter.js';

import h_admin_license_keys from '../../api/admin-license-keys.js';
import h_admin_maintenance from '../../api/admin-maintenance.js';
import h_admin_portal_announcements from '../../api/admin-portal-announcements.js';
import h_admin_portal_tickets from '../../api/admin-portal-tickets.js';
import h_admin_product_downloads from '../../api/admin-product-downloads.js';
import h_admin_repair_fulfillment from '../../api/admin-repair-fulfillment.js';
import h_admin_vouches from '../../api/admin-vouches.js';
import h_blog_ssr from '../../api/blog-ssr.js';
import h_chatbot from '../../api/chatbot.js';
import h_create_manual_payment from '../../api/create-manual-payment.js';
import h_create_payment from '../../api/create-payment.js';
import h_cron_seed_vouch from '../../api/cron-seed-vouch.js';
import h_generate_blog from '../../api/generate-blog.js';
import h_get_blog_by_slug from '../../api/get-blog-by-slug.js';
import h_get_blogs from '../../api/get-blogs.js';
import h_get_orders from '../../api/get-orders.js';
import h_get_promo_signups from '../../api/get-promo-signups.js';
import h_maintenance_gate from '../../api/maintenance-gate.js';
import h_maintenance_unlock from '../../api/maintenance-unlock.js';
import h_manage_order from '../../api/manage-order.js';
import h_portal_announcements from '../../api/portal-announcements.js';
import h_portal_bootstrap from '../../api/portal-bootstrap.js';
import h_portal_claim_by_order from '../../api/portal-claim-by-order.js';
import h_portal_license_keys from '../../api/portal-license-keys.js';
import h_portal_me from '../../api/portal-me.js';
import h_portal_messages from '../../api/portal-messages.js';
import h_portal_tickets from '../../api/portal-tickets.js';
import h_public_site_config from '../../api/public-site-config.js';
import h_rss from '../../api/rss.js';
import h_save_blog from '../../api/save-blog.js';
import h_save_order from '../../api/save-order.js';
import h_send_customer_receipt from '../../api/send-customer-receipt.js';
import h_send_order_email from '../../api/send-order-email.js';
import h_send_promo_email from '../../api/send-promo-email.js';
import h_sitemap_blogs from '../../api/sitemap-blogs.js';
import h_supabase_public from '../../api/supabase-public.js';
import h_sync_orders from '../../api/sync-orders.js';
import h_test_email from '../../api/test-email.js';
import h_test_resend from '../../api/test-resend.js';
import h_verify_payment from '../../api/verify-payment.js';
import h_vouch from '../../api/vouch.js';
import h_vouches from '../../api/vouches.js';
import h_webhook from '../../api/webhook.js';

const routes = {
  'admin-license-keys': h_admin_license_keys,
  'admin-maintenance': h_admin_maintenance,
  'admin-portal-announcements': h_admin_portal_announcements,
  'admin-portal-tickets': h_admin_portal_tickets,
  'admin-product-downloads': h_admin_product_downloads,
  'admin-repair-fulfillment': h_admin_repair_fulfillment,
  'admin-vouches': h_admin_vouches,
  'blog-ssr': h_blog_ssr,
  'chatbot': h_chatbot,
  'create-manual-payment': h_create_manual_payment,
  'create-payment': h_create_payment,
  'cron-seed-vouch': h_cron_seed_vouch,
  'generate-blog': h_generate_blog,
  'get-blog-by-slug': h_get_blog_by_slug,
  'get-blogs': h_get_blogs,
  'get-orders': h_get_orders,
  'get-promo-signups': h_get_promo_signups,
  'maintenance-gate': h_maintenance_gate,
  'maintenance-unlock': h_maintenance_unlock,
  'manage-order': h_manage_order,
  'portal-announcements': h_portal_announcements,
  'portal-bootstrap': h_portal_bootstrap,
  'portal-claim-by-order': h_portal_claim_by_order,
  'portal-license-keys': h_portal_license_keys,
  'portal-me': h_portal_me,
  'portal-messages': h_portal_messages,
  'portal-tickets': h_portal_tickets,
  'public-site-config': h_public_site_config,
  'rss': h_rss,
  'save-blog': h_save_blog,
  'save-order': h_save_order,
  'send-customer-receipt': h_send_customer_receipt,
  'send-order-email': h_send_order_email,
  'send-promo-email': h_send_promo_email,
  'sitemap-blogs': h_sitemap_blogs,
  'supabase-public': h_supabase_public,
  'sync-orders': h_sync_orders,
  'test-email': h_test_email,
  'test-resend': h_test_resend,
  'verify-payment': h_verify_payment,
  'vouch': h_vouch,
  'vouches': h_vouches,
  'webhook': h_webhook,
};

const adapted = {};
for (const [name, handler] of Object.entries(routes)) {
  adapted[name] = adapt(handler);
}

export default async (request) => {
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
  const fn = adapted[name];
  if (!fn) {
    return new Response(JSON.stringify({ error: 'Not found', path: url.pathname }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return fn(request);
};

export const config = { path: '/api/*' };
