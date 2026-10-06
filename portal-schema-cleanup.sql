-- =========================================
-- CREED PORTAL - Clean up old schema before applying new one
-- Run this first in Supabase SQL Editor
-- =========================================

-- Drop the old license key inventory table (from previous agent)
DROP TABLE IF EXISTS license_keys_inventory CASCADE;

-- Drop any indexes on the old table
DROP INDEX IF EXISTS idx_license_keys_inventory_key_value;
DROP INDEX IF EXISTS idx_license_keys_inventory_pool;
DROP INDEX IF EXISTS idx_license_keys_inventory_order;

-- Drop the new tables if they exist (to start fresh)
DROP TABLE IF EXISTS order_license_assignments CASCADE;
DROP TABLE IF EXISTS product_downloads CASCADE;
DROP TABLE IF EXISTS license_keys CASCADE;

-- Drop any indexes that might exist on new tables
DROP INDEX IF EXISTS idx_license_keys_product_id;
DROP INDEX IF EXISTS idx_license_keys_order_id;
DROP INDEX IF EXISTS idx_license_keys_used;
DROP INDEX IF EXISTS idx_license_keys_key_value;
DROP INDEX IF EXISTS idx_product_downloads_product_id;
DROP INDEX IF EXISTS idx_product_downloads_active;
DROP INDEX IF EXISTS idx_order_license_assignments_order_id;
DROP INDEX IF EXISTS idx_order_license_assignments_key_id;

-- Drop the helper functions if they exist
DROP FUNCTION IF EXISTS assign_license_to_order(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_order_license_keys(TEXT);

-- =========================================
-- Now run the new schema from portal-license-schema.sql
-- =========================================

-- =========================================
-- NEW SCHEMA - Run this after cleanup above
-- =========================================

-- License keys table - stores pre-generated keys for products
CREATE TABLE IF NOT EXISTS license_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    key_value TEXT NOT NULL UNIQUE,
    order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for license keys
CREATE INDEX IF NOT EXISTS idx_license_keys_product_id ON license_keys(product_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_order_id ON license_keys(order_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_used ON license_keys(used);
CREATE INDEX IF NOT EXISTS idx_license_keys_key_value ON license_keys(key_value);

-- Download links table - stores loader download URLs
CREATE TABLE IF NOT EXISTS product_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL UNIQUE,
    product_name TEXT NOT NULL,
    download_url TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    supports TEXT DEFAULT 'Windows 10/11',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for product downloads
CREATE INDEX IF NOT EXISTS idx_product_downloads_product_id ON product_downloads(product_id);
CREATE INDEX IF NOT EXISTS idx_product_downloads_active ON product_downloads(is_active);

-- Order license assignments - tracks which licenses are assigned to which orders
CREATE TABLE IF NOT EXISTS order_license_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    license_key_id UUID NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by TEXT,
    UNIQUE(order_id, license_key_id)
);

CREATE INDEX IF NOT EXISTS idx_order_license_assignments_order_id ON order_license_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_license_assignments_key_id ON order_license_assignments(license_key_id);

-- RLS Policies
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_license_assignments ENABLE ROW LEVEL SECURITY;

-- Service role policies (API uses service role)
DROP POLICY IF EXISTS "Service role license_keys" ON license_keys;
CREATE POLICY "Service role license_keys" ON license_keys FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role product_downloads" ON product_downloads;
CREATE POLICY "Service role product_downloads" ON product_downloads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role order_license_assignments" ON order_license_assignments;
CREATE POLICY "Service role order_license_assignments" ON order_license_assignments FOR ALL USING (true) WITH CHECK (true);

-- Comments
COMMENT ON TABLE license_keys IS 'Pre-generated license keys for products. Keys are assigned to orders on purchase.';
COMMENT ON TABLE product_downloads IS 'Loader download URLs for each product';
COMMENT ON TABLE order_license_assignments IS 'Tracks which license keys are assigned to which orders';

-- Function to auto-assign license key to order
CREATE OR REPLACE FUNCTION assign_license_to_order(
    p_order_id TEXT,
    p_product_id TEXT
)
RETURNS TABLE(license_key TEXT, success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_key_id UUID;
    v_key_value TEXT;
BEGIN
    -- Find an available license key for this product
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM license_keys
    WHERE product_id = p_product_id
      AND used = false
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_key_id IS NULL THEN
        RETURN QUERY SELECT NULL::TEXT, false, 'No license keys available for this product';
        RETURN;
    END IF;
    
    -- Mark key as used
    UPDATE license_keys
    SET used = true,
        used_at = NOW(),
        order_id = p_order_id
    WHERE id = v_key_id;
    
    -- Create assignment record
    INSERT INTO order_license_assignments (order_id, license_key_id, assigned_by)
    VALUES (p_order_id, v_key_id, 'system');
    
    RETURN QUERY SELECT v_key_value, true, 'License key assigned successfully';
END;
$$;

-- Function to get license keys for order
CREATE OR REPLACE FUNCTION get_order_license_keys(p_order_id TEXT)
RETURNS TABLE(
    key_id UUID,
    product_id TEXT,
    product_name TEXT,
    key_value TEXT,
    assigned_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lk.id,
        lk.product_id,
        lk.product_name,
        lk.key_value,
        ola.assigned_at,
        lk.expires_at
    FROM license_keys lk
    JOIN order_license_assignments ola ON ola.license_key_id = lk.id
    WHERE ola.order_id = p_order_id
    ORDER BY ola.assigned_at DESC;
END;
$$;
