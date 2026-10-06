-- Add tracking for key assignment attempts
-- This prevents auto-assigning keys to old orders that were shown "out of stock"

CREATE TABLE IF NOT EXISTS order_key_assignment_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    product_id TEXT NOT NULL,
    success BOOLEAN NOT NULL DEFAULT false,
    license_key_id UUID REFERENCES license_keys(id),
    reason TEXT -- e.g., "no_stock", "assigned", etc.
);

CREATE INDEX IF NOT EXISTS idx_order_key_assignment_log_order_id ON order_key_assignment_log(order_id);
CREATE INDEX IF NOT EXISTS idx_order_key_assignment_log_product ON order_key_assignment_log(order_id, product_id);

ALTER TABLE order_key_assignment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role order_key_assignment_log" ON order_key_assignment_log;
CREATE POLICY "Service role order_key_assignment_log" ON order_key_assignment_log FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE order_key_assignment_log IS 'Tracks license key assignment attempts per order to prevent auto-assigning later when stock was unavailable at first login';
