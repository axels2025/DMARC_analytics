-- Add IP Intelligence Cache System
-- This migration creates a comprehensive IP intelligence caching system

-- IP intelligence cache table for storing IP lookup results
CREATE TABLE public.ip_intelligence_cache (
    ip_address INET PRIMARY KEY,
    country VARCHAR(100),
    country_code VARCHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50),
    isp VARCHAR(200),
    organization TEXT,
    as_number INTEGER,
    as_organization TEXT,
    
    -- Threat intelligence
    threat_level VARCHAR(20) DEFAULT 'unknown' CHECK (threat_level IN ('low', 'medium', 'high', 'critical', 'unknown')),
    is_vpn BOOLEAN DEFAULT false,
    is_proxy BOOLEAN DEFAULT false,
    is_tor BOOLEAN DEFAULT false,
    is_hosting BOOLEAN DEFAULT false,
    
    -- API provider info
    provider VARCHAR(50) NOT NULL,
    provider_confidence DECIMAL(3, 2) DEFAULT 1.0,
    
    -- Caching metadata
    cached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT now(),
    access_count INTEGER DEFAULT 1,
    
    -- Audit fields
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ip_intelligence_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for IP cache - allow all authenticated users to read/write
CREATE POLICY "Users can view IP intelligence cache" 
ON public.ip_intelligence_cache 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users can insert IP intelligence cache" 
ON public.ip_intelligence_cache 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update IP intelligence cache" 
ON public.ip_intelligence_cache 
FOR UPDATE 
TO authenticated
USING (true);

-- Indexes for performance
CREATE INDEX idx_ip_cache_expires_at ON ip_intelligence_cache(expires_at);
CREATE INDEX idx_ip_cache_provider ON ip_intelligence_cache(provider);
CREATE INDEX idx_ip_cache_cached_at ON ip_intelligence_cache(cached_at DESC);
CREATE INDEX idx_ip_cache_threat_level ON ip_intelligence_cache(threat_level) WHERE threat_level != 'unknown';
CREATE INDEX idx_ip_cache_country ON ip_intelligence_cache(country_code);
CREATE INDEX idx_ip_cache_org ON ip_intelligence_cache(organization) WHERE organization IS NOT NULL;

-- API usage tracking table
CREATE TABLE public.ip_intelligence_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ip_addresses_requested INTEGER NOT NULL DEFAULT 0,
    cache_hits INTEGER NOT NULL DEFAULT 0,
    cache_misses INTEGER NOT NULL DEFAULT 0,
    api_calls_made INTEGER NOT NULL DEFAULT 0,
    primary_provider VARCHAR(50),
    fallback_providers TEXT[], -- Array of fallback providers used
    
    -- Rate limiting tracking
    requests_this_hour INTEGER NOT NULL DEFAULT 0,
    requests_this_day INTEGER NOT NULL DEFAULT 0,
    
    -- Performance metrics
    average_response_time_ms INTEGER,
    total_processing_time_ms INTEGER,
    
    -- Timestamps
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    request_hour INTEGER NOT NULL DEFAULT EXTRACT(HOUR FROM now()),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for usage tracking
ALTER TABLE public.ip_intelligence_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own IP usage" 
ON public.ip_intelligence_usage 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "System can insert IP usage" 
ON public.ip_intelligence_usage 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Indexes for usage tracking
CREATE INDEX idx_ip_usage_user_date ON ip_intelligence_usage(user_id, request_date);
CREATE INDEX idx_ip_usage_user_hour ON ip_intelligence_usage(user_id, request_date, request_hour);
CREATE INDEX idx_ip_usage_created_at ON ip_intelligence_usage(created_at DESC);

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_ip_cache()
RETURNS void AS $$
BEGIN
    -- Delete entries that expired more than 7 days ago
    DELETE FROM ip_intelligence_cache 
    WHERE expires_at < (now() - INTERVAL '7 days');
    
    -- Clean up old usage records (keep last 90 days)
    DELETE FROM ip_intelligence_usage 
    WHERE created_at < (now() - INTERVAL '90 days');
    
    RAISE NOTICE 'Cleaned up expired IP intelligence cache entries';
END;
$$ LANGUAGE plpgsql;

-- Function to get IP cache statistics
CREATE OR REPLACE FUNCTION get_ip_cache_stats()
RETURNS TABLE (
    total_cached_ips BIGINT,
    active_cache_entries BIGINT,
    expired_entries BIGINT,
    cache_hit_rate DECIMAL(5,2),
    most_common_countries TEXT[],
    provider_usage JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH cache_stats AS (
        SELECT 
            COUNT(*) as total_ips,
            COUNT(*) FILTER (WHERE expires_at > now()) as active_ips,
            COUNT(*) FILTER (WHERE expires_at <= now()) as expired_ips
        FROM ip_intelligence_cache
    ),
    usage_stats AS (
        SELECT 
            COALESCE(SUM(cache_hits), 0) as total_hits,
            COALESCE(SUM(cache_misses), 0) as total_misses,
            array_agg(DISTINCT primary_provider) FILTER (WHERE primary_provider IS NOT NULL) as providers
        FROM ip_intelligence_usage
        WHERE created_at >= (now() - INTERVAL '30 days')
    ),
    country_stats AS (
        SELECT array_agg(country ORDER BY cnt DESC) as countries
        FROM (
            SELECT country, COUNT(*) as cnt
            FROM ip_intelligence_cache
            WHERE country IS NOT NULL
            GROUP BY country
            ORDER BY cnt DESC
            LIMIT 10
        ) top_countries
    ),
    provider_stats AS (
        SELECT jsonb_object_agg(provider, cnt) as provider_data
        FROM (
            SELECT provider, COUNT(*) as cnt
            FROM ip_intelligence_cache
            GROUP BY provider
        ) provider_counts
    )
    SELECT 
        cs.total_ips,
        cs.active_ips,
        cs.expired_ips,
        CASE 
            WHEN (us.total_hits + us.total_misses) > 0 
            THEN ROUND((us.total_hits::decimal / (us.total_hits + us.total_misses)) * 100, 2)
            ELSE 0.00
        END as hit_rate,
        COALESCE(cns.countries, ARRAY[]::TEXT[]),
        COALESCE(ps.provider_data, '{}'::jsonb)
    FROM cache_stats cs
    CROSS JOIN usage_stats us
    CROSS JOIN country_stats cns
    CROSS JOIN provider_stats ps;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update cache access tracking
CREATE OR REPLACE FUNCTION update_ip_cache_access(target_ip INET)
RETURNS void AS $$
BEGIN
    UPDATE ip_intelligence_cache 
    SET 
        last_accessed = now(),
        access_count = access_count + 1
    WHERE ip_address = target_ip;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_ip_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic timestamp updates
CREATE TRIGGER update_ip_cache_updated_at_trigger
    BEFORE UPDATE ON ip_intelligence_cache
    FOR EACH ROW EXECUTE FUNCTION update_ip_cache_updated_at();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ip_intelligence_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ip_intelligence_usage TO authenticated;

GRANT EXECUTE ON FUNCTION cleanup_expired_ip_cache() TO authenticated;
GRANT EXECUTE ON FUNCTION get_ip_cache_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION update_ip_cache_access(INET) TO authenticated;

-- Add helpful comments
COMMENT ON TABLE ip_intelligence_cache IS 'Cache for IP geolocation and threat intelligence data';
COMMENT ON TABLE ip_intelligence_usage IS 'Tracking table for IP intelligence API usage and rate limiting';

COMMENT ON COLUMN ip_intelligence_cache.threat_level IS 'Threat assessment level based on various security indicators';
COMMENT ON COLUMN ip_intelligence_cache.provider_confidence IS 'Confidence score from the API provider (0.0 to 1.0)';
COMMENT ON COLUMN ip_intelligence_cache.access_count IS 'Number of times this cached entry has been accessed';

COMMENT ON FUNCTION cleanup_expired_ip_cache() IS 'Maintenance function to remove expired cache entries';
COMMENT ON FUNCTION get_ip_cache_stats() IS 'Returns comprehensive statistics about IP cache usage';
COMMENT ON FUNCTION update_ip_cache_access(INET) IS 'Updates access tracking for cached IP entries';

-- Create view for active IP cache entries
CREATE VIEW ip_intelligence_active AS
SELECT 
    ip_address,
    country,
    country_code,
    region,
    city,
    isp,
    organization,
    threat_level,
    is_vpn,
    is_proxy,
    is_tor,
    is_hosting,
    provider,
    provider_confidence,
    cached_at,
    expires_at,
    EXTRACT(EPOCH FROM (expires_at - now())) / 3600 as hours_until_expiry,
    access_count,
    last_accessed
FROM ip_intelligence_cache
WHERE expires_at > now()
ORDER BY last_accessed DESC;

-- Enable RLS on the view
ALTER VIEW ip_intelligence_active SET (security_barrier = true);