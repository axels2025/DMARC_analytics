-- Add SPF Flattening Support to the database
-- This migration extends the existing SPF analysis schema to support
-- flattening operations, history tracking, and performance monitoring

-- First, extend the spf_optimization_suggestions table to include flattening-specific suggestions
ALTER TABLE public.spf_optimization_suggestions
ADD COLUMN flattening_candidate BOOLEAN DEFAULT false,
ADD COLUMN include_domain VARCHAR(255),
ADD COLUMN resolved_ip_count INTEGER,
ADD COLUMN consolidation_potential INTEGER DEFAULT 0;

-- Add comments for the new columns
COMMENT ON COLUMN spf_optimization_suggestions.flattening_candidate IS 'Whether this suggestion involves flattening an include mechanism';
COMMENT ON COLUMN spf_optimization_suggestions.include_domain IS 'The domain of the include mechanism that can be flattened';
COMMENT ON COLUMN spf_optimization_suggestions.resolved_ip_count IS 'Number of IP addresses this include resolves to';
COMMENT ON COLUMN spf_optimization_suggestions.consolidation_potential IS 'Estimated number of IPs that could be consolidated via CIDR';

-- Create SPF flattening operations table
CREATE TABLE public.spf_flattening_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    analysis_id UUID REFERENCES public.spf_analysis_history(id) ON DELETE SET NULL,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('flatten', 'revert', 'preview')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'reverted')),
    
    -- Original record data
    original_record TEXT NOT NULL,
    original_lookup_count INTEGER NOT NULL,
    
    -- Target includes for flattening
    target_includes TEXT[] NOT NULL, -- Array of include domains to flatten
    
    -- Flattening options
    flattening_options JSONB NOT NULL DEFAULT '{"includeSubdomains": true, "consolidateCIDR": true, "preserveOrder": true, "maxIPsPerRecord": 50}'::jsonb,
    
    -- Results data
    flattened_record TEXT,
    new_lookup_count INTEGER,
    resolved_ips TEXT[], -- Array of IP addresses resolved from includes
    ip_count INTEGER DEFAULT 0,
    consolidation_applied BOOLEAN DEFAULT false,
    
    -- Performance metrics
    resolution_time_ms INTEGER,
    total_dns_queries INTEGER DEFAULT 0,
    
    -- Warnings and errors
    warnings TEXT[],
    errors TEXT[],
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    reverted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_lookup_counts CHECK (original_lookup_count >= 0 AND (new_lookup_count IS NULL OR new_lookup_count >= 0)),
    CONSTRAINT valid_ip_count CHECK (ip_count >= 0 AND ip_count <= 100),
    CONSTRAINT valid_resolution_time CHECK (resolution_time_ms IS NULL OR resolution_time_ms >= 0),
    CONSTRAINT valid_dns_queries CHECK (total_dns_queries >= 0),
    CONSTRAINT valid_domain_format CHECK (domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$'),
    CONSTRAINT completed_status_requirements CHECK (
        (status = 'completed' AND completed_at IS NOT NULL AND flattened_record IS NOT NULL AND new_lookup_count IS NOT NULL) OR
        (status != 'completed')
    )
);

-- Enable Row Level Security
ALTER TABLE public.spf_flattening_operations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_flattening_operations
CREATE POLICY "Users can view their own flattening operations" 
ON public.spf_flattening_operations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own flattening operations" 
ON public.spf_flattening_operations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own flattening operations" 
ON public.spf_flattening_operations 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flattening operations" 
ON public.spf_flattening_operations 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create ESP (Email Service Provider) classification table
CREATE TABLE public.spf_esp_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    include_domain VARCHAR(255) NOT NULL UNIQUE,
    esp_name VARCHAR(100) NOT NULL,
    esp_type VARCHAR(50) NOT NULL CHECK (esp_type IN ('transactional', 'marketing', 'enterprise', 'infrastructure', 'unknown')),
    is_stable BOOLEAN DEFAULT true, -- Whether the ESP's IPs change frequently
    requires_monitoring BOOLEAN DEFAULT false, -- Whether flattened records need regular monitoring
    consolidation_safe BOOLEAN DEFAULT true, -- Whether IP consolidation is safe for this ESP
    
    -- Metadata
    description TEXT,
    documentation_url VARCHAR(500),
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    CONSTRAINT valid_include_domain CHECK (include_domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$')
);

-- Populate with common ESP classifications
INSERT INTO public.spf_esp_classifications (include_domain, esp_name, esp_type, is_stable, requires_monitoring, consolidation_safe, description) VALUES
('_spf.google.com', 'Google Workspace', 'enterprise', true, false, true, 'Google Workspace (Gmail for Business) SPF include'),
('spf.protection.outlook.com', 'Microsoft 365', 'enterprise', true, false, true, 'Microsoft 365 (Office 365) SPF include'),
('include.mailgun.org', 'Mailgun', 'transactional', true, true, true, 'Mailgun transactional email service'),
('_spf.mailchannels.net', 'MailChannels', 'infrastructure', true, false, true, 'MailChannels SMTP relay service'),
('spf.mandrillapp.com', 'Mandrill', 'transactional', true, true, true, 'Mandrill by Mailchimp transactional email'),
('servers.mcsv.net', 'Mailchimp', 'marketing', false, true, false, 'Mailchimp marketing email platform'),
('_spf.createsend.com', 'Campaign Monitor', 'marketing', true, true, true, 'Campaign Monitor email marketing'),
('spf.constantcontact.com', 'Constant Contact', 'marketing', false, true, false, 'Constant Contact email marketing'),
('_spf.salesforce.com', 'Salesforce', 'enterprise', true, false, true, 'Salesforce Marketing Cloud'),
('mail.zendesk.com', 'Zendesk', 'enterprise', true, false, true, 'Zendesk customer service emails');

-- Make ESP classifications public (read-only)
GRANT SELECT ON public.spf_esp_classifications TO authenticated, anon;

-- Create flattening performance metrics table
CREATE TABLE public.spf_flattening_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id UUID NOT NULL REFERENCES public.spf_flattening_operations(id) ON DELETE CASCADE,
    
    -- Before metrics
    before_record_length INTEGER NOT NULL,
    before_lookup_count INTEGER NOT NULL,
    before_include_count INTEGER NOT NULL,
    before_ip_count INTEGER NOT NULL,
    
    -- After metrics
    after_record_length INTEGER,
    after_lookup_count INTEGER,
    after_include_count INTEGER,
    after_ip_count INTEGER,
    
    -- Performance improvements
    lookup_reduction INTEGER GENERATED ALWAYS AS (before_lookup_count - COALESCE(after_lookup_count, before_lookup_count)) STORED,
    size_change INTEGER GENERATED ALWAYS AS (COALESCE(after_record_length, before_record_length) - before_record_length) STORED,
    ip_expansion INTEGER GENERATED ALWAYS AS (COALESCE(after_ip_count, 0) - before_ip_count) STORED,
    
    -- DNS resolution metrics
    total_dns_queries INTEGER NOT NULL DEFAULT 0,
    resolution_time_ms INTEGER NOT NULL DEFAULT 0,
    cache_hit_rate NUMERIC(5,2) DEFAULT 0.0,
    
    -- Quality metrics
    consolidation_ratio NUMERIC(5,2), -- Ratio of consolidated to original IPs
    record_efficiency NUMERIC(5,2), -- Lookups saved per character added
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_lengths CHECK (before_record_length > 0 AND (after_record_length IS NULL OR after_record_length > 0)),
    CONSTRAINT valid_counts CHECK (
        before_lookup_count >= 0 AND before_include_count >= 0 AND before_ip_count >= 0 AND
        (after_lookup_count IS NULL OR after_lookup_count >= 0) AND
        (after_include_count IS NULL OR after_include_count >= 0) AND
        (after_ip_count IS NULL OR after_ip_count >= 0)
    ),
    CONSTRAINT valid_performance_metrics CHECK (
        total_dns_queries >= 0 AND resolution_time_ms >= 0 AND
        cache_hit_rate >= 0.0 AND cache_hit_rate <= 100.0
    ),
    CONSTRAINT valid_ratios CHECK (
        (consolidation_ratio IS NULL OR (consolidation_ratio >= 0.0 AND consolidation_ratio <= 1.0)) AND
        (record_efficiency IS NULL OR record_efficiency >= -10.0)
    )
);

-- Enable Row Level Security (inherits from operation)
ALTER TABLE public.spf_flattening_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_flattening_metrics (inherit from operations)
CREATE POLICY "Users can view metrics for their flattening operations" 
ON public.spf_flattening_metrics 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM spf_flattening_operations 
        WHERE spf_flattening_operations.id = operation_id 
        AND spf_flattening_operations.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create metrics for their flattening operations" 
ON public.spf_flattening_metrics 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM spf_flattening_operations 
        WHERE spf_flattening_operations.id = operation_id 
        AND spf_flattening_operations.user_id = auth.uid()
    )
);

-- Create indexes for performance
CREATE INDEX idx_spf_flattening_operations_user_domain ON spf_flattening_operations(user_id, domain);
CREATE INDEX idx_spf_flattening_operations_status ON spf_flattening_operations(status);
CREATE INDEX idx_spf_flattening_operations_created_at ON spf_flattening_operations(created_at DESC);
CREATE INDEX idx_spf_flattening_operations_analysis_id ON spf_flattening_operations(analysis_id) WHERE analysis_id IS NOT NULL;

CREATE INDEX idx_spf_esp_classifications_domain ON spf_esp_classifications(include_domain);
CREATE INDEX idx_spf_esp_classifications_type ON spf_esp_classifications(esp_type);
CREATE INDEX idx_spf_esp_classifications_stable ON spf_esp_classifications(is_stable);

CREATE INDEX idx_spf_flattening_metrics_operation_id ON spf_flattening_metrics(operation_id);
CREATE INDEX idx_spf_flattening_metrics_lookup_reduction ON spf_flattening_metrics(lookup_reduction DESC);
CREATE INDEX idx_spf_flattening_metrics_created_at ON spf_flattening_metrics(created_at DESC);

-- Add new indexes to existing tables for flattening queries
CREATE INDEX idx_spf_optimization_suggestions_flattening ON spf_optimization_suggestions(flattening_candidate) WHERE flattening_candidate = true;
CREATE INDEX idx_spf_optimization_suggestions_include_domain ON spf_optimization_suggestions(include_domain) WHERE include_domain IS NOT NULL;

-- Create function to automatically create metrics when flattening operation completes
CREATE OR REPLACE FUNCTION create_flattening_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create metrics when operation is completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO spf_flattening_metrics (
            operation_id,
            before_record_length,
            before_lookup_count,
            before_include_count,
            before_ip_count,
            after_record_length,
            after_lookup_count,
            after_include_count,
            after_ip_count,
            total_dns_queries,
            resolution_time_ms,
            consolidation_ratio
        ) VALUES (
            NEW.id,
            LENGTH(NEW.original_record),
            NEW.original_lookup_count,
            array_length(NEW.target_includes, 1),
            0, -- We don't track original IP count in the operation
            COALESCE(LENGTH(NEW.flattened_record), 0),
            COALESCE(NEW.new_lookup_count, 0),
            -- Calculate remaining includes (original includes - flattened includes)
            GREATEST(0, array_length(NEW.target_includes, 1) - array_length(NEW.target_includes, 1)),
            COALESCE(NEW.ip_count, 0),
            COALESCE(NEW.total_dns_queries, 0),
            COALESCE(NEW.resolution_time_ms, 0),
            CASE 
                WHEN NEW.ip_count > 0 AND NEW.consolidation_applied THEN 
                    LEAST(1.0, GREATEST(0.0, 1.0 - (NEW.ip_count::numeric / GREATEST(1, array_length(NEW.resolved_ips, 1)))))
                ELSE NULL
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic metrics creation
CREATE TRIGGER create_flattening_metrics_trigger
    AFTER UPDATE ON spf_flattening_operations
    FOR EACH ROW
    EXECUTE FUNCTION create_flattening_metrics();

-- Create function to get flattening summary for a user
CREATE OR REPLACE FUNCTION get_user_flattening_summary(target_user_id UUID)
RETURNS TABLE (
    total_operations BIGINT,
    completed_operations BIGINT,
    total_lookup_reduction BIGINT,
    total_domains_flattened BIGINT,
    average_resolution_time NUMERIC(10,2),
    last_operation TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_operations,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_operations,
        COALESCE(SUM(
            CASE WHEN status = 'completed' THEN original_lookup_count - COALESCE(new_lookup_count, original_lookup_count)
                 ELSE 0 
            END
        ), 0) as total_lookup_reduction,
        COUNT(DISTINCT domain) FILTER (WHERE status = 'completed') as total_domains_flattened,
        ROUND(AVG(resolution_time_ms) FILTER (WHERE status = 'completed'), 2) as average_resolution_time,
        MAX(created_at) as last_operation
    FROM spf_flattening_operations 
    WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION get_user_flattening_summary(UUID) TO authenticated;

-- Create function to clean up old flattening operations (keep last 50 per user per domain)
CREATE OR REPLACE FUNCTION cleanup_old_flattening_operations()
RETURNS void AS $$
BEGIN
    -- Keep only the 50 most recent operations per user per domain
    DELETE FROM spf_flattening_operations 
    WHERE id IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id, domain 
                       ORDER BY created_at DESC
                   ) as rn
            FROM spf_flattening_operations
        ) t
        WHERE rn > 50
    );
    
    -- Log cleanup action
    RAISE NOTICE 'Cleaned up old SPF flattening operations';
END;
$$ LANGUAGE plpgsql;

-- Create a view for flattening insights
CREATE VIEW spf_flattening_insights AS
SELECT 
    o.user_id,
    o.domain,
    o.id as operation_id,
    o.status,
    o.original_lookup_count,
    o.new_lookup_count,
    o.ip_count,
    o.consolidation_applied,
    array_length(o.target_includes, 1) as includes_flattened,
    o.created_at,
    o.completed_at,
    
    -- Performance metrics from metrics table
    m.lookup_reduction,
    m.size_change,
    m.ip_expansion,
    m.consolidation_ratio,
    m.resolution_time_ms,
    
    -- ESP classifications for included domains
    array_agg(DISTINCT e.esp_name) FILTER (WHERE e.esp_name IS NOT NULL) as esp_names,
    bool_and(e.is_stable) FILTER (WHERE e.esp_name IS NOT NULL) as all_esps_stable,
    bool_or(e.requires_monitoring) FILTER (WHERE e.esp_name IS NOT NULL) as requires_monitoring,
    
    -- Risk assessment
    CASE 
        WHEN o.status != 'completed' THEN 'pending'
        WHEN o.new_lookup_count >= 10 THEN 'critical'
        WHEN o.new_lookup_count >= 8 THEN 'high'
        WHEN bool_or(e.requires_monitoring) FILTER (WHERE e.esp_name IS NOT NULL) THEN 'medium'
        ELSE 'low'
    END as risk_level
    
FROM spf_flattening_operations o
LEFT JOIN spf_flattening_metrics m ON o.id = m.operation_id
LEFT JOIN spf_esp_classifications e ON e.include_domain = ANY(o.target_includes)
GROUP BY o.id, m.lookup_reduction, m.size_change, m.ip_expansion, m.consolidation_ratio, m.resolution_time_ms;

-- Enable RLS on the view (inherits from base tables)
ALTER VIEW spf_flattening_insights SET (security_barrier = true);

-- Add helpful comments
COMMENT ON TABLE spf_flattening_operations IS 'Tracks SPF flattening operations including original records, targets, results, and performance metrics';
COMMENT ON TABLE spf_esp_classifications IS 'Classification of Email Service Providers for intelligent flattening decisions';
COMMENT ON TABLE spf_flattening_metrics IS 'Detailed performance and improvement metrics for flattening operations';

COMMENT ON FUNCTION get_user_flattening_summary(UUID) IS 'Returns aggregate flattening performance metrics for a user';
COMMENT ON FUNCTION cleanup_old_flattening_operations() IS 'Maintenance function to clean up old flattening operations while preserving recent history';

COMMENT ON VIEW spf_flattening_insights IS 'Comprehensive view of flattening operations with ESP insights and risk assessment';

-- Create notification function for critical flattening results
CREATE OR REPLACE FUNCTION check_flattening_result_safety()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if flattening resulted in still-problematic lookup count
    IF NEW.status = 'completed' AND NEW.new_lookup_count >= 8 THEN
        -- Could integrate with notification system here
        INSERT INTO spf_optimization_suggestions (
            analysis_id,
            suggestion_type,
            severity,
            description,
            estimated_savings,
            implementation_notes
        ) VALUES (
            NEW.analysis_id,
            'flatten_include',
            CASE WHEN NEW.new_lookup_count >= 10 THEN 'high' ELSE 'medium' END,
            format('Flattening operation completed but lookup count is still %s. Consider flattening additional includes.', NEW.new_lookup_count),
            GREATEST(0, NEW.new_lookup_count - 5),
            format('Target includes not yet flattened: %s', 
                array_to_string(
                    ARRAY(
                        SELECT unnest(ARRAY['example1.com', 'example2.com']) -- This would need actual logic to determine remaining includes
                    ), 
                    ', '
                )
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for safety checks
CREATE TRIGGER check_flattening_result_safety_trigger
    AFTER UPDATE ON spf_flattening_operations
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
    EXECUTE FUNCTION check_flattening_result_safety();