-- The corrected portal email-claim flow and exact admin-token validation were
-- deployed and verified on all production aliases before releasing containment.
DROP TRIGGER IF EXISTS emergency_block_portal_token_issuance
ON public.order_portal_tokens;

DROP FUNCTION IF EXISTS public.block_portal_token_issuance();

DROP TRIGGER IF EXISTS emergency_block_product_download_mutation
ON public.product_downloads;

DROP FUNCTION IF EXISTS public.block_product_download_mutation();
