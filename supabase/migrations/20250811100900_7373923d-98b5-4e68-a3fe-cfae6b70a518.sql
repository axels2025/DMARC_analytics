-- Harden ensure_category_safe function with fixed search_path
CREATE OR REPLACE FUNCTION public.ensure_category_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.category_safe := NEW.category::public.ip_category;
  RETURN NEW;
END;
$$;