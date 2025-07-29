import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

interface DNSLookupRequest {
  ip: string;
}

interface DNSLookupResponse {
  success: boolean;
  hostname?: string;
  provider?: string;
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

    const { ip }: DNSLookupRequest = await req.json();
    
    if (!ip) {
      return new Response(
        JSON.stringify({ success: false, error: 'IP address is required' }),
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