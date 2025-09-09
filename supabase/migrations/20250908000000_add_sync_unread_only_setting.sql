-- Add sync_unread_only setting to user_email_configs table
-- This allows users to choose whether to sync only unread emails or all emails

DO $$
BEGIN
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

-- Update table comment to reflect new column
COMMENT ON COLUMN user_email_configs.sync_unread_only IS 'Whether to sync only unread emails (recommended) or all emails';

-- Grant necessary permissions (should already exist but ensuring consistency)
GRANT SELECT, INSERT, UPDATE, DELETE ON user_email_configs TO authenticated;