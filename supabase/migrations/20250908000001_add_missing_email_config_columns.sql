-- Add missing columns to user_email_configs table
-- This migration ensures backward compatibility by adding columns if they don't exist

DO $$
BEGIN
    -- Add delete_after_import column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_email_configs' 
        AND column_name = 'delete_after_import'
    ) THEN
        ALTER TABLE public.user_email_configs 
        ADD COLUMN delete_after_import BOOLEAN DEFAULT false;
        
        RAISE NOTICE 'Added delete_after_import column to user_email_configs table';
    ELSE
        RAISE NOTICE 'delete_after_import column already exists in user_email_configs table';
    END IF;

    -- Add deletion_confirmation_shown column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_email_configs' 
        AND column_name = 'deletion_confirmation_shown'
    ) THEN
        ALTER TABLE public.user_email_configs 
        ADD COLUMN deletion_confirmation_shown BOOLEAN DEFAULT false;
        
        RAISE NOTICE 'Added deletion_confirmation_shown column to user_email_configs table';
    ELSE
        RAISE NOTICE 'deletion_confirmation_shown column already exists in user_email_configs table';
    END IF;

    -- Add sync_unread_only column if missing  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_email_configs' 
        AND column_name = 'sync_unread_only'
    ) THEN
        ALTER TABLE public.user_email_configs 
        ADD COLUMN sync_unread_only BOOLEAN DEFAULT true;
        
        RAISE NOTICE 'Added sync_unread_only column to user_email_configs table';
    ELSE
        RAISE NOTICE 'sync_unread_only column already exists in user_email_configs table';
    END IF;
    
END $$;

-- Update table comments to reflect new columns
COMMENT ON COLUMN user_email_configs.delete_after_import IS 'Whether to delete emails after successfully importing DMARC reports';
COMMENT ON COLUMN user_email_configs.deletion_confirmation_shown IS 'Whether user has seen and confirmed deletion behavior';
COMMENT ON COLUMN user_email_configs.sync_unread_only IS 'Whether to sync only unread emails (recommended) or all emails';

-- Grant necessary permissions (should already exist but ensuring consistency)
GRANT SELECT, INSERT, UPDATE, DELETE ON user_email_configs TO authenticated;