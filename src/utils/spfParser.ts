export interface SPFRecord {
  raw: string;
  version: string;
  mechanisms: SPFMechanism[];
  modifiers: SPFModifier[];
  totalLookups: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SPFMechanism {
  type: 'include' | 'a' | 'mx' | 'ip4' | 'ip6' | 'exists' | 'ptr' | 'all';
  value: string;
  qualifier: '+' | '-' | '~' | '?';
  lookupCount: number;
  resolvedIPs: string[];
  subdomain?: string;
  errors: string[];
}

export interface SPFModifier {
  type: 'redirect' | 'exp' | string;
  value: string;
  lookupCount: number;
}

export interface SPFAnalysis {
  record: SPFRecord;
  lookupBreakdown: LookupBreakdown;
  optimizationSuggestions: OptimizationSuggestion[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  complianceStatus: 'compliant' | 'warning' | 'failing';
}

export interface LookupBreakdown {
  includeCount: number;
  aCount: number;
  mxCount: number;
  existsCount: number;
  ptrCount: number;
  redirectCount: number;
  totalCount: number;
  detailedBreakdown: Array<{
    mechanism: string;
    lookups: number;
    source: string;
  }>;
}

export interface OptimizationSuggestion {
  type: 'flatten_include' | 'remove_ptr' | 'consolidate_mx' | 'use_ip4' | 'remove_redundant';
  severity: 'low' | 'medium' | 'high';
  description: string;
  mechanism: string;
  currentLookups: number;
  estimatedSavings: number;
  implementation: string;
}

// Integration with existing DNS lookup infrastructure
interface DNSLookupRequest {
  domain: string;
  recordType: 'TXT' | 'A' | 'MX' | 'PTR';
}

interface DNSLookupResponse {
  success: boolean;
  records?: string[];
  error?: string;
  recordType: string;
}

// DNS resolver that integrates with existing Supabase Edge Function
class SPFResolver {
  private cache: Map<string, { data: string[]; timestamp: number }> = new Map();
  private lookupCounter: number = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour cache like existing system
  private readonly DNS_FUNCTION_URL = 'https://epzcwplbouhbucbmhcur.supabase.co/functions/v1/dns-lookup';

  async resolveTXT(domain: string): Promise<string[]> {
    return this.makeRequest(domain, 'TXT');
  }

  async resolveA(domain: string): Promise<string[]> {
    return this.makeRequest(domain, 'A');
  }

  async resolveMX(domain: string): Promise<string[]> {
    return this.makeRequest(domain, 'MX');
  }

  private async makeRequest(domain: string, recordType: 'TXT' | 'A' | 'MX'): Promise<string[]> {
    const cacheKey = `${recordType}:${domain}`;
    
    // Check cache first (following existing caching pattern)
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    try {
      this.lookupCounter++;
      
      // Use existing DNS infrastructure
      const response = await fetch(this.DNS_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwemN3cGxib3VoYnVjYm1oY3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTk5NDIsImV4cCI6MjA2ODI5NTk0Mn0.l54eLAp-3kwOHvF3qTVMDVTorYGzGeMmju1YsIFFUeU`
        },
        body: JSON.stringify({
          domain,
          recordType
        } as DNSLookupRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`DNS lookup failed for ${domain}:`, {
          status: response.status,
          statusText: response.statusText,
          errorResponse: errorText,
          requestPayload: { domain, recordType }
        });
        throw new Error(`DNS lookup failed: ${response.status} - ${errorText}`);
      }

      const result: DNSLookupResponse = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'DNS lookup failed');
      }

      const records = result.records || [];
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: records,
        timestamp: Date.now()
      });

      return records;
    } catch (error) {
      console.error(`DNS ${recordType} lookup failed for ${domain}:`, error);
      throw error;
    }
  }

  getLookupCount(): number {
    return this.lookupCounter;
  }

  resetLookupCount(): void {
    this.lookupCounter = 0;
  }
}

// SPF record parsing functions using existing validation patterns from dmarcParser.ts
function sanitizeText(text: string, maxLength: number = 1000): string {
  if (!text) return '';
  
  // Use same sanitization as existing dmarcParser.ts
  const cleanText = text.replace(/<[^>]*>/g, '');
  const truncated = cleanText.slice(0, maxLength);
  // eslint-disable-next-line no-control-regex
  return truncated.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function validateDomain(domain: string): string {
  const sanitized = sanitizeText(domain, 253);
  
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(sanitized)) {
    throw new Error(`Invalid domain format: ${sanitized}`);
  }
  
  return sanitized;
}

export function parseSPFRecordFromString(spfString: string): SPFRecord {
  const record: SPFRecord = {
    raw: spfString.trim(),
    version: '',
    mechanisms: [],
    modifiers: [],
    totalLookups: 0,
    isValid: false,
    errors: [],
    warnings: []
  };

  if (!spfString.trim()) {
    record.errors.push('Empty SPF record');
    return record;
  }

  const parts = spfString.trim().split(/\s+/);
  
  // Check version
  if (!parts[0] || !parts[0].startsWith('v=spf1')) {
    record.errors.push('SPF record must start with "v=spf1"');
    return record;
  }
  
  record.version = parts[0];
  record.isValid = true;

  // Parse mechanisms and modifiers
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    if (part.includes('=') && !part.includes(':') && ['redirect', 'exp'].some(mod => part.startsWith(mod + '='))) {
      // This is a modifier (redirect=, exp=)
      const [type, value] = part.split('=', 2);
      const lookupCount = ['redirect', 'exp'].includes(type) ? 1 : 0;
      
      record.modifiers.push({
        type,
        value: sanitizeText(value),
        lookupCount
      });
      
      record.totalLookups += lookupCount;
    } else {
      // This is a mechanism
      const mechanism = parseMechanism(part);
      if (mechanism) {
        record.mechanisms.push(mechanism);
        record.totalLookups += mechanism.lookupCount;
      } else {
        record.errors.push(`Invalid mechanism: ${part}`);
      }
    }
  }

  // Validate total lookups - critical SPF limit
  if (record.totalLookups > 10) {
    record.errors.push(`SPF record exceeds 10 DNS lookups (${record.totalLookups}). This will cause SPF authentication to fail.`);
  } else if (record.totalLookups > 8) {
    record.warnings.push(`SPF record is close to 10 DNS lookup limit (${record.totalLookups}). Consider optimization.`);
  }

  // Check for 'all' mechanism
  const hasAll = record.mechanisms.some(m => m.type === 'all');
  if (!hasAll) {
    record.warnings.push('SPF record does not contain an "all" mechanism. This may allow unauthorized senders.');
  }

  // Check for deprecated mechanisms
  const hasPTR = record.mechanisms.some(m => m.type === 'ptr');
  if (hasPTR) {
    record.warnings.push('SPF record contains PTR mechanism which is deprecated and slow. Consider replacing with ip4/ip6.');
  }

  return record;
}

function parseMechanism(mechanismString: string): SPFMechanism | null {
  if (!mechanismString) return null;

  let qualifier: '+' | '-' | '~' | '?' = '+';
  let mechanism = mechanismString;

  // Extract qualifier
  if (mechanismString[0] && ['+', '-', '~', '?'].includes(mechanismString[0])) {
    qualifier = mechanismString[0] as '+' | '-' | '~' | '?';
    mechanism = mechanismString.substring(1);
  }

  // Parse mechanism type and value
  let type: SPFMechanism['type'];
  let value = '';
  let subdomain: string | undefined;

  if (mechanism === 'all') {
    type = 'all';
  } else if (mechanism.startsWith('include:')) {
    type = 'include';
    value = mechanism.substring(8);
    try {
      value = validateDomain(value);
    } catch (error) {
      return null;
    }
  } else if (mechanism.startsWith('a')) {
    type = 'a';
    if (mechanism.length > 1 && mechanism[1] === ':') {
      value = mechanism.substring(2);
      subdomain = value;
      try {
        value = validateDomain(value);
      } catch (error) {
        return null;
      }
    }
  } else if (mechanism.startsWith('mx')) {
    type = 'mx';
    if (mechanism.length > 2 && mechanism[2] === ':') {
      value = mechanism.substring(3);
      subdomain = value;
      try {
        value = validateDomain(value);
      } catch (error) {
        return null;
      }
    }
  } else if (mechanism.startsWith('ip4:')) {
    type = 'ip4';
    value = mechanism.substring(4);
    // Basic IP4/CIDR validation
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(value)) {
      return null;
    }
  } else if (mechanism.startsWith('ip6:')) {
    type = 'ip6';
    value = mechanism.substring(4);
    // Basic IP6 validation (simplified)
    if (!/^[0-9a-fA-F:]+(:\/\d{1,3})?$/.test(value)) {
      return null;
    }
  } else if (mechanism.startsWith('exists:')) {
    type = 'exists';
    value = mechanism.substring(7);
    try {
      value = validateDomain(value);
    } catch (error) {
      return null;
    }
  } else if (mechanism.startsWith('ptr')) {
    type = 'ptr';
    if (mechanism.length > 3 && mechanism[3] === ':') {
      value = mechanism.substring(4);
      subdomain = value;
      try {
        value = validateDomain(value);
      } catch (error) {
        return null;
      }
    }
  } else {
    return null; // Unknown mechanism
  }

  // Count DNS lookups for this mechanism
  const lookupCount = getLookupCountForMechanism(type);

  return {
    type,
    value: sanitizeText(value),
    qualifier,
    lookupCount,
    resolvedIPs: [],
    subdomain,
    errors: []
  };
}

function getLookupCountForMechanism(type: SPFMechanism['type']): number {
  switch (type) {
    case 'include':
      return 1; // Each include requires a TXT lookup
    case 'a':
      return 1; // Each 'a' requires an A lookup
    case 'mx':
      return 1; // Each 'mx' requires an MX lookup (plus A lookups for each MX record, but we count as 1 for the MX lookup itself)
    case 'exists':
      return 1; // Each 'exists' requires an A lookup
    case 'ptr':
      return 1; // Each 'ptr' requires PTR and A lookups, but we count as 1
    case 'ip4':
    case 'ip6':
    case 'all':
      return 0; // These don't require DNS lookups
    default:
      return 0;
  }
}

export async function parseSPFRecord(domain: string): Promise<SPFRecord> {
  const resolver = new SPFResolver();
  
  try {
    const validatedDomain = validateDomain(domain);
    const txtRecords = await resolver.resolveTXT(validatedDomain);
    const spfRecord = txtRecords.find(record => record.startsWith('v=spf1'));
    
    if (!spfRecord) {
      return {
        raw: '',
        version: '',
        mechanisms: [],
        modifiers: [],
        totalLookups: 0,
        isValid: false,
        errors: [`No SPF record found for domain: ${domain}`],
        warnings: []
      };
    }

    return parseSPFRecordFromString(spfRecord);
  } catch (error) {
    return {
      raw: '',
      version: '',
      mechanisms: [],
      modifiers: [],
      totalLookups: 0,
      isValid: false,
      errors: [`Failed to retrieve SPF record for domain ${domain}: ${error}`],
      warnings: []
    };
  }
}

export async function analyzeSPFRecord(record: SPFRecord): Promise<SPFAnalysis> {
  const lookupBreakdown = calculateLookupBreakdown(record);
  const riskLevel = calculateRiskLevel(record.totalLookups);
  const complianceStatus = calculateComplianceStatus(record);
  
  // Basic optimization suggestions (will be enhanced by spfOptimizer.ts)
  const optimizationSuggestions: OptimizationSuggestion[] = [];
  
  // Suggest flattening includes if close to limit
  if (record.totalLookups >= 8) {
    const includeMechanisms = record.mechanisms.filter(m => m.type === 'include');
    if (includeMechanisms.length > 0) {
      optimizationSuggestions.push({
        type: 'flatten_include',
        severity: record.totalLookups > 10 ? 'high' : 'medium',
        description: 'Consider flattening include mechanisms to reduce DNS lookups',
        mechanism: includeMechanisms[0].value,
        currentLookups: includeMechanisms.length,
        estimatedSavings: includeMechanisms.length,
        implementation: 'Replace include mechanisms with direct IP addresses'
      });
    }
  }

  // Suggest removing PTR mechanisms
  const ptrMechanisms = record.mechanisms.filter(m => m.type === 'ptr');
  if (ptrMechanisms.length > 0) {
    optimizationSuggestions.push({
      type: 'remove_ptr',
      severity: 'medium',
      description: 'PTR mechanisms are deprecated and slow. Consider replacing with ip4/ip6.',
      mechanism: ptrMechanisms[0].value || 'ptr',
      currentLookups: ptrMechanisms.length,
      estimatedSavings: ptrMechanisms.length,
      implementation: 'Replace PTR mechanisms with specific IP addresses'
    });
  }

  return {
    record,
    lookupBreakdown,
    optimizationSuggestions,
    riskLevel,
    complianceStatus
  };
}

export function countDNSLookups(mechanisms: SPFMechanism[]): number {
  return mechanisms.reduce((total, mechanism) => total + mechanism.lookupCount, 0);
}

export function validateSPFSyntax(record: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!record.trim()) {
    errors.push('Empty SPF record');
    return { isValid: false, errors };
  }

  if (!record.startsWith('v=spf1')) {
    errors.push('SPF record must start with "v=spf1"');
  }

  const parts = record.trim().split(/\s+/);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    // Basic syntax validation for modifiers
    if (part.includes('=') && !part.includes(':') && !['redirect', 'exp'].some(mod => part.startsWith(mod + '='))) {
      errors.push(`Unknown modifier: ${part}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

export async function resolveMechanism(mechanism: SPFMechanism): Promise<string[]> {
  const resolver = new SPFResolver();
  
  try {
    switch (mechanism.type) {
      case 'a':
        const domain = mechanism.subdomain || mechanism.value || '';
        if (!domain) return [];
        return await resolver.resolveA(domain);
        
      case 'mx':
        const mxDomain = mechanism.subdomain || mechanism.value || '';
        if (!mxDomain) return [];
        const mxRecords = await resolver.resolveMX(mxDomain);
        // Extract IP addresses from MX records
        const ips: string[] = [];
        for (const mxRecord of mxRecords) {
          try {
            // MX records format: "10 mail.example.com"
            const parts = mxRecord.split(' ');
            const exchange = parts.length > 1 ? parts[1] : parts[0];
            const mxIps = await resolver.resolveA(exchange);
            ips.push(...mxIps);
          } catch (error) {
            // Continue with other MX records
            console.warn(`Failed to resolve MX record ${mxRecord}:`, error);
          }
        }
        return ips;
        
      case 'include':
        if (!mechanism.value) return [];
        const includeRecords = await resolver.resolveTXT(mechanism.value);
        const includeSpf = includeRecords.find(record => record.startsWith('v=spf1'));
        if (includeSpf) {
          const parsedInclude = parseSPFRecordFromString(includeSpf);
          // Return IP addresses from non-include mechanisms to avoid recursion
          const includeIps: string[] = [];
          for (const includeMech of parsedInclude.mechanisms) {
            if (includeMech.type === 'ip4' || includeMech.type === 'ip6') {
              includeIps.push(includeMech.value);
            }
          }
          return includeIps;
        }
        return [];
        
      case 'ip4':
      case 'ip6':
        return [mechanism.value];
        
      default:
        return [];
    }
  } catch (error) {
    mechanism.errors.push(`Failed to resolve mechanism: ${error}`);
    return [];
  }
}

function calculateLookupBreakdown(record: SPFRecord): LookupBreakdown {
  const breakdown: LookupBreakdown = {
    includeCount: 0,
    aCount: 0,
    mxCount: 0,
    existsCount: 0,
    ptrCount: 0,
    redirectCount: 0,
    totalCount: record.totalLookups,
    detailedBreakdown: []
  };

  // Count mechanisms
  record.mechanisms.forEach(mechanism => {
    switch (mechanism.type) {
      case 'include':
        breakdown.includeCount += mechanism.lookupCount;
        break;
      case 'a':
        breakdown.aCount += mechanism.lookupCount;
        break;
      case 'mx':
        breakdown.mxCount += mechanism.lookupCount;
        break;
      case 'exists':
        breakdown.existsCount += mechanism.lookupCount;
        break;
      case 'ptr':
        breakdown.ptrCount += mechanism.lookupCount;
        break;
    }
    
    if (mechanism.lookupCount > 0) {
      breakdown.detailedBreakdown.push({
        mechanism: `${mechanism.type}${mechanism.value ? ':' + mechanism.value : ''}`,
        lookups: mechanism.lookupCount,
        source: 'mechanism'
      });
    }
  });

  // Count modifiers
  record.modifiers.forEach(modifier => {
    if (modifier.type === 'redirect') {
      breakdown.redirectCount += modifier.lookupCount;
    }
    
    if (modifier.lookupCount > 0) {
      breakdown.detailedBreakdown.push({
        mechanism: `${modifier.type}=${modifier.value}`,
        lookups: modifier.lookupCount,
        source: 'modifier'
      });
    }
  });

  return breakdown;
}

function calculateRiskLevel(totalLookups: number): 'low' | 'medium' | 'high' | 'critical' {
  if (totalLookups >= 10) return 'critical';
  if (totalLookups >= 8) return 'high';
  if (totalLookups >= 6) return 'medium';
  return 'low';
}

function calculateComplianceStatus(record: SPFRecord): 'compliant' | 'warning' | 'failing' {
  if (record.errors.length > 0 || record.totalLookups > 10) return 'failing';
  if (record.warnings.length > 0 || record.totalLookups > 8) return 'warning';
  return 'compliant';
}