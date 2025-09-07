import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Enhanced IP Intelligence types
export interface IPIntelligenceData {
  ip_address: string;
  country?: string | null;
  country_code?: string | null;
  region?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  isp?: string | null;
  organization?: string | null;
  as_number?: number | null;
  as_organization?: string | null;
  threat_level: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  is_vpn: boolean;
  is_proxy: boolean;
  is_tor: boolean;
  is_hosting: boolean;
  provider: string;
  provider_confidence: number;
  cached?: boolean;
  cache_age_hours?: number;
}

export interface IPIntelligenceBatchResponse {
  success: boolean;
  data: IPIntelligenceData[];
  errors: string[];
  metadata: {
    total_requested: number;
    cache_hits: number;
    cache_misses: number;
    api_calls_made: number;
    providers_used: string[];
    processing_time_ms: number;
  };
}

export interface IPIntelligenceStats {
  total_cached_ips: number;
  active_cache_entries: number;
  expired_entries: number;
  cache_hit_rate: number;
  most_common_countries: string[];
  provider_usage: Record<string, number>;
}

// Rate limiting and configuration
const BATCH_SIZE = 10; // Process IPs in batches
const REQUEST_TIMEOUT = 30000; // 30 second timeout
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second base delay

class IPIntelligenceService {
  private static instance: IPIntelligenceService;
  private requestQueue: Map<string, Promise<IPIntelligenceData>> = new Map();

  static getInstance(): IPIntelligenceService {
    if (!IPIntelligenceService.instance) {
      IPIntelligenceService.instance = new IPIntelligenceService();
    }
    return IPIntelligenceService.instance;
  }

  /**
   * Get IP intelligence for a single IP address
   */
  async getIPIntelligence(ip: string): Promise<IPIntelligenceData> {
    // Check if there's already a pending request for this IP
    const existingRequest = this.requestQueue.get(ip);
    if (existingRequest) {
      return existingRequest;
    }

    // Create new request and add to queue
    const request = this.fetchSingleIP(ip);
    this.requestQueue.set(ip, request);

    try {
      const result = await request;
      return result;
    } finally {
      // Remove from queue when done
      this.requestQueue.delete(ip);
    }
  }

  /**
   * Get IP intelligence for multiple IP addresses
   */
  async getIPIntelligenceBatch(ips: string[]): Promise<IPIntelligenceBatchResponse> {
    if (ips.length === 0) {
      return {
        success: true,
        data: [],
        errors: [],
        metadata: {
          total_requested: 0,
          cache_hits: 0,
          cache_misses: 0,
          api_calls_made: 0,
          providers_used: [],
          processing_time_ms: 0,
        },
      };
    }

    // Remove duplicates
    const uniqueIPs = [...new Set(ips)];
    
    // Process in batches to avoid overwhelming the API
    const results: IPIntelligenceData[] = [];
    const errors: string[] = [];
    let totalCacheHits = 0;
    let totalCacheMisses = 0;
    let totalApiCalls = 0;
    const allProvidersUsed = new Set<string>();
    const startTime = Date.now();

    for (let i = 0; i < uniqueIPs.length; i += BATCH_SIZE) {
      const batch = uniqueIPs.slice(i, i + BATCH_SIZE);
      
      try {
        const batchResponse = await this.callInternalAPI(batch);
        
        if (batchResponse.success) {
          results.push(...batchResponse.data);
          totalCacheHits += batchResponse.metadata.cache_hits;
          totalCacheMisses += batchResponse.metadata.cache_misses;
          totalApiCalls += batchResponse.metadata.api_calls_made;
          batchResponse.metadata.providers_used.forEach(p => allProvidersUsed.add(p));
        }
        
        if (batchResponse.errors.length > 0) {
          errors.push(...batchResponse.errors);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${errorMessage}`);
        
        // Add fallback data for failed batch
        batch.forEach(ip => {
          results.push({
            ip_address: ip,
            threat_level: 'unknown',
            is_vpn: false,
            is_proxy: false,
            is_tor: false,
            is_hosting: false,
            provider: 'fallback',
            provider_confidence: 0.1,
            cached: false,
          });
        });
      }

      // Add small delay between batches
      if (i + BATCH_SIZE < uniqueIPs.length) {
        await this.delay(500);
      }
    }

    return {
      success: errors.length === 0 || results.length > 0,
      data: results,
      errors,
      metadata: {
        total_requested: uniqueIPs.length,
        cache_hits: totalCacheHits,
        cache_misses: totalCacheMisses,
        api_calls_made: totalApiCalls,
        providers_used: Array.from(allProvidersUsed),
        processing_time_ms: Date.now() - startTime,
      },
    };
  }

  /**
   * Get IP intelligence statistics
   */
  async getIPIntelligenceStats(): Promise<IPIntelligenceStats> {
    try {
      const { data, error } = await supabase.rpc('get_ip_cache_stats');
      
      if (error) {
        console.error('Error getting IP cache stats:', error);
        return {
          total_cached_ips: 0,
          active_cache_entries: 0,
          expired_entries: 0,
          cache_hit_rate: 0,
          most_common_countries: [],
          provider_usage: {},
        };
      }

      const stats = data[0]; // RPC returns array with single object
      return {
        total_cached_ips: stats?.total_cached_ips || 0,
        active_cache_entries: stats?.active_cache_entries || 0,
        expired_entries: stats?.expired_entries || 0,
        cache_hit_rate: stats?.cache_hit_rate || 0,
        most_common_countries: stats?.most_common_countries || [],
        provider_usage: stats?.provider_usage || {},
      };
    } catch (error) {
      console.error('Error in getIPIntelligenceStats:', error);
      return {
        total_cached_ips: 0,
        active_cache_entries: 0,
        expired_entries: 0,
        cache_hit_rate: 0,
        most_common_countries: [],
        provider_usage: {},
      };
    }
  }

  /**
   * Clear expired cache entries
   */
  async cleanupCache(): Promise<void> {
    try {
      await supabase.rpc('cleanup_expired_ip_cache');
    } catch (error) {
      console.error('Error cleaning up IP cache:', error);
    }
  }

  /**
   * Get cached IP data directly from database
   */
  async getCachedIPData(ip: string): Promise<IPIntelligenceData | null> {
    try {
      const { data, error } = await supabase
        .from('ip_intelligence_active')
        .select('*')
        .eq('ip_address', ip)
        .maybeSingle();

      if (error) {
        console.error('Error getting cached IP data:', error);
        return null;
      }

      if (!data) return null;

      return {
        ip_address: data.ip_address,
        country: data.country,
        country_code: data.country_code,
        region: data.region,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        isp: data.isp,
        organization: data.organization,
        as_number: data.as_number,
        as_organization: data.as_organization,
        threat_level: data.threat_level,
        is_vpn: data.is_vpn,
        is_proxy: data.is_proxy,
        is_tor: data.is_tor,
        is_hosting: data.is_hosting,
        provider: data.provider,
        provider_confidence: data.provider_confidence,
        cached: true,
        cache_age_hours: Math.round(data.hours_until_expiry ? (24 - data.hours_until_expiry) : 0),
      };
    } catch (error) {
      console.error('Error in getCachedIPData:', error);
      return null;
    }
  }

  private async fetchSingleIP(ip: string): Promise<IPIntelligenceData> {
    const response = await this.getIPIntelligenceBatch([ip]);
    
    if (response.data.length > 0) {
      return response.data[0];
    }

    if (response.errors.length > 0) {
      throw new Error(response.errors[0]);
    }

    // Fallback data
    return {
      ip_address: ip,
      threat_level: 'unknown',
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      is_hosting: false,
      provider: 'fallback',
      provider_confidence: 0.1,
      cached: false,
    };
  }

  private async callInternalAPI(ips: string[]): Promise<IPIntelligenceBatchResponse> {
    // Get current user session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('Authentication required for IP intelligence');
    }

    let lastError: Error | null = null;

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('ip-intelligence', {
          body: { ips },
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (error) {
          throw error;
        }

        return data as IPIntelligenceBatchResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`IP intelligence API attempt ${attempt} failed:`, lastError.message);

        // Don't retry on authentication errors
        if (lastError.message.includes('auth') || lastError.message.includes('401')) {
          throw lastError;
        }

        // Don't retry on rate limit errors
        if (lastError.message.includes('rate limit') || lastError.message.includes('429')) {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < RETRY_ATTEMPTS) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
          await this.delay(delay);
        }
      }
    }

    // All retries failed
    throw lastError || new Error('IP intelligence API failed after retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate IP address format
   */
  isValidIP(ip: string): boolean {
    // IPv4 regex
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 regex (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Filter valid IPs from an array
   */
  filterValidIPs(ips: string[]): string[] {
    return ips.filter(ip => this.isValidIP(ip));
  }

  /**
   * Get threat level color for UI display
   */
  getThreatLevelColor(threatLevel: string): string {
    switch (threatLevel) {
      case 'low': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'high': return 'text-orange-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  }

  /**
   * Get threat level badge variant for UI display
   */
  getThreatLevelVariant(threatLevel: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (threatLevel) {
      case 'low': return 'outline';
      case 'medium': return 'secondary';
      case 'high': return 'destructive';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  }

  /**
   * Format location string for display
   */
  formatLocation(data: IPIntelligenceData): string {
    const parts: string[] = [];
    
    if (data.city) parts.push(data.city);
    if (data.region && data.region !== data.city) parts.push(data.region);
    if (data.country && data.country !== 'Unknown') parts.push(data.country);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
  }

  /**
   * Format organization string for display
   */
  formatOrganization(data: IPIntelligenceData): string {
    if (data.organization) return data.organization;
    if (data.isp) return data.isp;
    if (data.as_organization) return data.as_organization;
    return 'Unknown Organization';
  }
}

// Export singleton instance
export const ipIntelligenceService = IPIntelligenceService.getInstance();

// Re-export for backward compatibility
export const getIPIntelligence = ipIntelligenceService.getIPIntelligence.bind(ipIntelligenceService);
export const getIPIntelligenceBatch = ipIntelligenceService.getIPIntelligenceBatch.bind(ipIntelligenceService);
export const getIPIntelligenceStats = ipIntelligenceService.getIPIntelligenceStats.bind(ipIntelligenceService);

// Legacy compatibility - create a simplified version of the old interface
export interface IPGeoLocation {
  country: string;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  lat?: number | null;
  lon?: number | null;
  isp?: string | null;
  org?: string | null;
}

export async function getIPLocation(ip: string): Promise<IPGeoLocation> {
  try {
    const data = await ipIntelligenceService.getIPIntelligence(ip);
    
    return {
      country: data.country || 'Unknown',
      countryCode: data.country_code,
      city: data.city,
      region: data.region,
      lat: data.latitude,
      lon: data.longitude,
      isp: data.isp,
      org: data.organization,
    };
  } catch (error) {
    console.error('Error getting IP location:', error);
    return {
      country: 'Unknown',
      countryCode: null,
      city: null,
      region: null,
      lat: null,
      lon: null,
      isp: null,
      org: null,
    };
  }
}