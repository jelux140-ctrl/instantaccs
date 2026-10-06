-- =========================================================================
-- CREED - FRAUDULENT ORDER CLEANUP
-- =========================================================================
-- RUN security-fix-rls.sql FIRST. Cleaning up before closing the hole just
-- lets them refill the table.
--
-- HOW FRAUD IS IDENTIFIED
--   A legitimately paid order is written by the Stripe webhook, which always
--   sets BOTH:
--     * session_id  -> a real Stripe checkout session, always starts 'cs_'
--     * paid_at     -> a non-null timestamp
--
--   The injected rows were INSERTed straight through the anon key, so they
--   are 'completed' with no Stripe session and no paid_at. That is the
--   discriminator used below - not the fake email address, which the
--   attacker can trivially change.
--
-- RUN SECTION 1 (audit) FIRST AND READ THE OUTPUT before running section 3.
-- =========================================================================


-- =========================================================================
-- SECTION 1: AUDIT - what would be deleted. Deletes nothing.
-- =========================================================================

-- 1a. The suspected fraudulent orders, newest first.
SELECT id,
       customer_email,
       status,
       amount,
       currency,
       session_id,
       paid_at,
       created_at
FROM   orders
WHERE  status = 'completed'
  AND  (paid_at IS NULL OR session_id NOT LIKE 'cs_%')
ORDER  BY created_at DESC;

-- 1b. Totals, so you can sanity-check the scale before deleting.
SELECT COUNT(*)                      AS fraudulent_orders,
       COUNT(DISTINCT customer_email) AS distinct_emails,
       SUM(amount)                   AS fake_revenue,
       MIN(created_at)               AS first_seen,
       MAX(created_at)               AS last_seen
FROM   orders
WHERE  status = 'completed'
  AND  (paid_at IS NULL OR session_id NOT LIKE 'cs_%');

-- 1c. CONTROL QUERY - your genuine paid orders. These are NOT touched.
--     If this returns 0 rows, STOP: the discriminator is wrong for your
--     data and the delete below would remove real orders.
SELECT COUNT(*)    AS genuine_paid_orders,
       SUM(amount) AS real_revenue,
       MAX(created_at) AS most_recent
FROM   orders
WHERE  status = 'completed'
  AND  paid_at IS NOT NULL
  AND  session_id LIKE 'cs_%';

-- 1d. License keys the fraudulent orders consumed. These get released.
SELECT lk.id,
       lk.product_name,
       lk.key_value,
       lk.order_id,
       lk.used,
       lk.used_at
FROM   license_keys lk
JOIN   orders o ON o.id = lk.order_id
WHERE  o.status = 'completed'
  AND  (o.paid_at IS NULL OR o.session_id NOT LIKE 'cs_%');


-- =========================================================================
-- SECTION 2: OPTIONAL SAFETY NET - snapshot before deleting
-- =========================================================================
-- Keeps a copy so nothing is unrecoverable. Drop the table once you are happy.

CREATE TABLE IF NOT EXISTS _fraud_orders_backup AS
SELECT *, NOW() AS backed_up_at
FROM   orders
WHERE  status = 'completed'
  AND  (paid_at IS NULL OR session_id NOT LIKE 'cs_%');

SELECT COUNT(*) AS rows_backed_up FROM _fraud_orders_backup;


-- =========================================================================
-- SECTION 3: THE CLEANUP - only run after reviewing section 1
-- =========================================================================
-- Wrapped in a transaction. Inspect the row counts, then COMMIT or ROLLBACK.

BEGIN;

-- 3a. Release license keys the fake orders consumed, so they return to
--     inventory instead of being stranded as 'used'.
--     Must run BEFORE the delete: orders.id -> license_keys.order_id is
--     ON DELETE SET NULL, so the link disappears once the order is gone.
UPDATE license_keys lk
SET    used     = false,
       used_at  = NULL,
       order_id = NULL
FROM   orders o
WHERE  o.id = lk.order_id
  AND  o.status = 'completed'
  AND  (o.paid_at IS NULL OR o.session_id NOT LIKE 'cs_%');

-- 3b. Remove portal access tokens minted for the fake orders.
DELETE FROM order_portal_tokens t
USING  orders o
WHERE  o.id = t.order_id
  AND  o.status = 'completed'
  AND  (o.paid_at IS NULL OR o.session_id NOT LIKE 'cs_%');

-- 3c. Delete the fraudulent orders.
--     order_license_assignments cascades automatically on this delete.
DELETE FROM orders
WHERE  status = 'completed'
  AND  (paid_at IS NULL OR session_id NOT LIKE 'cs_%');

-- 3d. Confirm the table is clean. Should return 0.
SELECT COUNT(*) AS remaining_fraudulent
FROM   orders
WHERE  status = 'completed'
  AND  (paid_at IS NULL OR session_id NOT LIKE 'cs_%');

-- Review the counts above, then run ONE of:
--   COMMIT;
--   ROLLBACK;
COMMIT;


-- =========================================================================
-- SECTION 4: POST-CLEANUP INTEGRITY CHECK
-- =========================================================================

-- 4a. Orphaned assignments pointing at orders that no longer exist.
SELECT COUNT(*) AS orphaned_assignments
FROM   order_license_assignments a
LEFT   JOIN orders o ON o.id = a.order_id
WHERE  o.id IS NULL;

-- 4b. Keys still flagged used but attached to no order - check these by hand
--     before releasing, some may be legitimate manual fulfilments.
SELECT id, product_name, key_value, used_at
FROM   license_keys
WHERE  used = true
  AND  order_id IS NULL
ORDER  BY used_at DESC NULLS LAST;

-- 4c. Final state of the orders table.
SELECT status, COUNT(*) AS count, SUM(amount) AS total
FROM   orders
GROUP  BY status
ORDER  BY count DESC;
