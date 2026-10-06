CREATE OR REPLACE FUNCTION public.clean_order_display_text(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT LEFT(regexp_replace(COALESCE(value, ''), '[<>&"'']', '', 'g'), 254)
$$;
CREATE OR REPLACE FUNCTION public.sanitize_order_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.customer_email := NULLIF(public.clean_order_display_text(NEW.customer_email), '');
  NEW.discord_username := NULLIF(public.clean_order_display_text(NEW.discord_username), '');
  IF jsonb_typeof(NEW.items) = 'array' THEN
    SELECT COALESCE(jsonb_agg(item || jsonb_build_object('id', public.clean_order_display_text(item->>'id'),'name', public.clean_order_display_text(item->>'name'),'variant', public.clean_order_display_text(item->>'variant'))), '[]'::jsonb)
    INTO NEW.items FROM jsonb_array_elements(NEW.items) item;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sanitize_order_display_fields ON public.orders;
CREATE TRIGGER sanitize_order_display_fields BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sanitize_order_row();
UPDATE public.orders SET customer_email=customer_email, discord_username=discord_username, items=items;
