CREATE TABLE IF NOT EXISTS public.customer_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower ON public.orders(LOWER(customer_email));
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can read their profile" ON public.customer_profiles;
CREATE POLICY "Customers can read their profile" ON public.customer_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Customers can update their profile" ON public.customer_profiles;
CREATE POLICY "Customers can update their profile" ON public.customer_profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.sync_customer_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.customer_profiles (id, email, display_name, updated_at)
    VALUES (NEW.id, LOWER(NEW.email), NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'display_name', '')), ''), NOW())
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
    IF NEW.email_confirmed_at IS NOT NULL THEN
        UPDATE public.orders SET user_id = NEW.id
        WHERE user_id IS NULL AND LOWER(customer_email) = LOWER(NEW.email);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_account_sync ON auth.users;
CREATE TRIGGER on_auth_user_account_sync
AFTER INSERT OR UPDATE OF email, email_confirmed_at, raw_user_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_account();
