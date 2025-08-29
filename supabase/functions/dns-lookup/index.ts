import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

interface DNSLookupRequest {
  ip?: string;
  domain?: string;
  recordType?: 'TXT' | 'A' | 'MX' | 'PTR';
  
  // New fields for SPF flattening
  spfFlatten?: {
    domains: string[];
    recursive: boolean;
    maxDepth: number;
  };
}

interface DNSLookupResponse {
  success: boolean;
  hostname?: string;
  provider?: string;
  records?: string[];
  recordType?: string;
  
  // SPF flattening response fields
  spfFlattening?: {
    resolvedDomains: Map<string, {
      ips: string[];
      nestedIncludes: string[];
      errors: string[];
    }>;
    totalIPs: number;
    errors: string[];
  };
  
  error?: string;
}

// Rate limiting storage (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 100; // requests per window
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// Helper function to check rate limit
function checkRateLimit(clientIP: string): boolean {
  const now = Date.now();
  const key = clientIP;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const rateLimitData = rateLimitMap.get(key)!;
  
  if (now > rateLimitData.resetTime) {
    // Reset the counter
    rateLimitData.count = 1;
    rateLimitData.resetTime = now + RATE_LIMIT_WINDOW;
    return true;
  }
  
  if (rateLimitData.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }
  
  rateLimitData.count++;
  return true;
}

// Enhanced provider extraction from hostname
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
    { pattern: /gmail\.com|google\.com/, provider: "Google (Gmail)" },
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

// Perform reverse DNS lookup for both IPv4 and IPv6
async function performReverseDNS(ip: string): Promise<string | null> {
  try {
    let dohUrl: string;
    
    // Check if it's IPv6 or IPv4
    if (ip.includes(':')) {
      // IPv6 - convert to reverse format
      const expandedIPv6 = expandIPv6(ip);
      const reversedIPv6 = expandedIPv6.replace(/:/g, '').split('').reverse().join('.');
      dohUrl = `https://cloudflare-dns.com/dns-query?name=${reversedIPv6}.ip6.arpa&type=PTR`;
      console.log(`IPv6 reverse DNS query for ${ip}: ${reversedIPv6}.ip6.arpa`);
    } else {
      // IPv4 - original logic
      const reversedIPv4 = ip.split('.').reverse().join('.');
      dohUrl = `https://cloudflare-dns.com/dns-query?name=${reversedIPv4}.in-addr.arpa&type=PTR`;
      console.log(`IPv4 reverse DNS query for ${ip}: ${reversedIPv4}.in-addr.arpa`);
    }
    
    const response = await fetch(dohUrl, {
      headers: {
        'Accept': 'application/dns-json',
      },
    });
    
    if (!response.ok) {
      console.warn(`DNS query failed: ${response.status} for IP ${ip}`);
      throw new Error(`DNS query failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`DNS response for ${ip}:`, data);
    
    if (data.Answer && data.Answer.length > 0) {
      // Extract hostname from PTR response
      const hostname = data.Answer[0].data;
      const cleanHostname = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
      console.log(`Resolved ${ip} to hostname: ${cleanHostname}`);
      return cleanHostname;
    }
    
    console.log(`No PTR record found for ${ip}`);
    return null;
  } catch (error) {
    console.warn(`Reverse DNS lookup failed for ${ip}:`, error);
    return null;
  }
}

// Helper function to expand IPv6 addresses
function expandIPv6(ip: string): string {
  // Handle :: shorthand and ensure full representation
  const parts = ip.split('::');
  if (parts.length === 2) {
    const left = parts[0].split(':').filter(p => p !== '');
    const right = parts[1].split(':').filter(p => p !== '');
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill('0000');
    return [...left, ...middle, ...right]
      .map(part => part.padStart(4, '0'))
      .join(':');
  }
  
  // Already expanded or no shorthand
  return ip.split(':').map(part => part.padStart(4, '0')).join(':');
}

// DNS lookup functions for SPF analysis
async function performDNSLookup(domain: string, recordType: 'TXT' | 'A' | 'MX'): Promise<string[]> {
  try {
    let dohUrl: string;
    
    switch (recordType) {
      case 'TXT':
        dohUrl = `https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`;
        break;
      case 'A':
        dohUrl = `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`;
        break;
      case 'MX':
        dohUrl = `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`;
        break;
      default:
        throw new Error(`Unsupported record type: ${recordType}`);
    }
    
    console.log(`${recordType} DNS query for ${domain}: ${dohUrl}`);
    
    const response = await fetch(dohUrl, {
      headers: {
        'Accept': 'application/dns-json',
      },
    });
    
    if (!response.ok) {
      console.warn(`DNS query failed: ${response.status} for ${domain} (${recordType})`);
      throw new Error(`DNS query failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`DNS response for ${domain} (${recordType}):`, data);
    
    if (data.Answer && data.Answer.length > 0) {
      const records = data.Answer.map((answer: any) => {
        let record = answer.data;
        
        // Clean up record based on type
        switch (recordType) {
          case 'TXT':
            // Remove quotes from TXT records
            record = record.replace(/^"(.*)"$/, '$1');
            break;
          case 'A':
            // A records should be IP addresses already
            break;
          case 'MX':
            // MX records are already in "priority hostname" format
            break;
        }
        
        return record;
      });
      
      console.log(`Resolved ${domain} (${recordType}) to:`, records);
      return records;
    }
    
    console.log(`No ${recordType} records found for ${domain}`);
    return [];
  } catch (error) {
    console.warn(`${recordType} DNS lookup failed for ${domain}:`, error);
    throw error;
  }
}

// Domain validation for SPF lookups
function validateDomain(domain: string): boolean {
  if (!domain) return false;
  
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  return domainRegex.test(domain) && domain.length <= 253;
}

// SPF Flattening Functions
async function performSPFFlattening(
  domains: string[],
  recursive: boolean,
  maxDepth: number
): Promise<{
  resolvedDomains: Record<string, {
    ips: string[];
    nestedIncludes: string[];
    errors: string[];
  }>;
  totalIPs: number;
  errors: string[];
}> {
  const result = {
    resolvedDomains: {} as Record<string, {
      ips: string[];
      nestedIncludes: string[];
      errors: string[];
    }>,
    totalIPs: 0,
    errors: []
  };

  const visited = new Set<string>();

  for (const domain of domains) {
    try {
      const resolution = await resolveSPFDomain(domain, visited, recursive, maxDepth, 0);
      result.resolvedDomains[domain] = resolution;
      result.totalIPs += resolution.ips.length;
    } catch (error) {
      result.errors.push(`Failed to resolve ${domain}: ${error}`);
      result.resolvedDomains[domain] = {
        ips: [],
        nestedIncludes: [],
        errors: [`Resolution failed: ${error}`]
      };
    }
  }

  return result;
}

async function resolveSPFDomain(
  domain: string,
  visited: Set<string>,
  recursive: boolean,
  maxDepth: number,
  currentDepth: number
): Promise<{
  ips: string[];
  nestedIncludes: string[];
  errors: string[];
}> {
  const resolution = {
    ips: [] as string[],
    nestedIncludes: [] as string[],
    errors: [] as string[]
  };

  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    resolution.errors.push(`Maximum recursion depth (${maxDepth}) reached for ${domain}`);
    return resolution;
  }

  // Cycle detection
  if (visited.has(domain)) {
    resolution.errors.push(`Circular dependency detected: ${domain}`);
    return resolution;
  }

  visited.add(domain);

  try {
    // Get TXT records for the domain
    const txtRecords = await performDNSLookup(domain, 'TXT');
    const spfRecord = txtRecords.find(record => record.startsWith('v=spf1'));
    
    if (!spfRecord) {
      resolution.errors.push(`No SPF record found for ${domain}`);
      return resolution;
    }

    // Parse SPF record mechanisms
    const mechanisms = parseSPFMechanisms(spfRecord);

    for (const mechanism of mechanisms) {
      try {
        switch (mechanism.type) {
          case 'ip4':
          case 'ip6':
            resolution.ips.push(mechanism.value);
            break;

          case 'include':
            resolution.nestedIncludes.push(mechanism.value);
            if (recursive && currentDepth < maxDepth) {
              const nestedResolution = await resolveSPFDomain(
                mechanism.value, 
                visited, 
                recursive, 
                maxDepth, 
                currentDepth + 1
              );
              resolution.ips.push(...nestedResolution.ips);
              resolution.nestedIncludes.push(...nestedResolution.nestedIncludes);
              resolution.errors.push(...nestedResolution.errors);
            }
            break;

          case 'a':
            const aDomain = mechanism.value || domain;
            const aRecords = await performDNSLookup(aDomain, 'A');
            resolution.ips.push(...aRecords);
            break;

          case 'mx':
            const mxDomain = mechanism.value || domain;
            const mxRecords = await performDNSLookup(mxDomain, 'MX');
            for (const mxRecord of mxRecords) {
              const parts = mxRecord.split(' ');
              const mxHostname = parts.length > 1 ? parts[1] : parts[0];
              try {
                const mxARecords = await performDNSLookup(mxHostname, 'A');
                resolution.ips.push(...mxARecords);
              } catch (error) {
                resolution.errors.push(`Failed to resolve MX hostname ${mxHostname}: ${error}`);
              }
            }
            break;

          // Skip other mechanism types for flattening
          default:
            break;
        }
      } catch (error) {
        resolution.errors.push(`Failed to resolve mechanism ${mechanism.type}:${mechanism.value}: ${error}`);
      }
    }

  } catch (error) {
    resolution.errors.push(`SPF resolution failed for ${domain}: ${error}`);
  } finally {
    visited.delete(domain);
  }

  return resolution;
}

function parseSPFMechanisms(spfRecord: string): Array<{
  type: string;
  value: string;
  qualifier: string;
}> {
  const mechanisms: Array<{
    type: string;
    value: string;
    qualifier: string;
  }> = [];

  const parts = spfRecord.split(' ');
  
  for (let i = 1; i < parts.length; i++) { // Skip v=spf1
    const part = parts[i].trim();
    if (!part) continue;

    let qualifier = '+';
    let mechanism = part;

    // Extract qualifier
    if (['+', '-', '~', '?'].includes(part[0])) {
      qualifier = part[0];
      mechanism = part.substring(1);
    }

    // Parse mechanism type and value
    if (mechanism === 'all') {
      mechanisms.push({ type: 'all', value: '', qualifier });
    } else if (mechanism.includes(':')) {
      const [type, value] = mechanism.split(':', 2);
      mechanisms.push({ type, value, qualifier });
    } else if (mechanism.includes('=')) {
      // Skip modifiers for now
      continue;
    } else {
      // Mechanisms without values (like 'a' or 'mx')
      mechanisms.push({ type: mechanism, value: '', qualifier });
    }
  }

  return mechanisms;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Rate limit exceeded. Please try again later.' 
        }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { ip, domain, recordType, spfFlatten }: DNSLookupRequest = await req.json();
    
    // Handle SPF flattening requests (new functionality)
    if (spfFlatten) {
      try {
        const flatteningResult = await performSPFFlattening(
          spfFlatten.domains,
          spfFlatten.recursive,
          spfFlatten.maxDepth || 3
        );

        const response: DNSLookupResponse = {
          success: true,
          spfFlattening: {
            resolvedDomains: new Map(Object.entries(flatteningResult.resolvedDomains)),
            totalIPs: flatteningResult.totalIPs,
            errors: flatteningResult.errors
          }
        };

        return new Response(
          JSON.stringify(response, (key, value) => {
            if (value instanceof Map) {
              return Object.fromEntries(value);
            }
            return value;
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } catch (error) {
        console.error('SPF flattening error:', error);
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `SPF flattening failed: ${error}` 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // Handle domain DNS lookups (new functionality for SPF analysis)
    if (domain && recordType) {
      if (!validateDomain(domain)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid domain format' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      if (!['TXT', 'A', 'MX'].includes(recordType)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unsupported record type. Supported: TXT, A, MX' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      try {
        const records = await performDNSLookup(domain, recordType as 'TXT' | 'A' | 'MX');
        
        const response: DNSLookupResponse = {
          success: true,
          records,
          recordType,
        };

        return new Response(
          JSON.stringify(response),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } catch (error) {
        console.error(`Domain DNS lookup error for ${domain} (${recordType}):`, error);
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `DNS lookup failed for ${domain}`,
            recordType
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // Handle IP reverse lookups (existing functionality)
    if (!ip) {
      return new Response(
        JSON.stringify({ success: false, error: 'Either IP address or domain with recordType is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate IP address format (more flexible IPv6 validation)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]*:){2,7}[0-9a-fA-F]*$/; // Allow :: shorthand
    
    const isValidIPv4 = ipv4Regex.test(ip);
    const isValidIPv6 = ip.includes(':') && (ipv6Regex.test(ip) || ip.includes('::'));
    
    if (!isValidIPv4 && !isValidIPv6) {
      console.warn(`Invalid IP address format: ${ip}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid IP address format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log(`Valid IP address received: ${ip} (IPv${isValidIPv4 ? '4' : '6'})`)

    // Perform reverse DNS lookup
    const hostname = await performReverseDNS(ip);
    
    let provider = null;
    if (hostname) {
      provider = extractProviderFromHostname(hostname);
    }

    const response: DNSLookupResponse = {
      success: true,
      hostname: hostname || undefined,
      provider: provider || undefined,
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('DNS lookup error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});