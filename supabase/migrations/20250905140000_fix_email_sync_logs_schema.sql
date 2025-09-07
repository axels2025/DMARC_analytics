-- Fix email_sync_logs table schema to ensure all required columns exist
-- This migration handles both existing tables and new installations

-- First, check if the table exists and add missing columns
DO $$
BEGIN
    -- Check if email_sync_logs table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_sync_logs') THEN
        -- Table exists, add missing columns if they don't exist
        
        -- Add emails_found column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'emails_found') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN emails_found INTEGER DEFAULT 0;
        END IF;
        
        -- Add attachments_found column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'attachments_found') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN attachments_found INTEGER DEFAULT 0;
        END IF;
        
        -- Add errors_count column if missing (renamed from errors)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'errors_count') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN errors_count INTEGER DEFAULT 0;
        END IF;
        
        -- Add deletion-related columns if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'emails_deleted') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN emails_deleted INTEGER DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'deletion_enabled') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN deletion_enabled BOOLEAN DEFAULT false;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'deletion_errors') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN deletion_errors INTEGER DEFAULT 0;
        END IF;
        
        -- Add metadata columns if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'deleted_emails_metadata') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN deleted_emails_metadata JSONB;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'error_details') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN error_details JSONB;
        END IF;
        
        -- Add sync_duration_seconds if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sync_logs' AND column_name = 'sync_duration_seconds') THEN
            ALTER TABLE public.email_sync_logs ADD COLUMN sync_duration_seconds INTEGER;
        END IF;
        
        RAISE NOTICE 'Updated existing email_sync_logs table with missing columns';
        
    ELSE
        -- Table doesn't exist, create it with full schema
        CREATE TABLE public.email_sync_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            config_id UUID NOT NULL,
            user_id UUID NOT NULL,
            
            -- Sync timing
            sync_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            sync_completed_at TIMESTAMP WITH TIME ZONE,
            sync_duration_seconds INTEGER,
            
            -- Sync status
            status VARCHAR(20) NOT NULL DEFAULT 'running' 
                CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
            
            -- Sync metrics
            emails_found INTEGER DEFAULT 0,
            emails_fetched INTEGER DEFAULT 0,
            attachments_found INTEGER DEFAULT 0,
            reports_processed INTEGER DEFAULT 0,
            reports_skipped INTEGER DEFAULT 0,
            errors_count INTEGER DEFAULT 0,
            
            -- Email deletion metrics
            emails_deleted INTEGER DEFAULT 0,
            deletion_enabled BOOLEAN DEFAULT false,
            deletion_errors INTEGER DEFAULT 0,
            
            -- Error information
            error_message TEXT,
            error_details JSONB,
            
            -- Audit trail for deleted emails
            deleted_emails_metadata JSONB,
            
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            
            -- Constraints
            CONSTRAINT valid_sync_duration CHECK (sync_duration_seconds IS NULL OR sync_duration_seconds >= 0),
            CONSTRAINT valid_counts CHECK (
                emails_found >= 0 AND emails_fetched >= 0 AND 
                attachments_found >= 0 AND reports_processed >= 0 AND 
                reports_skipped >= 0 AND errors_count >= 0 AND 
                emails_deleted >= 0 AND deletion_errors >= 0
            )
        );

        -- Enable Row Level Security
        ALTER TABLE public.email_sync_logs ENABLE ROW LEVEL SECURITY;
        
        -- Create indexes
        CREATE INDEX idx_email_sync_logs_config_id ON email_sync_logs(config_id);
        CREATE INDEX idx_email_sync_logs_user_id ON email_sync_logs(user_id);
        CREATE INDEX idx_email_sync_logs_started_at ON email_sync_logs(sync_started_at DESC);
        CREATE INDEX idx_email_sync_logs_status ON email_sync_logs(status);
        
        RAISE NOTICE 'Created new email_sync_logs table';
        
    END IF;
    
    -- Ensure RLS policies exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_sync_logs' 
        AND policyname = 'Users can view their own sync logs'
    ) THEN
        CREATE POLICY "Users can view their own sync logs" 
        ON public.email_sync_logs 
        FOR SELECT 
        USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_sync_logs' 
        AND policyname = 'Users can create their own sync logs'
    ) THEN
        CREATE POLICY "Users can create their own sync logs" 
        ON public.email_sync_logs 
        FOR INSERT 
        WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_sync_logs' 
        AND policyname = 'Users can update their own sync logs'
    ) THEN
        CREATE POLICY "Users can update their own sync logs" 
        ON public.email_sync_logs 
        FOR UPDATE 
        USING (auth.uid() = user_id);
    END IF;

END $$;

-- Add trigger for duration calculation if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'calculate_sync_duration_trigger'
        AND event_object_table = 'email_sync_logs'
    ) THEN
        CREATE TRIGGER calculate_sync_duration_trigger
            BEFORE UPDATE ON email_sync_logs
            FOR EACH ROW EXECUTE FUNCTION calculate_sync_duration();
    END IF;
END $$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON email_sync_logs TO authenticated;

-- Update table comment
COMMENT ON TABLE email_sync_logs IS 'Detailed logs of email sync operations including deletion metrics';