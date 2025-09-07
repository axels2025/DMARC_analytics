-- Add Gmail Sync Support with Email Deletion and Enhanced Status Tracking
-- This migration creates tables for managing Gmail email configurations and sync operations

-- User email configurations table
CREATE TABLE public.user_email_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
    email_address VARCHAR(320) NOT NULL, -- RFC 5321 max length
    
    -- OAuth credentials (encrypted)
    access_token TEXT, -- Encrypted access token
    refresh_token TEXT, -- Encrypted refresh token  
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Email deletion settings
    delete_after_import BOOLEAN DEFAULT false,
    deletion_confirmation_shown BOOLEAN DEFAULT false,
    
    -- Status and configuration
    is_active BOOLEAN DEFAULT true,
    auto_sync_enabled BOOLEAN DEFAULT true,
    sync_frequency VARCHAR(20) DEFAULT 'manual' 
        CHECK (sync_frequency IN ('manual', 'hourly', 'daily', 'weekly')),
    
    -- Sync status
    sync_status VARCHAR(20) DEFAULT 'idle' 
        CHECK (sync_status IN ('idle', 'syncing', 'completed', 'error')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_email CHECK (email_address ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    UNIQUE(user_id, provider, email_address)
);

-- Enable Row Level Security
ALTER TABLE public.user_email_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_email_configs
CREATE POLICY "Users can view their own email configs" 
ON public.user_email_configs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own email configs" 
ON public.user_email_configs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email configs" 
ON public.user_email_configs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email configs" 
ON public.user_email_configs 
FOR DELETE 
USING (auth.uid() = user_id);

-- Email sync logs table for detailed tracking
CREATE TABLE public.email_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES public.user_email_configs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
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
    reports_skipped INTEGER DEFAULT 0, -- Duplicates
    errors_count INTEGER DEFAULT 0,
    
    -- Email deletion metrics
    emails_deleted INTEGER DEFAULT 0,
    deletion_enabled BOOLEAN DEFAULT false,
    deletion_errors INTEGER DEFAULT 0,
    
    -- Error information
    error_message TEXT,
    error_details JSONB,
    
    -- Audit trail for deleted emails
    deleted_emails_metadata JSONB, -- Array of {messageId, subject, sender, deletedAt}
    
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

-- RLS policies for email_sync_logs
CREATE POLICY "Users can view their own sync logs" 
ON public.email_sync_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sync logs" 
ON public.email_sync_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync logs" 
ON public.email_sync_logs 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Email deletion audit table for compliance and recovery
CREATE TABLE public.email_deletion_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_log_id UUID NOT NULL REFERENCES public.email_sync_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    config_id UUID NOT NULL REFERENCES public.user_email_configs(id) ON DELETE CASCADE,
    
    -- Gmail message details
    gmail_message_id VARCHAR(50) NOT NULL,
    gmail_thread_id VARCHAR(50),
    
    -- Email metadata (for recovery reference)
    subject TEXT,
    sender VARCHAR(320),
    date_received TIMESTAMP WITH TIME ZONE,
    attachment_filenames TEXT[],
    
    -- Deletion details
    deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deletion_reason VARCHAR(100) DEFAULT 'dmarc_reports_processed',
    reports_imported INTEGER DEFAULT 0,
    
    -- Recovery information
    can_be_recovered BOOLEAN DEFAULT false,
    recovery_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_gmail_message_id CHECK (gmail_message_id ~ '^[a-zA-Z0-9_-]+$'),
    CONSTRAINT valid_reports_imported CHECK (reports_imported >= 0)
);

-- Enable Row Level Security
ALTER TABLE public.email_deletion_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_deletion_audit
CREATE POLICY "Users can view their own deletion audit logs" 
ON public.email_deletion_audit 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can create deletion audit logs" 
ON public.email_deletion_audit 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_user_email_configs_user_id ON user_email_configs(user_id);
CREATE INDEX idx_user_email_configs_status ON user_email_configs(sync_status);
CREATE INDEX idx_user_email_configs_active ON user_email_configs(is_active) WHERE is_active = true;

CREATE INDEX idx_email_sync_logs_config_id ON email_sync_logs(config_id);
CREATE INDEX idx_email_sync_logs_user_id ON email_sync_logs(user_id);
CREATE INDEX idx_email_sync_logs_started_at ON email_sync_logs(sync_started_at DESC);
CREATE INDEX idx_email_sync_logs_status ON email_sync_logs(status);

CREATE INDEX idx_email_deletion_audit_sync_log_id ON email_deletion_audit(sync_log_id);
CREATE INDEX idx_email_deletion_audit_user_id ON email_deletion_audit(user_id);
CREATE INDEX idx_email_deletion_audit_gmail_message_id ON email_deletion_audit(gmail_message_id);
CREATE INDEX idx_email_deletion_audit_deleted_at ON email_deletion_audit(deleted_at DESC);

-- Trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_email_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic timestamp updates on email configs
CREATE TRIGGER update_email_configs_updated_at_trigger
    BEFORE UPDATE ON user_email_configs
    FOR EACH ROW EXECUTE FUNCTION update_email_configs_updated_at();

-- Trigger function to calculate sync duration automatically
CREATE OR REPLACE FUNCTION calculate_sync_duration()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate duration when sync is completed
    IF NEW.sync_completed_at IS NOT NULL AND OLD.sync_completed_at IS NULL THEN
        NEW.sync_duration_seconds = EXTRACT(EPOCH FROM (NEW.sync_completed_at - NEW.sync_started_at))::INTEGER;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic duration calculation
CREATE TRIGGER calculate_sync_duration_trigger
    BEFORE UPDATE ON email_sync_logs
    FOR EACH ROW EXECUTE FUNCTION calculate_sync_duration();

-- Function to get comprehensive sync statistics for a user
CREATE OR REPLACE FUNCTION get_user_sync_summary(target_user_id UUID)
RETURNS TABLE (
    total_syncs BIGINT,
    successful_syncs BIGINT,
    total_emails_processed BIGINT,
    total_reports_imported BIGINT,
    total_duplicates_skipped BIGINT,
    total_emails_deleted BIGINT,
    average_sync_duration NUMERIC(10,2),
    last_sync TIMESTAMP WITH TIME ZONE,
    active_configs INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_syncs,
        COUNT(*) FILTER (WHERE esl.status = 'completed') as successful_syncs,
        COALESCE(SUM(esl.emails_fetched), 0) as total_emails_processed,
        COALESCE(SUM(esl.reports_processed), 0) as total_reports_imported,
        COALESCE(SUM(esl.reports_skipped), 0) as total_duplicates_skipped,
        COALESCE(SUM(esl.emails_deleted), 0) as total_emails_deleted,
        ROUND(AVG(esl.sync_duration_seconds) FILTER (WHERE esl.status = 'completed'), 2) as average_sync_duration,
        MAX(esl.sync_started_at) as last_sync,
        (SELECT COUNT(*)::INTEGER FROM user_email_configs WHERE user_id = target_user_id AND is_active = true) as active_configs
    FROM email_sync_logs esl
    WHERE esl.user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent sync status for dashboard
CREATE OR REPLACE FUNCTION get_recent_sync_status(target_user_id UUID, days_back INTEGER DEFAULT 7)
RETURNS TABLE (
    config_id UUID,
    email_address VARCHAR(320),
    last_sync TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20),
    emails_found INTEGER,
    reports_imported INTEGER,
    duplicates_skipped INTEGER,
    emails_deleted INTEGER,
    duration_seconds INTEGER,
    error_message TEXT,
    deletion_enabled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH latest_syncs AS (
        SELECT DISTINCT ON (esl.config_id)
            esl.config_id,
            esl.sync_started_at,
            esl.status,
            esl.emails_found,
            esl.reports_processed,
            esl.reports_skipped,
            esl.emails_deleted,
            esl.sync_duration_seconds,
            esl.error_message,
            esl.deletion_enabled
        FROM email_sync_logs esl
        WHERE esl.user_id = target_user_id
          AND esl.sync_started_at >= (now() - INTERVAL '1 day' * days_back)
        ORDER BY esl.config_id, esl.sync_started_at DESC
    )
    SELECT 
        ls.config_id,
        uec.email_address,
        ls.sync_started_at as last_sync,
        ls.status as sync_status,
        ls.emails_found,
        ls.reports_processed as reports_imported,
        ls.reports_skipped as duplicates_skipped,
        ls.emails_deleted,
        ls.sync_duration_seconds as duration_seconds,
        ls.error_message,
        ls.deletion_enabled
    FROM latest_syncs ls
    JOIN user_email_configs uec ON uec.id = ls.config_id
    WHERE uec.is_active = true
    ORDER BY ls.sync_started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely clean up old sync logs (keep last 100 per config)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS void AS $$
BEGIN
    -- Keep only the 100 most recent sync logs per config
    DELETE FROM email_sync_logs 
    WHERE id IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY config_id 
                       ORDER BY sync_started_at DESC
                   ) as rn
            FROM email_sync_logs
        ) t
        WHERE rn > 100
    );
    
    -- Clean up old deletion audit records (keep for 1 year)
    DELETE FROM email_deletion_audit 
    WHERE created_at < (now() - INTERVAL '1 year');
    
    RAISE NOTICE 'Cleaned up old sync logs and deletion audit records';
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_email_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON email_sync_logs TO authenticated;
GRANT SELECT, INSERT ON email_deletion_audit TO authenticated;

GRANT EXECUTE ON FUNCTION get_user_sync_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_sync_status(UUID, INTEGER) TO authenticated;

-- Add helpful comments
COMMENT ON TABLE user_email_configs IS 'User email account configurations for Gmail sync with deletion preferences';
COMMENT ON TABLE email_sync_logs IS 'Detailed logs of email sync operations including deletion metrics';
COMMENT ON TABLE email_deletion_audit IS 'Audit trail of deleted emails for compliance and recovery';

COMMENT ON COLUMN user_email_configs.delete_after_import IS 'Whether to delete emails after successfully importing DMARC reports';
COMMENT ON COLUMN user_email_configs.deletion_confirmation_shown IS 'Whether user has seen and confirmed deletion behavior';

COMMENT ON FUNCTION get_user_sync_summary(UUID) IS 'Returns comprehensive sync statistics for a user';
COMMENT ON FUNCTION get_recent_sync_status(UUID, INTEGER) IS 'Returns recent sync status for dashboard display';
COMMENT ON FUNCTION cleanup_old_sync_logs() IS 'Maintenance function to clean up old sync logs and audit records';

-- Create a view for easy sync status monitoring
CREATE VIEW email_sync_status AS
SELECT 
    uec.id as config_id,
    uec.user_id,
    uec.email_address,
    uec.provider,
    uec.sync_status,
    uec.is_active,
    uec.delete_after_import,
    uec.last_sync_at,
    uec.last_error_message,
    
    -- Latest sync log details
    latest.emails_found,
    latest.reports_processed,
    latest.reports_skipped,
    latest.emails_deleted,
    latest.sync_duration_seconds,
    latest.deletion_enabled as last_sync_deletion_enabled,
    
    -- Computed fields
    CASE 
        WHEN uec.last_sync_at IS NULL THEN 'never_synced'
        WHEN uec.last_sync_at < (now() - INTERVAL '7 days') THEN 'sync_overdue'
        WHEN uec.sync_status = 'error' THEN 'sync_error'
        WHEN uec.sync_status = 'syncing' THEN 'sync_in_progress'
        ELSE 'sync_ok'
    END as overall_status
    
FROM user_email_configs uec
LEFT JOIN LATERAL (
    SELECT 
        emails_found, reports_processed, reports_skipped, 
        emails_deleted, sync_duration_seconds, deletion_enabled
    FROM email_sync_logs 
    WHERE config_id = uec.id 
    ORDER BY sync_started_at DESC 
    LIMIT 1
) latest ON true
WHERE uec.is_active = true;

-- Enable RLS on the view
ALTER VIEW email_sync_status SET (security_barrier = true);