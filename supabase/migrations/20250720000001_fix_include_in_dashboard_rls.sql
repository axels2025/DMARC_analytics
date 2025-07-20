-- Fix RLS and permissions for include_in_dashboard column
-- This migration ensures the new column is accessible through RLS policies

-- First, ensure the column exists (in case the previous migration wasn't applied)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dmarc_reports' 
        AND column_name = 'include_in_dashboard'
    ) THEN
        ALTER TABLE dmarc_reports 
        ADD COLUMN include_in_dashboard BOOLEAN NOT NULL DEFAULT true;
        
        COMMENT ON COLUMN dmarc_reports.include_in_dashboard IS 'Controls whether this report is included in dashboard calculations and metrics';
        
        CREATE INDEX IF NOT EXISTS idx_dmarc_reports_include_in_dashboard 
        ON dmarc_reports(include_in_dashboard);
    END IF;
END $$;

-- Refresh RLS policies to ensure they work with the new column
-- Drop and recreate the policies to ensure they include the new column

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own DMARC reports" ON public.dmarc_reports;
DROP POLICY IF EXISTS "Users can create their own DMARC reports" ON public.dmarc_reports;
DROP POLICY IF EXISTS "Users can update their own DMARC reports" ON public.dmarc_reports;
DROP POLICY IF EXISTS "Users can delete their own DMARC reports" ON public.dmarc_reports;

-- Recreate policies with explicit column access
CREATE POLICY "Users can view their own DMARC reports" 
ON public.dmarc_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own DMARC reports" 
ON public.dmarc_reports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own DMARC reports" 
ON public.dmarc_reports 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own DMARC reports" 
ON public.dmarc_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Grant explicit permissions on the new column (if needed)
GRANT SELECT, UPDATE ON dmarc_reports TO authenticated;
GRANT SELECT, UPDATE ON dmarc_reports TO anon;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';