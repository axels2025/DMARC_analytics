import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rate limiting configuration
const RATE_LIMITS = {
  REQUESTS_PER_HOUR: 100,
  REQUESTS_PER_DAY: 500,
  MAX_IPS_PER_REQUEST: 20,
};

// Cache configuration
const CACHE_DURATION_HOURS = 24;
const CACHE_CLEANUP_PROBABILITY = 0.1; // 10% chance to trigger cleanup

// API Provider configurations
interface IPProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  parseResponse: (data: any, ip: string) => IPIntelligenceData;
}

const API_PROVIDERS: IPProvider[] = [
  {
    name: 'ipapi',
    baseUrl: 'http://ip-api.com/json',
    requestsPerMinute: 45, // Free tier limit
    requestsPerDay: 1000,
    parseResponse: (data: any, ip: string) => ({
      ip_address: ip,
      country: data.country || null,
      country_code: data.countryCode || null,
      region: data.regionName || null,
      city: data.city || null,
      latitude: data.lat || null,
      longitude: data.lon || null,
      timezone: data.timezone || null,
      isp: data.isp || null,
      organization: data.org || null,
      as_number: data.as ? parseInt(data.as.split(' ')[0].replace('AS', '')) : null,
      as_organization: data.as || null,
      threat_level: 'unknown',
      is_vpn: false,
      is_proxy: data.proxy || false,
      is_tor: false,
      is_hosting: data.hosting || false,
      provider: 'ip-api',
      provider_confidence: data.status === 'success' ? 1.0 : 0.5,
    }),
  },
  {
    name: 'ipinfo',
    baseUrl: 'https://ipinfo.io',
    apiKey: process.env.IPINFO_API_KEY,
    requestsPerMinute: 50,
    requestsPerDay: 50000,
    parseResponse: (data: any, ip: string) => {
      const [lat, lng] = data.loc ? data.loc.split(',').map(parseFloat) : [null, null];
      return {
        ip_address: ip,
        country: data.country || null,
        country_code: data.country || null,
        region: data.region || null,
        city: data.city || null,
        latitude: lat,
        longitude: lng,
        timezone: data.timezone || null,
        isp: data.org || null,
        organization: data.org || null,
        as_number: null,
        as_organization: data.org || null,
        threat_level: 'unknown',
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: data.org?.toLowerCase().includes('hosting') || false,
        provider: 'ipinfo',
        provider_confidence: 0.9,
      };
    },
  },
  {
    name: 'ipapi_co',
    baseUrl: 'https://ipapi.co',
    apiKey: process.env.IPAPI_CO_KEY,
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    parseResponse: (data: any, ip: string) => ({
      ip_address: ip,
      country: data.country_name || null,
      country_code: data.country_code || null,
      region: data.region || null,
      city: data.city || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      timezone: data.timezone || null,
      isp: data.isp || null,
      organization: data.org || null,
      as_number: data.asn ? parseInt(data.asn.replace('AS', '')) : null,
      as_organization: data.org || null,
      threat_level: 'unknown',
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      is_hosting: data.org?.toLowerCase().includes('hosting') || false,
      provider: 'ipapi.co',
      provider_confidence: 0.85,
    }),
  },
];

interface IPIntelligenceData {
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

interface APIResponse {
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

// Rate limiting tracking
const rateLimitTracker = new Map<string, { requests: number; resetTime: number }>();

class IPIntelligenceService {
  private providerUsage = new Map<string, { requests: number; lastRequest: number }>();

  async processIPBatch(ips: string[], userId: string): Promise<APIResponse> {
    const startTime = Date.now();
    const results: IPIntelligenceData[] = [];
    const errors: string[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;
    let apiCallsMade = 0;
    const providersUsed = new Set<string>();

    // Check rate limits
    const rateLimitCheck = await this.checkRateLimit(userId, ips.length);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        data: [],
        errors: [rateLimitCheck.message],
        metadata: {
          total_requested: ips.length,
          cache_hits: 0,
          cache_misses: 0,
          api_calls_made: 0,
          providers_used: [],
          processing_time_ms: Date.now() - startTime,
        },
      };
    }

    // Clean up expired cache entries occasionally
    if (Math.random() < CACHE_CLEANUP_PROBABILITY) {
      await this.cleanupExpiredCache();
    }

    // Process each IP
    for (const ip of ips) {
      try {
        if (!this.isValidIP(ip)) {
          errors.push(`Invalid IP address: ${ip}`);
          continue;
        }

        // Check cache first
        const cachedData = await this.getCachedIPData(ip);
        if (cachedData) {
          results.push({
            ...cachedData,
            cached: true,
            cache_age_hours: Math.round(
              (Date.now() - new Date(cachedData.cached_at).getTime()) / (1000 * 60 * 60)
            ),
          });
          cacheHits++;
          await this.updateCacheAccess(ip);
          continue;
        }

        // Cache miss - fetch from external API
        cacheMisses++;
        const ipData = await this.fetchIPIntelligence(ip, providersUsed);
        
        if (ipData) {
          // Save to cache
          await this.cacheIPData(ipData, userId);
          results.push({ ...ipData, cached: false, cache_age_hours: 0 });
          apiCallsMade++;
        } else {
          // Fallback data when all providers fail
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
            cache_age_hours: 0,
          });
          errors.push(`Failed to get intelligence for IP: ${ip}`);
        }

        // Add delay to respect rate limits
        await this.delay(100);
      } catch (error) {
        console.error(`Error processing IP ${ip}:`, error);
        errors.push(`Error processing IP ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Record usage statistics
    await this.recordUsageStats({
      userId,
      ipAddressesRequested: ips.length,
      cacheHits,
      cacheMisses,
      apiCallsMade,
      primaryProvider: Array.from(providersUsed)[0] || 'none',
      fallbackProviders: Array.from(providersUsed).slice(1),
      averageResponseTimeMs: Math.round((Date.now() - startTime) / ips.length),
      totalProcessingTimeMs: Date.now() - startTime,
    });

    return {
      success: errors.length < ips.length, // Success if we processed at least some IPs
      data: results,
      errors,
      metadata: {
        total_requested: ips.length,
        cache_hits: cacheHits,
        cache_misses: cacheMisses,
        api_calls_made: apiCallsMade,
        providers_used: Array.from(providersUsed),
        processing_time_ms: Date.now() - startTime,
      },
    };
  }

  private async checkRateLimit(userId: string, requestCount: number): Promise<{ allowed: boolean; message: string }> {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDate = now.toISOString().split('T')[0];

      // Get current usage for this hour and day
      const { data: usage } = await supabase
        .from('ip_intelligence_usage')
        .select('requests_this_hour, requests_this_day')
        .eq('user_id', userId)
        .eq('request_date', currentDate)
        .eq('request_hour', currentHour)
        .maybeSingle();

      const currentHourRequests = usage?.requests_this_hour || 0;
      const currentDayRequests = usage?.requests_this_day || 0;

      if (currentHourRequests + requestCount > RATE_LIMITS.REQUESTS_PER_HOUR) {
        return {
          allowed: false,
          message: `Rate limit exceeded: ${currentHourRequests}/${RATE_LIMITS.REQUESTS_PER_HOUR} requests this hour`,
        };
      }

      if (currentDayRequests + requestCount > RATE_LIMITS.REQUESTS_PER_DAY) {
        return {
          allowed: false,
          message: `Daily rate limit exceeded: ${currentDayRequests}/${RATE_LIMITS.REQUESTS_PER_DAY} requests today`,
        };
      }

      return { allowed: true, message: 'OK' };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      return { allowed: true, message: 'Rate limit check failed, allowing request' };
    }
  }

  private async getCachedIPData(ip: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('ip_intelligence_cache')
        .select('*')
        .eq('ip_address', ip)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error) {
        console.error('Error fetching cached IP data:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getCachedIPData:', error);
      return null;
    }
  }

  private async fetchIPIntelligence(ip: string, providersUsed: Set<string>): Promise<IPIntelligenceData | null> {
    for (const provider of API_PROVIDERS) {
      try {
        // Check provider rate limits
        if (!this.canUseProvider(provider.name)) {
          continue;
        }

        const url = `${provider.baseUrl}/${ip}${provider.apiKey ? `?token=${provider.apiKey}` : ''}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'DMARC-Analytics/1.0',
            ...(provider.apiKey && provider.name === 'ipinfo' ? { 'Authorization': `Bearer ${provider.apiKey}` } : {}),
          },
          timeout: 5000,
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited, try next provider
            this.updateProviderUsage(provider.name);
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Check for API-specific error indicators
        if (data.status === 'fail' || data.error) {
          continue;
        }

        providersUsed.add(provider.name);
        this.updateProviderUsage(provider.name);

        return provider.parseResponse(data, ip);
      } catch (error) {
        console.error(`Error fetching from ${provider.name}:`, error);
        continue;
      }
    }

    return null; // All providers failed
  }

  private canUseProvider(providerName: string): boolean {
    const usage = this.providerUsage.get(providerName);
    if (!usage) return true;

    const provider = API_PROVIDERS.find(p => p.name === providerName);
    if (!provider) return false;

    const now = Date.now();
    const timeSinceLastRequest = now - usage.lastRequest;
    const minInterval = (60 * 1000) / provider.requestsPerMinute; // Convert to milliseconds

    return timeSinceLastRequest >= minInterval;
  }

  private updateProviderUsage(providerName: string): void {
    const usage = this.providerUsage.get(providerName) || { requests: 0, lastRequest: 0 };
    usage.requests++;
    usage.lastRequest = Date.now();
    this.providerUsage.set(providerName, usage);
  }

  private async cacheIPData(data: IPIntelligenceData, userId: string): Promise<void> {
    try {
      const cacheData = {
        ...data,
        user_id: userId,
        expires_at: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000).toISOString(),
      };

      await supabase
        .from('ip_intelligence_cache')
        .upsert(cacheData, { onConflict: 'ip_address' });
    } catch (error) {
      console.error('Error caching IP data:', error);
    }
  }

  private async updateCacheAccess(ip: string): Promise<void> {
    try {
      await supabase.rpc('update_ip_cache_access', { target_ip: ip });
    } catch (error) {
      console.error('Error updating cache access:', error);
    }
  }

  private async recordUsageStats(stats: {
    userId: string;
    ipAddressesRequested: number;
    cacheHits: number;
    cacheMisses: number;
    apiCallsMade: number;
    primaryProvider: string;
    fallbackProviders: string[];
    averageResponseTimeMs: number;
    totalProcessingTimeMs: number;
  }): Promise<void> {
    try {
      const now = new Date();
      const usageData = {
        user_id: stats.userId,
        ip_addresses_requested: stats.ipAddressesRequested,
        cache_hits: stats.cacheHits,
        cache_misses: stats.cacheMisses,
        api_calls_made: stats.apiCallsMade,
        primary_provider: stats.primaryProvider,
        fallback_providers: stats.fallbackProviders,
        requests_this_hour: stats.ipAddressesRequested,
        requests_this_day: stats.ipAddressesRequested,
        average_response_time_ms: stats.averageResponseTimeMs,
        total_processing_time_ms: stats.totalProcessingTimeMs,
        request_date: now.toISOString().split('T')[0],
        request_hour: now.getHours(),
      };

      await supabase
        .from('ip_intelligence_usage')
        .upsert(usageData, { 
          onConflict: 'user_id,request_date,request_hour',
          ignoreDuplicates: false 
        });
    } catch (error) {
      console.error('Error recording usage stats:', error);
    }
  }

  private async cleanupExpiredCache(): Promise<void> {
    try {
      await supabase.rpc('cleanup_expired_ip_cache');
    } catch (error) {
      console.error('Error cleaning up expired cache:', error);
    }
  }

  private isValidIP(ip: string): boolean {
    // IPv4 regex
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 regex (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<APIResponse>) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      data: [],
      errors: ['Method not allowed. Use POST.'],
      metadata: {
        total_requested: 0,
        cache_hits: 0,
        cache_misses: 0,
        api_calls_made: 0,
        providers_used: [],
        processing_time_ms: 0,
      },
    });
  }

  try {
    // Get user ID from request (you may need to adjust this based on your auth setup)
    const userId = req.headers['user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        data: [],
        errors: ['User ID required'],
        metadata: {
          total_requested: 0,
          cache_hits: 0,
          cache_misses: 0,
          api_calls_made: 0,
          providers_used: [],
          processing_time_ms: 0,
        },
      });
    }

    const { ips } = req.body;

    // Validate input
    if (!ips || !Array.isArray(ips)) {
      return res.status(400).json({
        success: false,
        data: [],
        errors: ['Invalid input. Expected array of IP addresses.'],
        metadata: {
          total_requested: 0,
          cache_hits: 0,
          cache_misses: 0,
          api_calls_made: 0,
          providers_used: [],
          processing_time_ms: 0,
        },
      });
    }

    if (ips.length === 0) {
      return res.status(400).json({
        success: false,
        data: [],
        errors: ['No IP addresses provided'],
        metadata: {
          total_requested: 0,
          cache_hits: 0,
          cache_misses: 0,
          api_calls_made: 0,
          providers_used: [],
          processing_time_ms: 0,
        },
      });
    }

    if (ips.length > RATE_LIMITS.MAX_IPS_PER_REQUEST) {
      return res.status(400).json({
        success: false,
        data: [],
        errors: [`Too many IP addresses. Maximum ${RATE_LIMITS.MAX_IPS_PER_REQUEST} per request.`],
        metadata: {
          total_requested: ips.length,
          cache_hits: 0,
          cache_misses: 0,
          api_calls_made: 0,
          providers_used: [],
          processing_time_ms: 0,
        },
      });
    }

    // Process the IPs
    const service = new IPIntelligenceService();
    const result = await service.processIPBatch(ips, userId);

    // Set appropriate status code
    const statusCode = result.success ? 200 : 207; // 207 Multi-Status for partial success

    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('Error in IP intelligence API:', error);
    return res.status(500).json({
      success: false,
      data: [],
      errors: ['Internal server error'],
      metadata: {
        total_requested: 0,
        cache_hits: 0,
        cache_misses: 0,
        api_calls_made: 0,
        providers_used: [],
        processing_time_ms: 0,
      },
    });
  }
}