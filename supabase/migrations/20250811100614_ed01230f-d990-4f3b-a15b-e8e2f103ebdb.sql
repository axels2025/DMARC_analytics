-- Create enum for trust levels
DO $$ BEGIN
  CREATE TYPE public.trust_level AS ENUM ('trusted', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create table for user-managed trusted/blocked IPs and ranges
CREATE TABLE IF NOT EXISTS public.trusted_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  ip_address INET,
  ip_range CIDR,
  trust_level public.trust_level NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ip_or_range CHECK (ip_address IS NOT NULL OR ip_range IS NOT NULL)
);

-- Enable RLS
ALTER TABLE public.trusted_ips ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policies for trusted_ips
DROP POLICY IF EXISTS "Users can view their own trusted IPs" ON public.trusted_ips;
DROP POLICY IF EXISTS "Users can insert their own trusted IPs" ON public.trusted_ips;
DROP POLICY IF EXISTS "Users can update their own trusted IPs" ON public.trusted_ips;
DROP POLICY IF EXISTS "Users can delete their own trusted IPs" ON public.trusted_ips;

CREATE POLICY "Users can view their own trusted IPs"
ON public.trusted_ips
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trusted IPs"
ON public.trusted_ips
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trusted IPs"
ON public.trusted_ips
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trusted IPs"
ON public.trusted_ips
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_trusted_ips_user_domain ON public.trusted_ips (user_id, domain);
CREATE INDEX IF NOT EXISTS idx_trusted_ips_ip ON public.trusted_ips (ip_address);
CREATE INDEX IF NOT EXISTS idx_trusted_ips_range ON public.trusted_ips USING gist (ip_range inet_ops);

-- Create table to store IP classification intelligence (per-user or global)
CREATE TABLE IF NOT EXISTS public.ip_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  domain TEXT NULL,
  ip INET NOT NULL,
  category TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  provider TEXT NULL,
  hostname TEXT NULL,
  details JSONB NULL,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ip_classifications ENABLE ROW LEVEL SECURITY;

-- Recreate policies for ip_classifications
DROP POLICY IF EXISTS "Users can view their own and global classifications" ON public.ip_classifications;
DROP POLICY IF EXISTS "Users can insert their own classifications" ON public.ip_classifications;
DROP POLICY IF EXISTS "Users can update their own classifications" ON public.ip_classifications;
DROP POLICY IF EXISTS "Users can delete their own classifications" ON public.ip_classifications;

CREATE POLICY "Users can view their own and global classifications"
ON public.ip_classifications
FOR SELECT
TO authenticated
USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can insert their own classifications"
ON public.ip_classifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own classifications"
ON public.ip_classifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own classifications"
ON public.ip_classifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ip_classifications_ip ON public.ip_classifications (ip);
CREATE INDEX IF NOT EXISTS idx_ip_classifications_user_domain ON public.ip_classifications (user_id, domain);

-- Optional: simple category constraint via trigger-safe approach (no time-based logic)
DO $$ BEGIN
  CREATE DOMAIN public.ip_category AS TEXT
    CHECK (VALUE IN ('authorized','cloud_provider','esp','suspicious','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure category values conform by adding a constraint via trigger that copies value to domain-cast column
ALTER TABLE public.ip_classifications
  ADD COLUMN IF NOT EXISTS category_safe public.ip_category;

-- Backfill and maintain category_safe
CREATE OR REPLACE FUNCTION public.ensure_category_safe()
RETURNS TRIGGER AS $$
BEGIN
  NEW.category_safe := NEW.category::public.ip_category;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_ip_classifications_category
  BEFORE INSERT OR UPDATE ON public.ip_classifications
  FOR EACH ROW EXECUTE FUNCTION public.ensure_category_safe();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
