// IP Provider Detection Utility
// Detects email service providers based on IP addresses

interface IPRange {
  start: string;
  end: string;
  provider: string;
}

interface IPMapping {
  [key: string]: string;
}

// Enhanced cache for IP provider lookups with persistence
interface CacheEntry {
  provider: string;
  hostname?: string;
  timestamp: number;
  source: 'ip_range' | 'dns_lookup';
}

const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY = 'dmarc_ip_provider_cache';

class IPProviderCache {
  private cache = new Map<string, CacheEntry>();
  private loadPromise: Promise<void> | null = null;

  constructor() {
    this.loadFromStorage();
  }

  public async loadFromStorage(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    
    this.loadPromise = (async () => {
      try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          const now = Date.now();
          
          for (const [ip, entry] of Object.entries(data)) {
            const cacheEntry = entry as CacheEntry;
            if (now - cacheEntry.timestamp < CACHE_EXPIRY_MS) {
              this.cache.set(ip, cacheEntry);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load IP provider cache from storage:', error);
      }
    })();
    
    return this.loadPromise;
  }

  private saveToStorage(): void {
    try {
      const data: Record<string, CacheEntry> = {};
      for (const [ip, entry] of this.cache.entries()) {
        data[ip] = entry;
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save IP provider cache to storage:', error);
    }
  }

  async get(ip: string): Promise<CacheEntry | null> {
    await this.loadFromStorage();
    
    const entry = this.cache.get(ip);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > CACHE_EXPIRY_MS) {
      this.cache.delete(ip);
      this.saveToStorage();
      return null;
    }
    
    return entry;
  }

  set(ip: string, provider: string, hostname?: string, source: 'ip_range' | 'dns_lookup' = 'ip_range'): void {
    const entry: CacheEntry = {
      provider,
      hostname,
      timestamp: Date.now(),
      source
    };
    
    this.cache.set(ip, entry);
    this.saveToStorage();
  }

  clear(): void {
    this.cache.clear();
    localStorage.removeItem(CACHE_KEY);
  }

  size(): number {
    return this.cache.size;
  }
}

const providerCache = new IPProviderCache();

// Common email provider IP ranges (IPv4)
const IP_RANGES: IPRange[] = [
  // Google/Gmail
  { start: "74.125.0.0", end: "74.125.255.255", provider: "Google (Gmail)" },
  { start: "209.85.128.0", end: "209.85.255.255", provider: "Google (Gmail)" },
  { start: "173.194.0.0", end: "173.194.255.255", provider: "Google (Gmail)" },
  { start: "108.177.0.0", end: "108.177.255.255", provider: "Google (Gmail)" },
  { start: "172.217.0.0", end: "172.217.255.255", provider: "Google (Gmail)" },
  { start: "216.58.192.0", end: "216.58.255.255", provider: "Google (Gmail)" },
  
  // Microsoft/Outlook
  { start: "40.92.0.0", end: "40.127.255.255", provider: "Microsoft (Outlook)" },
  { start: "52.96.0.0", end: "52.127.255.255", provider: "Microsoft (Outlook)" },
  { start: "104.47.0.0", end: "104.47.255.255", provider: "Microsoft (Outlook)" },
  { start: "157.55.0.0", end: "157.56.255.255", provider: "Microsoft (Outlook)" },
  { start: "207.46.0.0", end: "207.46.255.255", provider: "Microsoft (Outlook)" },
  
  // Yahoo
  { start: "66.196.0.0", end: "66.196.255.255", provider: "Yahoo Mail" },
  { start: "67.195.0.0", end: "67.195.255.255", provider: "Yahoo Mail" },
  { start: "68.180.0.0", end: "68.180.255.255", provider: "Yahoo Mail" },
  { start: "69.147.64.0", end: "69.147.127.255", provider: "Yahoo Mail" },
  { start: "98.136.0.0", end: "98.139.255.255", provider: "Yahoo Mail" },
  
  // Amazon SES
  { start: "54.240.0.0", end: "54.240.255.255", provider: "Amazon SES" },
  { start: "23.249.208.0", end: "23.249.223.255", provider: "Amazon SES" },
  
  // SendGrid
  { start: "167.89.0.0", end: "167.89.255.255", provider: "SendGrid" },
  { start: "169.45.0.0", end: "169.45.255.255", provider: "SendGrid" },
  
  // Mailgun
  { start: "69.72.32.0", end: "69.72.47.255", provider: "Mailgun" },
  { start: "104.130.122.0", end: "104.130.122.255", provider: "Mailgun" },
];

// IPv6 prefix mappings for major providers
const IPV6_MAPPINGS: IPMapping = {
  // Google IPv6 ranges
  "2001:4860": "Google (Gmail)",
  "2404:6800": "Google (Gmail)",
  "2607:f8b0": "Google (Gmail)",
  "2800:3f0": "Google (Gmail)",
  "2a00:1450": "Google (Gmail)",
  "2c0f:fb50": "Google (Gmail)",
  
  // Microsoft IPv6 ranges
  "2603:1000": "Microsoft (Outlook)",
  "2603:1010": "Microsoft (Outlook)",
  "2603:1020": "Microsoft (Outlook)",
  "2603:1030": "Microsoft (Outlook)",
  "2603:1040": "Microsoft (Outlook)",
  "2603:1050": "Microsoft (Outlook)",
  
  // Yahoo IPv6 ranges
  "2001:4998": "Yahoo Mail",
  "2406:2000": "Yahoo Mail",
};

/**
 * Converts IPv4 address to a numeric value for range comparison
 */
function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
}

/**
 * Checks if an IPv4 address falls within a given range
 */
function isInRange(ip: string, range: IPRange): boolean {
  const ipNum = ipToNumber(ip);
  const startNum = ipToNumber(range.start);
  const endNum = ipToNumber(range.end);
  return ipNum >= startNum && ipNum <= endNum;
}

/**
 * Detects provider from IPv4 address using IP ranges
 */
function detectIPv4Provider(ip: string): string | null {
  for (const range of IP_RANGES) {
    if (isInRange(ip, range)) {
      return range.provider;
    }
  }
  return null;
}

/**
 * Detects provider from IPv6 address using prefix matching
 */
function detectIPv6Provider(ip: string): string | null {
  // Normalize IPv6 address and check prefixes
  const normalizedIP = ip.toLowerCase();
  
  for (const [prefix, provider] of Object.entries(IPV6_MAPPINGS)) {
    if (normalizedIP.startsWith(prefix.toLowerCase())) {
      return provider;
    }
  }
  return null;
}

/**
 * Determines if an IP address is IPv6
 */
function isIPv6(ip: string): boolean {
  return ip.includes(':');
}

/**
 * Determines if an IP address is IPv4
 */
function isIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * Interface for DNS lookup response
 */
interface DNSLookupResponse {
  success: boolean;
  hostname?: string;
  provider?: string;
  error?: string;
}

/**
 * Attempts to get provider name from reverse DNS lookup via Supabase Edge Function
 */
async function getProviderFromReverseDNS(ip: string): Promise<{ provider: string | null; hostname: string | null }> {
  try {
    // Use hardcoded Supabase configuration (Lovable platform approach)
    const supabaseUrl = "https://epzcwplbouhbucbmhcur.supabase.co";
    const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwemN3cGxib3VoYnVjYm1oY3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTk5NDIsImV4cCI6MjA2ODI5NTk0Mn0.l54eLAp-3kwOHvF3qTVMDVTorYGzGeMmju1YsIFFUeU";

    const dnsLookupUrl = `${supabaseUrl}/functions/v1/dns-lookup`;
    
    console.log(`🔍 DNS Lookup: Attempting reverse DNS for IP ${ip}`);
    console.log(`🔗 DNS Lookup URL: ${dnsLookupUrl}`);
    
    const response = await fetch(dnsLookupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ ip }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`🚫 DNS lookup rate limit exceeded for ${ip}`);
        return { provider: null, hostname: null };
      }
      console.error(`❌ DNS lookup failed for ${ip}: ${response.status} ${response.statusText}`);
      throw new Error(`DNS lookup failed: ${response.status}`);
    }

    const data: DNSLookupResponse = await response.json();
    console.log(`📋 DNS lookup response for ${ip}:`, data);
    
    if (!data.success) {
      console.warn(`⚠️ DNS lookup failed for ${ip}: ${data.error}`);
      return { provider: null, hostname: null };
    }

    console.log(`✅ DNS lookup successful for ${ip}: hostname=${data.hostname}, provider=${data.provider}`);
    return {
      provider: data.provider || null,
      hostname: data.hostname || null,
    };

  } catch (error) {
    console.error(`💥 Reverse DNS lookup failed for ${ip}:`, error);
    return { provider: null, hostname: null };
  }
}

/**
 * Extracts provider name from hostname with enhanced pattern matching
 */
function extractProviderFromHostname(hostname: string): string | null {
  const lowerHost = hostname.toLowerCase();
  
  // More comprehensive provider patterns
  const patterns = [
    // Cloud providers
    { pattern: /amazonaws\.com|aws\.amazon\.com|ec2.*\.amazonaws\.com/, provider: "Amazon AWS" },
    { pattern: /googleusercontent\.com|google\.com|googleapis\.com|gcp\./, provider: "Google Cloud" },
    { pattern: /azure.*\.microsoft\.com|outlook\.com|hotmail\.com|live\.com/, provider: "Microsoft Azure/Outlook" },
    { pattern: /digitalocean\.com/, provider: "DigitalOcean" },
    { pattern: /linode\.com/, provider: "Linode" },
    { pattern: /vultr\.com/, provider: "Vultr" },
    { pattern: /hetzner\.com|hetzner\.de/, provider: "Hetzner" },
    
    // Email service providers
    { pattern: /sendgrid\.net|sendgrid\.com/, provider: "SendGrid" },
    { pattern: /mailgun\.org|mailgun\.com/, provider: "Mailgun" },
    { pattern: /mandrill\.com|mandrillapp\.com/, provider: "Mailchimp Mandrill" },
    { pattern: /mailchimp\.com/, provider: "Mailchimp" },
    { pattern: /constantcontact\.com/, provider: "Constant Contact" },
    { pattern: /salesforce\.com|pardot\.com|marketingcloud\.com/, provider: "Salesforce Marketing Cloud" },
    { pattern: /zendesk\.com/, provider: "Zendesk" },
    { pattern: /hubspot\.com/, provider: "HubSpot" },
    { pattern: /campaignmonitor\.com/, provider: "Campaign Monitor" },
    { pattern: /aweber\.com/, provider: "AWeber" },
    { pattern: /getresponse\.com/, provider: "GetResponse" },
    { pattern: /mailerlite\.com/, provider: "MailerLite" },
    { pattern: /convertkit\.com/, provider: "ConvertKit" },
    
    // Traditional email providers
    { pattern: /gmail\.com|googlemail\.com/, provider: "Google (Gmail)" },
    { pattern: /yahoo\.com|ymail\.com/, provider: "Yahoo Mail" },
    { pattern: /aol\.com/, provider: "AOL Mail" },
    { pattern: /protonmail\.com|proton\.me/, provider: "ProtonMail" },
    { pattern: /tutanota\.com/, provider: "Tutanota" },
    
    // CDN and hosting providers
    { pattern: /cloudflare\.com|cf-.*\.net/, provider: "Cloudflare" },
    { pattern: /fastly\.com/, provider: "Fastly" },
    { pattern: /cloudfront\.net/, provider: "Amazon CloudFront" },
    { pattern: /akamai.*\.net/, provider: "Akamai" },
    { pattern: /netlify\.com/, provider: "Netlify" },
    { pattern: /vercel\.com/, provider: "Vercel" },
    
    // ISPs and general hosting
    { pattern: /comcast\.net/, provider: "Comcast" },
    { pattern: /verizon\.net/, provider: "Verizon" },
    { pattern: /att\.net/, provider: "AT&T" },
    { pattern: /charter\.com|spectrum\.com/, provider: "Charter/Spectrum" },
    { pattern: /cox\.net/, provider: "Cox Communications" },
    { pattern: /godaddy\.com/, provider: "GoDaddy" },
    { pattern: /bluehost\.com/, provider: "Bluehost" },
    { pattern: /hostgator\.com/, provider: "HostGator" },
    { pattern: /siteground\.com/, provider: "SiteGround" },
  ];
  
  for (const { pattern, provider } of patterns) {
    if (pattern.test(lowerHost)) {
      return provider;
    }
  }
  
  // Try to extract provider from domain structure
  const parts = lowerHost.split('.');
  if (parts.length >= 2) {
    const domain = parts[parts.length - 2];
    
    // Common hosting/service patterns
    if (domain.includes('mail') || domain.includes('smtp') || domain.includes('mx')) {
      return `${domain.charAt(0).toUpperCase() + domain.slice(1)} Email Service`;
    }
    
    if (domain.includes('cloud') || domain.includes('server') || domain.includes('host')) {
      return `${domain.charAt(0).toUpperCase() + domain.slice(1)} Hosting`;
    }
  }
  
  return null;
}

/**
 * Main function to detect email service provider from IP address
 */
export async function detectIPProvider(ip: string): Promise<string> {
  console.log(`🕵️ Detecting provider for IP: ${ip}`);
  
  // Check cache first
  const cachedEntry = await providerCache.get(ip);
  if (cachedEntry) {
    console.log(`💾 Cache hit for ${ip}: ${cachedEntry.provider} (source: ${cachedEntry.source})`);
    return cachedEntry.provider;
  }
  
  console.log(`🔍 No cache entry for ${ip}, performing detection...`);
  
  let provider: string | null = null;
  let hostname: string | null = null;
  let source: 'ip_range' | 'dns_lookup' = 'ip_range';
  
  try {
    // Validate IP address format
    if (!isIPv4(ip) && !isIPv6(ip)) {
      console.warn(`❌ Invalid IP address format: ${ip}`);
      provider = "Invalid IP Address";
    } else if (isIPv4(ip)) {
      // Try IPv4 range detection first
      console.log(`🌐 Checking IPv4 ranges for ${ip}`);
      provider = detectIPv4Provider(ip);
      if (provider) {
        console.log(`✅ IPv4 range match: ${provider}`);
      }
    } else if (isIPv6(ip)) {
      // Try IPv6 prefix detection
      console.log(`🌐 Checking IPv6 prefixes for ${ip}`);
      provider = detectIPv6Provider(ip);
      if (provider) {
        console.log(`✅ IPv6 prefix match: ${provider}`);
      }
    }
    
    // If no provider found through IP ranges, try reverse DNS
    if (!provider) {
      console.log(`🔍 No IP range match for ${ip}, attempting DNS lookup...`);
      const dnsResult = await getProviderFromReverseDNS(ip);
      provider = dnsResult.provider;
      hostname = dnsResult.hostname;
      source = 'dns_lookup';
      
      // If DNS lookup provided hostname but no provider, try to extract provider
      if (!provider && hostname) {
        console.log(`🔧 Extracting provider from hostname: ${hostname}`);
        provider = extractProviderFromHostname(hostname);
        if (provider) {
          console.log(`✅ Extracted provider from hostname: ${provider}`);
        }
      }
    }
    
    // Final fallback
    if (!provider) {
      console.log(`❓ No provider detected for ${ip}, marking as Unknown Provider`);
      provider = "Unknown Provider";
    }
    
  } catch (error) {
    console.error(`💥 Error detecting provider for IP ${ip}:`, error);
    provider = "Unknown Provider";
  }
  
  // Cache the result
  console.log(`💾 Caching result for ${ip}: ${provider} (source: ${source})`);
  providerCache.set(ip, provider, hostname || undefined, source);
  
  return provider;
}

/**
 * Batch detect providers for multiple IPs
 */
export async function detectIPProviders(ips: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Process IPs in parallel but limit concurrency
  const promises = ips.map(async (ip) => {
    const provider = await detectIPProvider(ip);
    results.set(ip, provider);
  });
  
  await Promise.all(promises);
  
  return results;
}

/**
 * Clear the provider cache
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

/**
 * Get cache size for monitoring
 */
export function getProviderCacheSize(): number {
  return providerCache.size();
}

/**
 * Get cache statistics for debugging and monitoring
 */
export async function getProviderCacheStats(): Promise<{
  size: number;
  ipRangeEntries: number;
  dnsLookupEntries: number;
  oldestEntry?: number;
  newestEntry?: number;
}> {
  await providerCache.loadFromStorage();
  
  // Access private cache for stats (not ideal but needed for monitoring)
  const cacheInstance = providerCache as unknown as { cache: Map<string, CacheEntry> };
  const entries = Array.from(cacheInstance.cache.values());
  const ipRangeEntries = entries.filter(e => e.source === 'ip_range').length;
  const dnsLookupEntries = entries.filter(e => e.source === 'dns_lookup').length;
  
  const timestamps = entries.map(e => e.timestamp);
  const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : undefined;
  const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : undefined;
  
  return {
    size: entries.length,
    ipRangeEntries,
    dnsLookupEntries,
    oldestEntry,
    newestEntry,
  };
}

/**
 * Debug function to test DNS lookup functionality
 */
export async function testDNSLookup(ip: string): Promise<void> {
  console.log(`🧪 Testing DNS lookup for IP: ${ip}`);
  
  // Clear cache for this IP to force DNS lookup
  const cacheInstance = providerCache as unknown as { cache: Map<string, CacheEntry> };
  cacheInstance.cache.delete(ip);
  
  const result = await detectIPProvider(ip);
  console.log(`🔬 Test result: ${result}`);
  
  // Show cache stats
  const stats = await getProviderCacheStats();
  console.log(`📊 Cache stats after test:`, stats);
}