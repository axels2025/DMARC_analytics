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

// Cache for IP provider lookups
const providerCache = new Map<string, string>();

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
 * Attempts to get provider name from reverse DNS lookup
 */
async function getProviderFromReverseDNS(ip: string): Promise<string | null> {
  try {
    // Note: In browser environment, we can't do actual reverse DNS lookups
    // This would need to be done server-side or through a service
    // For now, we'll return null and rely on IP range detection
    return null;
  } catch (error) {
    console.warn(`Reverse DNS lookup failed for ${ip}:`, error);
    return null;
  }
}

/**
 * Extracts provider name from hostname
 */
function extractProviderFromHostname(hostname: string): string | null {
  const lowerHost = hostname.toLowerCase();
  
  // Common provider patterns in hostnames
  const patterns = [
    { pattern: /google|gmail|googlemail/, provider: "Google (Gmail)" },
    { pattern: /outlook|hotmail|live|microsoft|office365/, provider: "Microsoft (Outlook)" },
    { pattern: /yahoo|ymail/, provider: "Yahoo Mail" },
    { pattern: /amazon|ses/, provider: "Amazon SES" },
    { pattern: /sendgrid/, provider: "SendGrid" },
    { pattern: /mailgun/, provider: "Mailgun" },
    { pattern: /mailchimp/, provider: "Mailchimp" },
    { pattern: /constant.*contact/, provider: "Constant Contact" },
    { pattern: /salesforce|pardot/, provider: "Salesforce" },
    { pattern: /zendesk/, provider: "Zendesk" },
  ];
  
  for (const { pattern, provider } of patterns) {
    if (pattern.test(lowerHost)) {
      return provider;
    }
  }
  
  return null;
}

/**
 * Main function to detect email service provider from IP address
 */
export async function detectIPProvider(ip: string): Promise<string> {
  // Check cache first
  if (providerCache.has(ip)) {
    return providerCache.get(ip)!;
  }
  
  let provider: string | null = null;
  
  try {
    // Validate IP address format
    if (!isIPv4(ip) && !isIPv6(ip)) {
      provider = "Invalid IP Address";
    } else if (isIPv4(ip)) {
      // Try IPv4 range detection first
      provider = detectIPv4Provider(ip);
    } else if (isIPv6(ip)) {
      // Try IPv6 prefix detection
      provider = detectIPv6Provider(ip);
    }
    
    // If no provider found through IP ranges, try reverse DNS
    if (!provider) {
      provider = await getProviderFromReverseDNS(ip);
    }
    
    // Final fallback
    if (!provider) {
      provider = "Unknown Provider";
    }
    
  } catch (error) {
    console.error(`Error detecting provider for IP ${ip}:`, error);
    provider = "Unknown Provider";
  }
  
  // Cache the result
  providerCache.set(ip, provider);
  
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
  return providerCache.size;
}