-- Add data lifecycle management functions

-- Function to get forensic data statistics for a user
CREATE OR REPLACE FUNCTION get_forensic_data_stats(target_user_id UUID)
RETURNS TABLE (
    total_count BIGINT,
    oldest_record TIMESTAMP WITH TIME ZONE,
    newest_record TIMESTAMP WITH TIME ZONE,
    anonymized_count BIGINT,
    encrypted_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_count,
        MIN(created_at) as oldest_record,
        MAX(created_at) as newest_record,
        COUNT(*) FILTER (WHERE anonymized_at IS NOT NULL) as anonymized_count,
        COUNT(*) FILTER (WHERE encryption_key_id IS NOT NULL) as encrypted_count
    FROM dmarc_forensic_reports 
    WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create the forensic data stats function (called from TypeScript)
CREATE OR REPLACE FUNCTION create_forensic_data_stats_function()
RETURNS BOOLEAN AS $$
BEGIN
    -- This function exists to provide a way to call the stats function from the app
    -- In a real implementation, you might use this to create or update the function
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely delete expired data
CREATE OR REPLACE FUNCTION delete_expired_forensic_data(
    target_user_id UUID,
    retention_days INTEGER,
    batch_size INTEGER DEFAULT 100
)
RETURNS TABLE (
    deleted_count INTEGER,
    execution_time_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    cutoff_date TIMESTAMP WITH TIME ZONE;
    deleted_rows INTEGER := 0;
BEGIN
    start_time := clock_timestamp();
    cutoff_date := now() - (retention_days || ' days')::INTERVAL;
    
    -- Delete expired records in batches
    LOOP
        DELETE FROM dmarc_forensic_reports 
        WHERE user_id = target_user_id 
        AND created_at < cutoff_date
        AND id IN (
            SELECT id FROM dmarc_forensic_reports 
            WHERE user_id = target_user_id 
            AND created_at < cutoff_date
            LIMIT batch_size
        );
        
        GET DIAGNOSTICS deleted_rows = ROW_COUNT;
        
        -- Exit if no more rows to delete
        IF deleted_rows = 0 THEN
            EXIT;
        END IF;
        
        -- Add to total count
        deleted_count := COALESCE(deleted_count, 0) + deleted_rows;
        
        -- Check if we've hit time limits or processed enough
        IF clock_timestamp() - start_time > INTERVAL '30 seconds' THEN
            EXIT;
        END IF;
    END LOOP;
    
    end_time := clock_timestamp();
    execution_time_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely anonymize old data
CREATE OR REPLACE FUNCTION anonymize_old_forensic_data(
    target_user_id UUID,
    anonymize_after_days INTEGER,
    batch_size INTEGER DEFAULT 100
)
RETURNS TABLE (
    anonymized_count INTEGER,
    execution_time_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    cutoff_date TIMESTAMP WITH TIME ZONE;
    anonymized_rows INTEGER := 0;
BEGIN
    start_time := clock_timestamp();
    cutoff_date := now() - (anonymize_after_days || ' days')::INTERVAL;
    
    -- Anonymize old records in batches
    LOOP
        UPDATE dmarc_forensic_reports 
        SET 
            envelope_from = '[ANONYMIZED]',
            envelope_to = '[ANONYMIZED]',
            subject = '[ANONYMIZED]',
            original_headers = '[ANONYMIZED]',
            message_body = '[ANONYMIZED]',
            anonymized_at = now()
        WHERE user_id = target_user_id 
        AND created_at < cutoff_date
        AND anonymized_at IS NULL
        AND id IN (
            SELECT id FROM dmarc_forensic_reports 
            WHERE user_id = target_user_id 
            AND created_at < cutoff_date 
            AND anonymized_at IS NULL
            LIMIT batch_size
        );
        
        GET DIAGNOSTICS anonymized_rows = ROW_COUNT;
        
        -- Exit if no more rows to anonymize
        IF anonymized_rows = 0 THEN
            EXIT;
        END IF;
        
        -- Add to total count
        anonymized_count := COALESCE(anonymized_count, 0) + anonymized_rows;
        
        -- Check if we've hit time limits
        IF clock_timestamp() - start_time > INTERVAL '30 seconds' THEN
            EXIT;
        END IF;
    END LOOP;
    
    end_time := clock_timestamp();
    execution_time_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get data inventory summary
CREATE OR REPLACE FUNCTION get_data_inventory_summary(target_user_id UUID)
RETURNS TABLE (
    forensic_reports_count BIGINT,
    forensic_reports_oldest TIMESTAMP WITH TIME ZONE,
    forensic_reports_newest TIMESTAMP WITH TIME ZONE,
    forensic_reports_size_estimate BIGINT,
    privacy_settings_count BIGINT,
    audit_log_count BIGINT,
    audit_log_oldest TIMESTAMP WITH TIME ZONE,
    total_estimated_size BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Forensic reports
        COALESCE(f.count, 0) as forensic_reports_count,
        f.oldest as forensic_reports_oldest,
        f.newest as forensic_reports_newest,
        COALESCE(f.count, 0) * 2048 as forensic_reports_size_estimate, -- Estimate 2KB per record
        
        -- Privacy settings
        COALESCE(p.count, 0) as privacy_settings_count,
        
        -- Audit log
        COALESCE(a.count, 0) as audit_log_count,
        a.oldest as audit_log_oldest,
        
        -- Total size estimate
        (COALESCE(f.count, 0) * 2048) + (COALESCE(a.count, 0) * 512) as total_estimated_size
    FROM 
        (
            SELECT 
                COUNT(*) as count, 
                MIN(created_at) as oldest, 
                MAX(created_at) as newest
            FROM dmarc_forensic_reports 
            WHERE user_id = target_user_id
        ) f
    FULL OUTER JOIN
        (
            SELECT COUNT(*) as count
            FROM user_privacy_settings 
            WHERE user_id = target_user_id
        ) p ON true
    FULL OUTER JOIN
        (
            SELECT 
                COUNT(*) as count, 
                MIN(created_at) as oldest
            FROM privacy_audit_log 
            WHERE user_id::text = target_user_id::text
        ) a ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update retention policy last cleanup time
CREATE OR REPLACE FUNCTION update_retention_policy_cleanup(
    policy_id UUID,
    cleanup_time TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE data_retention_policies 
    SET 
        last_cleanup = cleanup_time,
        updated_at = now()
    WHERE id = policy_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add last_cleanup column to retention policies if not exists
ALTER TABLE data_retention_policies ADD COLUMN IF NOT EXISTS last_cleanup TIMESTAMP WITH TIME ZONE;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_forensic_reports_cleanup 
ON dmarc_forensic_reports(user_id, created_at) 
WHERE anonymized_at IS NULL;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_forensic_data_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_forensic_data_stats_function() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_expired_forensic_data(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION anonymize_old_forensic_data(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_data_inventory_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_retention_policy_cleanup(UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;