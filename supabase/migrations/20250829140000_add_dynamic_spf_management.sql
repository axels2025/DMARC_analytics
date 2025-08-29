-- Add Dynamic SPF Management support to the database
-- This migration extends the existing SPF flattening schema to support
-- automated monitoring, change detection, and dynamic updates

-- Extend existing user_spf_monitoring table with dynamic management fields
ALTER TABLE public.user_spf_monitoring
ADD COLUMN auto_update BOOLEAN DEFAULT false,
ADD COLUMN update_strategy VARCHAR(20) DEFAULT 'manual_approval' 
    CHECK (update_strategy IN ('immediate', 'scheduled', 'manual_approval')),
ADD COLUMN confidence_threshold INTEGER DEFAULT 80 
    CHECK (confidence_threshold >= 0 AND confidence_threshold <= 100),
ADD COLUMN max_changes_per_day INTEGER DEFAULT 5
    CHECK (max_changes_per_day >= 1 AND max_changes_per_day <= 50),
ADD COLUMN notification_webhook VARCHAR(500),
ADD COLUMN notification_email VARCHAR(255),
ADD COLUMN last_change_detected TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_auto_update TIMESTAMP WITH TIME ZONE,
ADD COLUMN check_interval VARCHAR(10) DEFAULT 'daily'
    CHECK (check_interval IN ('hourly', 'daily', 'weekly'));

-- Add comments for new columns
COMMENT ON COLUMN user_spf_monitoring.auto_update IS 'Enable automatic SPF record updates';
COMMENT ON COLUMN user_spf_monitoring.update_strategy IS 'Strategy for applying updates: immediate, scheduled, or manual approval';
COMMENT ON COLUMN user_spf_monitoring.confidence_threshold IS 'Minimum confidence percentage required for auto-updates';
COMMENT ON COLUMN user_spf_monitoring.max_changes_per_day IS 'Maximum number of automatic updates allowed per day';
COMMENT ON COLUMN user_spf_monitoring.notification_webhook IS 'Webhook URL for change notifications';
COMMENT ON COLUMN user_spf_monitoring.notification_email IS 'Email address for notifications (if different from user email)';
COMMENT ON COLUMN user_spf_monitoring.check_interval IS 'How frequently to check for changes';

-- Create SPF change events table for tracking all detected changes
CREATE TABLE public.spf_change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    include_domain VARCHAR(255) NOT NULL,
    esp_name VARCHAR(100),
    change_type VARCHAR(20) NOT NULL 
        CHECK (change_type IN ('added', 'removed', 'modified')),
    previous_ips TEXT[] NOT NULL DEFAULT '{}',
    current_ips TEXT[] NOT NULL DEFAULT '{}',
    impact_level VARCHAR(20) NOT NULL 
        CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),
    auto_update_safe BOOLEAN DEFAULT false,
    risk_factors TEXT[] DEFAULT '{}',
    recommended_action TEXT,
    
    -- Update tracking
    auto_updated BOOLEAN DEFAULT false,
    update_applied_at TIMESTAMP WITH TIME ZONE,
    rollback_required BOOLEAN DEFAULT false,
    
    -- Analysis data
    confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    analysis_data JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_domain_format CHECK (domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$'),
    CONSTRAINT valid_include_domain_format CHECK (include_domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$')
);

-- Enable Row Level Security
ALTER TABLE public.spf_change_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_change_events
CREATE POLICY "Users can view their own SPF change events" 
ON public.spf_change_events 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SPF change events" 
ON public.spf_change_events 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SPF change events" 
ON public.spf_change_events 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SPF change events" 
ON public.spf_change_events 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create ESP monitoring baseline table for tracking known good states
CREATE TABLE public.spf_esp_monitoring_baseline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    include_domain VARCHAR(255) NOT NULL,
    
    -- Baseline data
    baseline_ips TEXT[] NOT NULL DEFAULT '{}',
    ip_ranges TEXT[] DEFAULT '{}', -- Known IP ranges for this ESP
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Monitoring configuration
    monitoring_enabled BOOLEAN DEFAULT true,
    change_sensitivity VARCHAR(10) DEFAULT 'medium'
        CHECK (change_sensitivity IN ('low', 'medium', 'high')),
    auto_update_enabled BOOLEAN DEFAULT false,
    
    -- ESP metadata
    esp_stability_rating INTEGER DEFAULT 5 CHECK (esp_stability_rating >= 1 AND esp_stability_rating <= 10),
    change_frequency VARCHAR(20) DEFAULT 'monthly'
        CHECK (change_frequency IN ('rare', 'monthly', 'weekly', 'daily')),
    last_known_change TIMESTAMP WITH TIME ZONE,
    
    -- Tracking
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Ensure unique baseline per user per domain per include
    UNIQUE(user_id, domain, include_domain),
    
    CONSTRAINT valid_domain_format CHECK (domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$'),
    CONSTRAINT valid_include_domain_format CHECK (include_domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$')
);

-- Enable Row Level Security
ALTER TABLE public.spf_esp_monitoring_baseline ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_esp_monitoring_baseline
CREATE POLICY "Users can view their own ESP monitoring baselines" 
ON public.spf_esp_monitoring_baseline 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ESP monitoring baselines" 
ON public.spf_esp_monitoring_baseline 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ESP monitoring baselines" 
ON public.spf_esp_monitoring_baseline 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ESP monitoring baselines" 
ON public.spf_esp_monitoring_baseline 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create dynamic update operations table
CREATE TABLE public.spf_dynamic_update_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    
    -- Operation details
    operation_type VARCHAR(20) NOT NULL DEFAULT 'auto_update'
        CHECK (operation_type IN ('auto_update', 'scheduled_update', 'manual_update', 'rollback')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed', 'rolled_back')),
    
    -- Record data
    original_record TEXT NOT NULL,
    updated_record TEXT,
    rollback_record TEXT,
    
    -- Change analysis
    changes_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_assessment VARCHAR(20) NOT NULL 
        CHECK (risk_assessment IN ('low', 'medium', 'high', 'critical')),
    confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    
    -- Update strategy
    update_strategy VARCHAR(20) NOT NULL 
        CHECK (update_strategy IN ('immediate', 'scheduled', 'manual_approval')),
    strategy_config JSONB DEFAULT '{}'::jsonb,
    
    -- Execution tracking
    scheduled_for TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    
    -- Results
    execution_results JSONB DEFAULT '{}'::jsonb,
    errors TEXT[],
    warnings TEXT[],
    
    -- Approval workflow
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    CONSTRAINT valid_domain_format CHECK (domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$')
);

-- Enable Row Level Security
ALTER TABLE public.spf_dynamic_update_operations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_dynamic_update_operations
CREATE POLICY "Users can view their own dynamic update operations" 
ON public.spf_dynamic_update_operations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dynamic update operations" 
ON public.spf_dynamic_update_operations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dynamic update operations" 
ON public.spf_dynamic_update_operations 
FOR UPDATE 
USING (auth.uid() = user_id OR auth.uid() = approved_by);

CREATE POLICY "Users can delete their own dynamic update operations" 
ON public.spf_dynamic_update_operations 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create system notifications table
CREATE TABLE public.spf_system_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Notification details
    notification_type VARCHAR(30) NOT NULL 
        CHECK (notification_type IN ('change_detected', 'update_completed', 'update_failed', 'approval_required', 'system_alert')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    
    -- Related entities
    domain VARCHAR(255),
    change_event_id UUID REFERENCES public.spf_change_events(id),
    update_operation_id UUID REFERENCES public.spf_dynamic_update_operations(id),
    
    -- Status tracking
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    is_dismissed BOOLEAN DEFAULT false,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery tracking
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    webhook_sent BOOLEAN DEFAULT false,
    webhook_sent_at TIMESTAMP WITH TIME ZONE,
    webhook_response TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '30 days')
);

-- Enable Row Level Security
ALTER TABLE public.spf_system_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_system_notifications
CREATE POLICY "Users can view their own system notifications" 
ON public.spf_system_notifications 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own system notifications" 
ON public.spf_system_notifications 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own system notifications" 
ON public.spf_system_notifications 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create performance optimized indexes
CREATE INDEX idx_spf_change_events_user_domain ON spf_change_events(user_id, domain);
CREATE INDEX idx_spf_change_events_created_at ON spf_change_events(created_at DESC);
CREATE INDEX idx_spf_change_events_impact_level ON spf_change_events(impact_level);
CREATE INDEX idx_spf_change_events_auto_updated ON spf_change_events(auto_updated);
CREATE INDEX idx_spf_change_events_include_domain ON spf_change_events(include_domain);

CREATE INDEX idx_spf_esp_monitoring_baseline_user_domain ON spf_esp_monitoring_baseline(user_id, domain);
CREATE INDEX idx_spf_esp_monitoring_baseline_include ON spf_esp_monitoring_baseline(include_domain);
CREATE INDEX idx_spf_esp_monitoring_baseline_monitoring ON spf_esp_monitoring_baseline(monitoring_enabled) WHERE monitoring_enabled = true;
CREATE INDEX idx_spf_esp_monitoring_baseline_last_verified ON spf_esp_monitoring_baseline(last_verified);

CREATE INDEX idx_spf_dynamic_update_operations_user_domain ON spf_dynamic_update_operations(user_id, domain);
CREATE INDEX idx_spf_dynamic_update_operations_status ON spf_dynamic_update_operations(status);
CREATE INDEX idx_spf_dynamic_update_operations_scheduled ON spf_dynamic_update_operations(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_spf_dynamic_update_operations_approval ON spf_dynamic_update_operations(requires_approval) WHERE requires_approval = true;
CREATE INDEX idx_spf_dynamic_update_operations_created_at ON spf_dynamic_update_operations(created_at DESC);

CREATE INDEX idx_spf_system_notifications_user_unread ON spf_system_notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_spf_system_notifications_severity ON spf_system_notifications(severity);
CREATE INDEX idx_spf_system_notifications_created_at ON spf_system_notifications(created_at DESC);
CREATE INDEX idx_spf_system_notifications_expires_at ON spf_system_notifications(expires_at);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_spf_monitoring_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_spf_esp_monitoring_baseline_updated_at_trigger
    BEFORE UPDATE ON spf_esp_monitoring_baseline
    FOR EACH ROW
    EXECUTE FUNCTION update_spf_monitoring_updated_at();

CREATE TRIGGER update_spf_dynamic_update_operations_updated_at_trigger
    BEFORE UPDATE ON spf_dynamic_update_operations
    FOR EACH ROW
    EXECUTE FUNCTION update_spf_monitoring_updated_at();

-- Create function to get user monitoring summary
CREATE OR REPLACE FUNCTION get_user_monitoring_summary(target_user_id UUID)
RETURNS TABLE (
    total_monitored_domains BIGINT,
    domains_with_auto_update BIGINT,
    pending_changes BIGINT,
    pending_approvals BIGINT,
    recent_updates BIGINT,
    unread_notifications BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH monitoring_stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE monitor_enabled = true) as monitored_count,
            COUNT(*) FILTER (WHERE auto_update = true) as auto_update_count
        FROM user_spf_monitoring 
        WHERE user_id = target_user_id
    ),
    change_stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE auto_updated = false AND created_at > now() - INTERVAL '7 days') as pending_count
        FROM spf_change_events 
        WHERE user_id = target_user_id
    ),
    update_stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE requires_approval = true AND status = 'pending') as approval_count,
            COUNT(*) FILTER (WHERE status = 'completed' AND executed_at > now() - INTERVAL '7 days') as recent_count
        FROM spf_dynamic_update_operations 
        WHERE user_id = target_user_id
    ),
    notification_stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE is_read = false) as unread_count
        FROM spf_system_notifications 
        WHERE user_id = target_user_id
    )
    SELECT 
        m.monitored_count as total_monitored_domains,
        m.auto_update_count as domains_with_auto_update,
        c.pending_count as pending_changes,
        u.approval_count as pending_approvals,
        u.recent_count as recent_updates,
        n.unread_count as unread_notifications
    FROM monitoring_stats m, change_stats c, update_stats u, notification_stats n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION get_user_monitoring_summary(UUID) TO authenticated;

-- Create function to clean up old data
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data()
RETURNS void AS $$
BEGIN
    -- Clean up old change events (keep last 1000 per user)
    DELETE FROM spf_change_events 
    WHERE id IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id 
                       ORDER BY created_at DESC
                   ) as rn
            FROM spf_change_events
        ) t
        WHERE rn > 1000
    );
    
    -- Clean up old update operations (keep last 500 per user)
    DELETE FROM spf_dynamic_update_operations 
    WHERE id IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id 
                       ORDER BY created_at DESC
                   ) as rn
            FROM spf_dynamic_update_operations
        ) t
        WHERE rn > 500
    );
    
    -- Clean up expired notifications
    DELETE FROM spf_system_notifications 
    WHERE expires_at < now() AND is_dismissed = true;
    
    RAISE NOTICE 'Cleaned up old monitoring data';
END;
$$ LANGUAGE plpgsql;

-- Create function to generate system notifications
CREATE OR REPLACE FUNCTION create_spf_notification(
    target_user_id UUID,
    notification_type VARCHAR(30),
    title VARCHAR(255),
    message TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    domain VARCHAR(255) DEFAULT NULL,
    change_event_id UUID DEFAULT NULL,
    update_operation_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO spf_system_notifications (
        user_id, notification_type, title, message, severity,
        domain, change_event_id, update_operation_id
    ) VALUES (
        target_user_id, notification_type, title, message, severity,
        domain, change_event_id, update_operation_id
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_spf_notification(UUID, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, UUID) TO authenticated;

-- Create comprehensive monitoring view
CREATE VIEW spf_monitoring_dashboard AS
SELECT 
    u.user_id,
    u.domain,
    u.monitor_enabled,
    u.auto_update,
    u.update_strategy,
    u.confidence_threshold,
    u.check_interval,
    u.last_checked_at,
    u.last_change_detected,
    u.last_auto_update,
    
    -- Baseline summary
    COUNT(b.id) as monitored_includes_count,
    COUNT(b.id) FILTER (WHERE b.monitoring_enabled = true) as active_includes_count,
    AVG(b.esp_stability_rating) as avg_esp_stability,
    
    -- Recent changes
    COUNT(c.id) FILTER (WHERE c.created_at > now() - INTERVAL '7 days') as recent_changes_count,
    COUNT(c.id) FILTER (WHERE c.auto_updated = false AND c.created_at > now() - INTERVAL '7 days') as pending_changes_count,
    MAX(c.created_at) as last_change_detected_actual,
    
    -- Update operations
    COUNT(o.id) FILTER (WHERE o.created_at > now() - INTERVAL '30 days') as recent_operations_count,
    COUNT(o.id) FILTER (WHERE o.status = 'pending' AND o.requires_approval = true) as pending_approvals_count,
    
    -- Risk assessment
    CASE 
        WHEN COUNT(c.id) FILTER (WHERE c.impact_level = 'critical' AND c.created_at > now() - INTERVAL '24 hours') > 0 THEN 'critical'
        WHEN COUNT(c.id) FILTER (WHERE c.impact_level = 'high' AND c.created_at > now() - INTERVAL '24 hours') > 0 THEN 'high'
        WHEN COUNT(c.id) FILTER (WHERE c.impact_level IN ('medium', 'high') AND c.created_at > now() - INTERVAL '7 days') > 0 THEN 'medium'
        ELSE 'low'
    END as current_risk_level

FROM user_spf_monitoring u
LEFT JOIN spf_esp_monitoring_baseline b ON u.user_id = b.user_id AND u.domain = b.domain
LEFT JOIN spf_change_events c ON u.user_id = c.user_id AND u.domain = c.domain
LEFT JOIN spf_dynamic_update_operations o ON u.user_id = o.user_id AND u.domain = o.domain
GROUP BY u.user_id, u.domain, u.monitor_enabled, u.auto_update, u.update_strategy, 
         u.confidence_threshold, u.check_interval, u.last_checked_at, u.last_change_detected, u.last_auto_update;

-- Enable RLS on the view
ALTER VIEW spf_monitoring_dashboard SET (security_barrier = true);

-- Add helpful comments
COMMENT ON TABLE spf_change_events IS 'Tracks all detected changes in SPF include mechanisms with impact assessment';
COMMENT ON TABLE spf_esp_monitoring_baseline IS 'Stores baseline IP configurations for monitored ESP includes';
COMMENT ON TABLE spf_dynamic_update_operations IS 'Tracks automatic and scheduled SPF record update operations';
COMMENT ON TABLE spf_system_notifications IS 'System notifications for SPF monitoring events and updates';

COMMENT ON FUNCTION get_user_monitoring_summary(UUID) IS 'Returns comprehensive monitoring statistics for a user';
COMMENT ON FUNCTION cleanup_old_monitoring_data() IS 'Maintenance function to clean up old monitoring data';
COMMENT ON FUNCTION create_spf_notification(UUID, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, UUID) IS 'Creates system notifications for SPF events';

COMMENT ON VIEW spf_monitoring_dashboard IS 'Comprehensive monitoring dashboard view with aggregated statistics and risk assessment';