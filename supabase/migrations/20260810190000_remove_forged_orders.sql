-- Remove only the incident IDs confirmed by the owner. Release any inventory
-- that could have been attached before deleting the forged order rows.
UPDATE public.license_keys
SET used = FALSE, used_at = NULL, order_id = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) - 'assigned_at' - 'assigned_to_order'
WHERE order_id IN (
  'order_1786354818807','order_1786354812066','order_1786354808755',
  'order_1786354806096','order_1786354803586','ord_1786352492873_tmxk80xph',
  'ord_1786354695400_9eigvpq2k','order_1786354790481','order_1786354786875',
  'creed_1786353371949_jh4p0q3mg','creed_1786353370489_t0fuevsgy',
  'creed_1786349846955_iy03ik6u4','creed_1786349845976_ohny5yak0',
  'creed_1786349844919_7zzfh8kcc'
);

DELETE FROM public.orders WHERE id IN (
  'order_1786354818807','order_1786354812066','order_1786354808755',
  'order_1786354806096','order_1786354803586','ord_1786352492873_tmxk80xph',
  'ord_1786354695400_9eigvpq2k','order_1786354790481','order_1786354786875',
  'creed_1786353371949_jh4p0q3mg','creed_1786353370489_t0fuevsgy',
  'creed_1786349846955_iy03ik6u4','creed_1786349845976_ohny5yak0',
  'creed_1786349844919_7zzfh8kcc'
);
