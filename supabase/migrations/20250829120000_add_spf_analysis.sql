-- Add SPF Record Analysis Engine support to the database
-- This migration extends the existing database schema to support SPF record analysis, 
-- optimization suggestions, and monitoring capabilities

-- First, extend the existing user_domains table to include SPF data
ALTER TABLE user_domains 
ADD COLUMN spf_record TEXT,
ADD COLUMN spf_lookup_count INTEGER DEFAULT 0,
ADD COLUMN spf_last_analyzed TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN user_domains.spf_record IS 'Latest SPF record for this domain';
COMMENT ON COLUMN user_domains.spf_lookup_count IS 'Number of DNS lookups in the current SPF record';
COMMENT ON COLUMN user_domains.spf_last_analyzed IS 'When the SPF record was last analyzed';

-- Create SPF analysis history table
CREATE TABLE public.spf_analysis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    spf_record TEXT NOT NULL,
    lookup_count INTEGER NOT NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    analysis_data JSONB NOT NULL, -- Full SPFAnalysis object
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_lookup_count CHECK (lookup_count >= 0 AND lookup_count <= 50),
    CONSTRAINT valid_domain_format CHECK (domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$')
);

-- Enable Row Level Security
ALTER TABLE public.spf_analysis_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_analysis_history
CREATE POLICY "Users can view their own SPF analysis history" 
ON public.spf_analysis_history 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SPF analysis history" 
ON public.spf_analysis_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SPF analysis history" 
ON public.spf_analysis_history 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create SPF optimization suggestions table
CREATE TABLE public.spf_optimization_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES public.spf_analysis_history(id) ON DELETE CASCADE,
    suggestion_type VARCHAR(50) NOT NULL CHECK (suggestion_type IN ('flatten_include', 'remove_ptr', 'consolidate_mx', 'use_ip4', 'remove_redundant')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    description TEXT NOT NULL,
    mechanism VARCHAR(500),
    estimated_savings INTEGER DEFAULT 0,
    implementation_notes TEXT,
    applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_estimated_savings CHECK (estimated_savings >= 0 AND estimated_savings <= 20)
);

-- Enable Row Level Security
ALTER TABLE public.spf_optimization_suggestions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spf_optimization_suggestions (inherit from analysis_history)
CREATE POLICY "Users can view suggestions for their analyses" 
ON public.spf_optimization_suggestions 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM spf_analysis_history 
        WHERE spf_analysis_history.id = analysis_id 
        AND spf_analysis_history.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create suggestions for their analyses" 
ON public.spf_optimization_suggestions 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM spf_analysis_history 
        WHERE spf_analysis_history.id = analysis_id 
        AND spf_analysis_history.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update suggestions for their analyses" 
ON public.spf_optimization_suggestions 
FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM spf_analysis_history 
        WHERE spf_analysis_history.id = analysis_id 
        AND spf_analysis_history.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete suggestions for their analyses" 
ON public.spf_optimization_suggestions 
FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM spf_analysis_history 
        WHERE spf_analysis_history.id = analysis_id 
        AND spf_analysis_history.user_id = auth.uid()
    )
);

-- Create SPF monitoring settings table
CREATE TABLE public.user_spf_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    monitor_enabled BOOLEAN DEFAULT true,
    alert_threshold INTEGER DEFAULT 8,
    last_checked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Ensure unique monitoring per user per domain
    UNIQUE(user_id, domain),
    
    -- Constraints
    CONSTRAINT valid_alert_threshold CHECK (alert_threshold >= 1 AND alert_threshold <= 15),
    CONSTRAINT valid_domain_format CHECK (domain ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$')
);

-- Enable Row Level Security
ALTER TABLE public.user_spf_monitoring ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_spf_monitoring
CREATE POLICY "Users can view their own SPF monitoring settings" 
ON public.user_spf_monitoring 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SPF monitoring settings" 
ON public.user_spf_monitoring 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SPF monitoring settings" 
ON public.user_spf_monitoring 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SPF monitoring settings" 
ON public.user_spf_monitoring 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_spf_analysis_history_user_domain ON spf_analysis_history(user_id, domain);
CREATE INDEX idx_spf_analysis_history_created_at ON spf_analysis_history(created_at DESC);
CREATE INDEX idx_spf_analysis_history_risk_level ON spf_analysis_history(risk_level);
CREATE INDEX idx_spf_analysis_history_lookup_count ON spf_analysis_history(lookup_count);

CREATE INDEX idx_spf_optimization_suggestions_analysis_id ON spf_optimization_suggestions(analysis_id);
CREATE INDEX idx_spf_optimization_suggestions_applied ON spf_optimization_suggestions(applied);
CREATE INDEX idx_spf_optimization_suggestions_severity ON spf_optimization_suggestions(severity);

CREATE INDEX idx_user_spf_monitoring_user_domain ON user_spf_monitoring(user_id, domain);
CREATE INDEX idx_user_spf_monitoring_enabled ON user_spf_monitoring(monitor_enabled) WHERE monitor_enabled = true;
CREATE INDEX idx_user_spf_monitoring_last_checked ON user_spf_monitoring(last_checked_at);

CREATE INDEX idx_user_domains_spf_lookup_count ON user_domains(spf_lookup_count) WHERE spf_lookup_count IS NOT NULL;
CREATE INDEX idx_user_domains_spf_last_analyzed ON user_domains(spf_last_analyzed) WHERE spf_last_analyzed IS NOT NULL;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_spf_monitoring_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user_spf_monitoring updated_at
CREATE TRIGGER update_user_spf_monitoring_updated_at_trigger
    BEFORE UPDATE ON user_spf_monitoring
    FOR EACH ROW
    EXECUTE FUNCTION update_user_spf_monitoring_updated_at();

-- Create function to clean up old SPF analysis history (keep last 100 per user per domain)
CREATE OR REPLACE FUNCTION cleanup_old_spf_analysis()
RETURNS void AS $$
BEGIN
    -- Keep only the 100 most recent analyses per user per domain
    DELETE FROM spf_analysis_history 
    WHERE id IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id, domain 
                       ORDER BY created_at DESC
                   ) as rn
            FROM spf_analysis_history
        ) t
        WHERE rn > 100
    );
    
    -- Log cleanup action
    RAISE NOTICE 'Cleaned up old SPF analysis history records';
END;
$$ LANGUAGE plpgsql;

-- Create a function to get SPF health summary for a user
CREATE OR REPLACE FUNCTION get_user_spf_health_summary(target_user_id UUID)
RETURNS TABLE (
    total_domains BIGINT,
    healthy_domains BIGINT,
    warning_domains BIGINT,
    critical_domains BIGINT,
    average_lookups NUMERIC(10,2),
    last_analysis TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH latest_analyses AS (
        SELECT DISTINCT ON (domain) 
               domain, 
               lookup_count, 
               risk_level, 
               created_at
        FROM spf_analysis_history 
        WHERE user_id = target_user_id
        ORDER BY domain, created_at DESC
    )
    SELECT 
        COUNT(*) as total_domains,
        COUNT(*) FILTER (WHERE risk_level = 'low') as healthy_domains,
        COUNT(*) FILTER (WHERE risk_level IN ('medium', 'high')) as warning_domains,
        COUNT(*) FILTER (WHERE risk_level = 'critical') as critical_domains,
        ROUND(AVG(lookup_count), 2) as average_lookups,
        MAX(created_at) as last_analysis
    FROM latest_analyses;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION get_user_spf_health_summary(UUID) TO authenticated;

-- Add constraint to ensure RLS applies to the function
CREATE POLICY "Users can only get their own SPF health summary" 
ON public.spf_analysis_history 
FOR SELECT 
USING (
    auth.uid() = user_id 
    OR 
    -- Allow the function to access data when called by the same user
    (SELECT auth.uid()) = user_id
);

-- Add helpful comments
COMMENT ON TABLE spf_analysis_history IS 'Stores historical SPF record analyses for tracking changes and trends';
COMMENT ON TABLE spf_optimization_suggestions IS 'Stores optimization suggestions generated for each SPF analysis';
COMMENT ON TABLE user_spf_monitoring IS 'User settings for SPF monitoring and alerts';

COMMENT ON FUNCTION get_user_spf_health_summary(UUID) IS 'Returns aggregate SPF health metrics for a user across all their domains';
COMMENT ON FUNCTION cleanup_old_spf_analysis() IS 'Maintenance function to clean up old SPF analysis records while preserving recent history';

-- Create a view for easy SPF health monitoring
CREATE VIEW spf_health_overview AS
SELECT 
    u.user_id,
    u.domain,
    u.spf_record,
    u.spf_lookup_count,
    u.spf_last_analyzed,
    m.monitor_enabled,
    m.alert_threshold,
    m.last_checked_at as last_monitored,
    CASE 
        WHEN u.spf_lookup_count IS NULL THEN 'unknown'
        WHEN u.spf_lookup_count >= 10 THEN 'critical'
        WHEN u.spf_lookup_count >= 8 THEN 'high'
        WHEN u.spf_lookup_count >= 6 THEN 'medium'
        ELSE 'low'
    END as current_risk_level,
    CASE
        WHEN m.monitor_enabled AND u.spf_lookup_count >= m.alert_threshold THEN true
        ELSE false
    END as should_alert
FROM user_domains u
LEFT JOIN user_spf_monitoring m ON u.user_id = m.user_id AND u.domain = m.domain
WHERE u.spf_record IS NOT NULL;

-- Enable RLS on the view (inherits from base tables)
ALTER VIEW spf_health_overview SET (security_barrier = true);

COMMENT ON VIEW spf_health_overview IS 'Consolidated view of SPF health status across all monitored domains';