-- Add privacy and encryption controls to the DMARC analytics system

-- Table: User privacy settings
CREATE TABLE user_privacy_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{
        "maskingLevel": "standard",
        "showEmailAddresses": false,
        "showSubjects": true,
        "showHeaders": true,
        "showMessageContent": false,
        "encryptSensitiveData": false,
        "retentionPeriodDays": 90,
        "auditDataAccess": true,
        "allowTemporaryReveal": true,
        "requireMasterPassword": false
    }',
    encryption_provider VARCHAR(50) DEFAULT 'browser-crypto',
    encryption_key_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id)
);

-- Table: Privacy audit log for compliance
CREATE TABLE privacy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    event_details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table: User encryption keys (encrypted with master password)
CREATE TABLE user_encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_id VARCHAR(100) NOT NULL,
    encrypted_key TEXT NOT NULL,
    algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-GCM',
    salt VARCHAR(200),
    iterations INTEGER DEFAULT 100000,
    key_purpose VARCHAR(50) DEFAULT 'data_encryption',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, key_id)
);

-- Table: Data retention policies
CREATE TABLE data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL,
    retention_days INTEGER NOT NULL DEFAULT 90,
    auto_delete BOOLEAN DEFAULT false,
    encryption_required BOOLEAN DEFAULT false,
    anonymize_after_days INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, data_type)
);

-- Table: Privacy compliance tracking
CREATE TABLE privacy_compliance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'data_request', 'data_deletion', 'consent_given', 'consent_withdrawn'
    request_type VARCHAR(50), -- 'access', 'rectification', 'erasure', 'portability', 'restriction'
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'rejected'
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    request_details JSONB DEFAULT '{}',
    response_data TEXT,
    created_by UUID REFERENCES auth.users(id),
    notes TEXT
);

-- Add privacy columns to existing forensic reports table
ALTER TABLE dmarc_forensic_reports ADD COLUMN IF NOT EXISTS privacy_level VARCHAR(20) DEFAULT 'standard';
ALTER TABLE dmarc_forensic_reports ADD COLUMN IF NOT EXISTS encryption_key_id VARCHAR(100);
ALTER TABLE dmarc_forensic_reports ADD COLUMN IF NOT EXISTS data_classification VARCHAR(20) DEFAULT 'internal';
ALTER TABLE dmarc_forensic_reports ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMP WITH TIME ZONE;

-- Indexes for performance
CREATE INDEX idx_privacy_settings_user_id ON user_privacy_settings(user_id);
CREATE INDEX idx_audit_log_user_id ON privacy_audit_log(user_id);
CREATE INDEX idx_audit_log_event_type ON privacy_audit_log(event_type);
CREATE INDEX idx_audit_log_created_at ON privacy_audit_log(created_at);
CREATE INDEX idx_encryption_keys_user_id ON user_encryption_keys(user_id);
CREATE INDEX idx_encryption_keys_active ON user_encryption_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_retention_policies_user_id ON data_retention_policies(user_id);
CREATE INDEX idx_compliance_events_user_id ON privacy_compliance_events(user_id);
CREATE INDEX idx_compliance_events_status ON privacy_compliance_events(status);
CREATE INDEX idx_forensic_reports_privacy ON dmarc_forensic_reports(user_id, privacy_level);
CREATE INDEX idx_forensic_reports_classification ON dmarc_forensic_reports(data_classification);

-- Enable Row Level Security
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_compliance_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_privacy_settings
CREATE POLICY "Users can view their own privacy settings" 
ON user_privacy_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own privacy settings" 
ON user_privacy_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own privacy settings" 
ON user_privacy_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for privacy_audit_log (append-only for users, read access)
CREATE POLICY "Users can view their own audit logs" 
ON privacy_audit_log 
FOR SELECT 
USING (auth.uid()::text = user_id::text);

CREATE POLICY "System can insert audit logs" 
ON privacy_audit_log 
FOR INSERT 
WITH CHECK (true); -- Allow system to log events for any user

-- RLS Policies for user_encryption_keys
CREATE POLICY "Users can manage their own encryption keys" 
ON user_encryption_keys 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for data_retention_policies
CREATE POLICY "Users can manage their own retention policies" 
ON data_retention_policies 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for privacy_compliance_events
CREATE POLICY "Users can view their own compliance events" 
ON privacy_compliance_events 
FOR SELECT 
USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create compliance requests" 
ON privacy_compliance_events 
FOR INSERT 
WITH CHECK (auth.uid()::text = user_id::text);

-- Trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_privacy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_privacy_settings_updated_at
    BEFORE UPDATE ON user_privacy_settings
    FOR EACH ROW EXECUTE FUNCTION update_privacy_updated_at();

CREATE TRIGGER update_retention_policies_updated_at
    BEFORE UPDATE ON data_retention_policies
    FOR EACH ROW EXECUTE FUNCTION update_privacy_updated_at();

-- Function to automatically create default privacy settings for new users
CREATE OR REPLACE FUNCTION create_default_privacy_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_privacy_settings (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default privacy settings (Note: This would ideally be on auth.users)
-- Since we can't directly modify auth schema, users will need to create settings on first access

-- Function to clean up expired data based on retention policies
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS INTEGER AS $$
DECLARE
    cleanup_count INTEGER := 0;
    policy_record RECORD;
BEGIN
    -- Clean up forensic reports based on retention policies
    FOR policy_record IN 
        SELECT drp.user_id, drp.retention_days, drp.auto_delete, drp.anonymize_after_days
        FROM data_retention_policies drp
        WHERE drp.data_type = 'forensic_report' AND drp.auto_delete = true
    LOOP
        -- Delete expired forensic reports
        DELETE FROM dmarc_forensic_reports 
        WHERE user_id = policy_record.user_id 
        AND created_at < (now() - INTERVAL '1 day' * policy_record.retention_days);
        
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        
        -- Anonymize old reports if configured
        IF policy_record.anonymize_after_days IS NOT NULL THEN
            UPDATE dmarc_forensic_reports 
            SET envelope_from = '[ANONYMIZED]',
                envelope_to = '[ANONYMIZED]',
                subject = '[ANONYMIZED]',
                original_headers = '[ANONYMIZED]',
                message_body = '[ANONYMIZED]',
                anonymized_at = now()
            WHERE user_id = policy_record.user_id 
            AND anonymized_at IS NULL
            AND created_at < (now() - INTERVAL '1 day' * policy_record.anonymize_after_days);
        END IF;
    END LOOP;
    
    -- Clean up old audit logs (keep for 2 years by default)
    DELETE FROM privacy_audit_log 
    WHERE created_at < (now() - INTERVAL '2 years');
    
    RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get privacy settings with defaults
CREATE OR REPLACE FUNCTION get_user_privacy_settings(target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    user_settings JSONB;
    default_settings JSONB := '{
        "maskingLevel": "standard",
        "showEmailAddresses": false,
        "showSubjects": true,
        "showHeaders": true,
        "showMessageContent": false,
        "encryptSensitiveData": false,
        "retentionPeriodDays": 90,
        "auditDataAccess": true,
        "allowTemporaryReveal": true,
        "requireMasterPassword": false
    }';
BEGIN
    -- Get user settings or return defaults
    SELECT settings INTO user_settings
    FROM user_privacy_settings
    WHERE user_id = target_user_id;
    
    IF user_settings IS NULL THEN
        -- Create default settings for user
        INSERT INTO user_privacy_settings (user_id, settings)
        VALUES (target_user_id, default_settings)
        ON CONFLICT (user_id) DO NOTHING;
        
        RETURN default_settings;
    END IF;
    
    RETURN user_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_privacy_settings TO authenticated;
GRANT SELECT, INSERT ON privacy_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_encryption_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE ON data_retention_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON privacy_compliance_events TO authenticated;

-- Initial data: Create default retention policies
INSERT INTO data_retention_policies (user_id, data_type, retention_days, auto_delete, encryption_required)
SELECT 
    id as user_id,
    unnest(ARRAY['forensic_report', 'email_content', 'headers', 'subject_line']) as data_type,
    90 as retention_days,
    false as auto_delete,
    false as encryption_required
FROM auth.users
ON CONFLICT (user_id, data_type) DO NOTHING;