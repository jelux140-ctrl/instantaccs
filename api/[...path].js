import h_admin_license_keys from '../api-src/admin-license-keys.js';
import h_wallet_purchase from '../api-src/wallet-purchase.js';
import h_admin_restore_orders from '../api-src/admin-restore-orders.js';
import h_admin_maintenance from '../api-src/admin-maintenance.js';
import h_admin_portal_announcements from '../api-src/admin-portal-announcements.js';
import h_admin_portal_tickets from '../api-src/admin-portal-tickets.js';
import h_admin_product_downloads from '../api-src/admin-product-downloads.js';
import h_admin_affiliates from '../api-src/admin-affiliates.js';
import h_referral_track from '../api-src/referral-track.js';
import h_unsubscribe from '../api-src/unsubscribe.js';
import h_admin_repair_fulfillment from '../api-src/admin-repair-fulfillment.js';
import h_admin_vouches from '../api-src/admin-vouches.js';
import h_blog_ssr from '../api-src/blog-ssr.js';
import h_blog_view from '../api-src/blog-view.js';
import h_chatbot from '../api-src/chatbot.js';
import h_create_manual_payment from '../api-src/create-manual-payment.js';
import h_create_payment from '../api-src/create-payment.js';
import h_cron_abandoned_checkout from '../api-src/cron-abandoned-checkout.js';
import h_email_click from '../api-src/email-click.js';
import h_email_open from '../api-src/email-open.js';
import h_get_abandoned_checkout from '../api-src/get-abandoned-checkout.js';
import h_get_email_marketing from '../api-src/get-email-marketing.js';
import h_cron_seed_vouch from '../api-src/cron-seed-vouch.js';
import h_generate_blog from '../api-src/generate-blog.js';
import h_get_blog_by_slug from '../api-src/get-blog-by-slug.js';
import h_get_blogs from '../api-src/get-blogs.js';
import h_get_orders from '../api-src/get-orders.js';
import h_get_promo_signups from '../api-src/get-promo-signups.js';
import h_maintenance_gate from '../api-src/maintenance-gate.js';
import h_maintenance_unlock from '../api-src/maintenance-unlock.js';
import h_manage_order from '../api-src/manage-order.js';
import h_portal_announcements from '../api-src/portal-announcements.js';
import h_portal_account from '../api-src/portal-account.js';
import h_portal_bootstrap from '../api-src/portal-bootstrap.js';
import h_portal_claim_by_order from '../api-src/portal-claim-by-order.js';
import h_portal_license_keys from '../api-src/portal-license-keys.js';
import h_portal_me from '../api-src/portal-me.js';
import h_portal_messages from '../api-src/portal-messages.js';
import h_portal_tickets from '../api-src/portal-tickets.js';
import h_public_site_config from '../api-src/public-site-config.js';
import h_rss from '../api-src/rss.js';
import h_save_blog from '../api-src/save-blog.js';
import h_save_order from '../api-src/save-order.js';
import h_send_customer_receipt from '../api-src/send-customer-receipt.js';
import h_send_order_email from '../api-src/send-order-email.js';
import h_send_promo_email from '../api-src/send-promo-email.js';
import h_sitemap_blogs from '../api-src/sitemap-blogs.js';
import h_supabase_public from '../api-src/supabase-public.js';
import h_sync_orders from '../api-src/sync-orders.js';
import h_test_email from '../api-src/test-email.js';
import h_test_resend from '../api-src/test-resend.js';
import h_verify_payment from '../api-src/verify-payment.js';
import h_verify_ltc_payment from '../api-src/verify-ltc-payment.js';
import h_vouch from '../api-src/vouch.js';
import h_vouches from '../api-src/vouches.js';
import h_webhook from '../api-src/webhook.js';

const routes = {
  'admin-license-keys': h_admin_license_keys,
  'wallet-purchase': h_wallet_purchase,
  'admin-restore-orders': h_admin_restore_orders,
  'admin-maintenance': h_admin_maintenance,
  'admin-portal-announcements': h_admin_portal_announcements,
  'admin-portal-tickets': h_admin_portal_tickets,
  'admin-product-downloads': h_admin_product_downloads,
  'admin-affiliates': h_admin_affiliates,
  'referral-track': h_referral_track,
  'unsubscribe': h_unsubscribe,
  'admin-repair-fulfillment': h_admin_repair_fulfillment,
  'admin-vouches': h_admin_vouches,
  'blog-ssr': h_blog_ssr,
  'blog-view': h_blog_view,
  'chatbot': h_chatbot,
  'create-manual-payment': h_create_manual_payment,
  'create-payment': h_create_payment,
  'cron-abandoned-checkout': h_cron_abandoned_checkout,
  'email-click': h_email_click,
  'email-open': h_email_open,
  'get-abandoned-checkout': h_get_abandoned_checkout,
  'abandoned-checkout': h_get_abandoned_checkout,
  'email-marketing': h_get_email_marketing,
  'get-email-marketing': h_get_email_marketing,
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
  'portal-account': h_portal_account,
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
  'verify-ltc-payment': h_verify_ltc_payment,
  'vouch': h_vouch,
  'vouches': h_vouches,
  'webhook': h_webhook,
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  let rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
  // Fallback: when a friendly rewrite targets /api/<name> without the ?path= param,
  // derive the route from the URL path itself so it still resolves.
  if (!rawPath) {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const derived = pathname.replace(/^\/api\//, '').replace(/^\/+|\/+$/g, '');
      if (derived && !derived.includes('[')) rawPath = derived;
    } catch { /* ignore */ }
  }
  const routeName = String(rawPath || '').replace(/^\/+|\/+$/g, '');
  const route = routes[routeName];

  if (!route) {
    return res.status(404).json({ error: 'Not found', path: `/api/${routeName}` });
  }

  return route(req, res);
}
