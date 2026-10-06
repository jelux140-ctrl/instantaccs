-- Temporary containment for the live staff_* authentication bypass. Remove
-- this trigger only after the corrected API has been deployed and verified.
CREATE OR REPLACE FUNCTION public.block_product_download_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Product download mutation temporarily locked for security';
END;
$$;
DROP TRIGGER IF EXISTS emergency_block_product_download_mutation ON public.product_downloads;
CREATE TRIGGER emergency_block_product_download_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.product_downloads
FOR EACH ROW EXECUTE FUNCTION public.block_product_download_mutation();
