import { SPFRecord, parseSPFRecord, parseSPFRecordFromString } from './spfParser';

export interface FlatteningResult {
  success: boolean;
  flattenedRecord: string;
  originalLookups: number;
  newLookups: number;
  ipCount: number;
  resolvedIPs: string[];
  warnings: string[];
  errors: string[];
}

export interface FlatteningOptions {
  includeSubdomains: boolean;
  consolidateCIDR: boolean;
  preserveOrder: boolean;
  maxIPsPerRecord: number;
}

export interface IncludeResolution {
  ips: string[];
  nestedIncludes: string[];
  errors: string[];
}

/**
 * Main flattening orchestrator
 */
export async function flattenSPFIncludes(
  domain: string,
  includesToFlatten: string[],
  options: FlatteningOptions
): Promise<FlatteningResult> {
  const result: FlatteningResult = {
    success: false,
    flattenedRecord: '',
    originalLookups: 0,
    newLookups: 0,
    ipCount: 0,
    resolvedIPs: [],
    warnings: [],
    errors: []
  };

  try {
    // First, get the original SPF record for the domain
    const originalRecord = await parseSPFRecord(domain);
    if (!originalRecord.isValid) {
      result.errors.push(`Invalid original SPF record: ${originalRecord.errors.join(', ')}`);
      return result;
    }

    result.originalLookups = originalRecord.totalLookups;

    // Validate includes to flatten exist in the record
    const availableIncludes = originalRecord.mechanisms
      .filter(m => m.type === 'include')
      .map(m => m.value);

    const validIncludes = includesToFlatten.filter(include => 
      availableIncludes.includes(include)
    );

    const invalidIncludes = includesToFlatten.filter(include => 
      !availableIncludes.includes(include)
    );

    if (invalidIncludes.length > 0) {
      result.warnings.push(`Includes not found in record: ${invalidIncludes.join(', ')}`);
    }

    if (validIncludes.length === 0) {
      result.errors.push('No valid includes found to flatten');
      return result;
    }

    // Resolve each include to IP addresses
    const resolvedIncludes = new Map<string, string[]>();
    const allResolvedIPs: string[] = [];

    for (const includeDomain of validIncludes) {
      try {
        const resolution = await resolveIncludeChain(includeDomain);
        if (resolution.ips.length > 0) {
          resolvedIncludes.set(includeDomain, resolution.ips);
          allResolvedIPs.push(...resolution.ips);

          if (resolution.errors.length > 0) {
            result.warnings.push(`Partial resolution for ${includeDomain}: ${resolution.errors.join(', ')}`);
          }

          if (resolution.nestedIncludes.length > 0) {
            result.warnings.push(`${includeDomain} contains nested includes: ${resolution.nestedIncludes.join(', ')}`);
          }
        } else {
          result.errors.push(`Failed to resolve any IPs for ${includeDomain}`);
        }
      } catch (error) {
        result.errors.push(`Error resolving ${includeDomain}: ${error}`);
      }
    }

    if (resolvedIncludes.size === 0) {
      result.errors.push('Failed to resolve any includes');
      return result;
    }

    // Consolidate IPs if requested
    let finalIPs = allResolvedIPs;
    if (options.consolidateCIDR) {
      const consolidated = consolidateIPAddresses(allResolvedIPs);
      finalIPs = consolidated.consolidatedRanges;
      if (consolidated.originalCount !== consolidated.consolidatedCount) {
        result.warnings.push(`Consolidated ${consolidated.originalCount} IPs into ${consolidated.consolidatedCount} ranges`);
      }
    }

    // Check IP count limits
    if (finalIPs.length > options.maxIPsPerRecord) {
      result.warnings.push(`High IP count (${finalIPs.length}) may create large SPF record. Consider further consolidation.`);
    }

    // Build the flattened record
    result.flattenedRecord = buildFlattenedSPFRecord(
      originalRecord, 
      resolvedIncludes, 
      options
    );

    // Calculate new lookup count
    const parsedFlattened = parseSPFRecordFromString(result.flattenedRecord);
    result.newLookups = parsedFlattened.totalLookups;

    // Set final results
    result.resolvedIPs = finalIPs;
    result.ipCount = finalIPs.length;
    result.success = true;

    // Add helpful warnings
    if (result.newLookups >= result.originalLookups) {
      result.warnings.push('Flattening did not reduce DNS lookups. Consider flattening more includes or other optimizations.');
    }

    if (result.ipCount > 20) {
      result.warnings.push('High IP count may impact SPF record performance. Monitor record size.');
    }

    return result;

  } catch (error) {
    result.errors.push(`Flattening operation failed: ${error}`);
    return result;
  }
}

/**
 * Recursive include resolution with cycle detection
 */
export async function resolveIncludeChain(
  includeDomain: string,
  visited: Set<string> = new Set()
): Promise<IncludeResolution> {
  const result: IncludeResolution = {
    ips: [],
    nestedIncludes: [],
    errors: []
  };

  // Cycle detection
  if (visited.has(includeDomain)) {
    result.errors.push(`Circular dependency detected: ${includeDomain}`);
    return result;
  }

  visited.add(includeDomain);

  try {
    // Get the SPF record for this domain
    const spfRecord = await parseSPFRecord(includeDomain);
    if (!spfRecord.isValid) {
      result.errors.push(`Invalid SPF record for ${includeDomain}: ${spfRecord.errors.join(', ')}`);
      return result;
    }

    // Process each mechanism
    for (const mechanism of spfRecord.mechanisms) {
      switch (mechanism.type) {
        case 'ip4':
        case 'ip6':
          result.ips.push(mechanism.value);
          break;

        case 'include':
          result.nestedIncludes.push(mechanism.value);
          // Note: For safety, we don't automatically resolve nested includes
          // Users should be aware of them and choose to flatten them separately
          break;

        case 'a':
          if (mechanism.value || mechanism.subdomain) {
            const domain = mechanism.value || mechanism.subdomain!;
            try {
              const aIPs = await resolveARecord(domain);
              result.ips.push(...aIPs);
            } catch (error) {
              result.errors.push(`Failed to resolve A record for ${domain}: ${error}`);
            }
          }
          break;

        case 'mx':
          if (mechanism.value || mechanism.subdomain) {
            const domain = mechanism.value || mechanism.subdomain!;
            try {
              const mxIPs = await resolveMXRecord(domain);
              result.ips.push(...mxIPs);
            } catch (error) {
              result.errors.push(`Failed to resolve MX record for ${domain}: ${error}`);
            }
          }
          break;

        // Skip other mechanism types (exists, ptr, all) as they don't resolve to IPs
        default:
          break;
      }
    }

    return result;

  } catch (error) {
    result.errors.push(`Failed to process include ${includeDomain}: ${error}`);
    return result;
  } finally {
    visited.delete(includeDomain);
  }
}

/**
 * Resolve A record to IP addresses
 */
async function resolveARecord(domain: string): Promise<string[]> {
  const response = await fetch('https://epzcwplbouhbucbmhcur.supabase.co/functions/v1/dns-lookup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwemN3cGxib3VoYnVjYm1oY3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTk5NDIsImV4cCI6MjA2ODI5NTk0Mn0.l54eLAp-3kwOHvF3qTVMDVTorYGzGeMmju1YsIFFUeU`
    },
    body: JSON.stringify({
      domain,
      recordType: 'A'
    })
  });

  if (!response.ok) {
    throw new Error(`DNS A record lookup failed: ${response.status}`);
  }

  const result = await response.json();
  if (!result.success || !result.records) {
    throw new Error(`No A records found for ${domain}`);
  }

  return result.records;
}

/**
 * Resolve MX record to IP addresses (resolves MX hostnames to A records)
 */
async function resolveMXRecord(domain: string): Promise<string[]> {
  // First get MX records
  const mxResponse = await fetch('https://epzcwplbouhbucbmhcur.supabase.co/functions/v1/dns-lookup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwemN3cGxib3VoYnVjYm1oY3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTk5NDIsImV4cCI6MjA2ODI5NTk0Mn0.l54eLAp-3kwOHvF3qTVMDVTorYGzGeMmju1YsIFFUeU`
    },
    body: JSON.stringify({
      domain,
      recordType: 'MX'
    })
  });

  if (!mxResponse.ok) {
    throw new Error(`DNS MX record lookup failed: ${mxResponse.status}`);
  }

  const mxResult = await mxResponse.json();
  if (!mxResult.success || !mxResult.records) {
    throw new Error(`No MX records found for ${domain}`);
  }

  // Resolve each MX hostname to A records
  const allIPs: string[] = [];
  for (const mxRecord of mxResult.records) {
    try {
      // Parse MX record format: "priority hostname"
      const parts = mxRecord.split(' ');
      const hostname = parts.length > 1 ? parts[1] : parts[0];
      
      const aIPs = await resolveARecord(hostname);
      allIPs.push(...aIPs);
    } catch (error) {
      // Continue with other MX records if one fails
      console.warn(`Failed to resolve MX hostname from ${mxRecord}:`, error);
    }
  }

  return allIPs;
}

/**
 * IP address consolidation algorithms
 */
export function consolidateIPAddresses(
  ips: string[],
  maxCIDRSize: number = 24
): {
  consolidatedRanges: string[];
  originalCount: number;
  consolidatedCount: number;
} {
  const originalCount = ips.length;
  
  // Separate IPv4 and IPv6, and existing CIDR ranges
  const ipv4Addresses: string[] = [];
  const ipv6Addresses: string[] = [];
  const existingRanges: string[] = [];

  for (const ip of ips) {
    if (ip.includes('/')) {
      existingRanges.push(ip);
    } else if (ip.includes(':')) {
      ipv6Addresses.push(ip);
    } else {
      ipv4Addresses.push(ip);
    }
  }

  // Consolidate IPv4 addresses
  const consolidatedIPv4 = consolidateIPv4Addresses(ipv4Addresses, maxCIDRSize);
  
  // For now, keep IPv6 addresses as-is (IPv6 consolidation is more complex)
  const consolidatedRanges = [
    ...consolidatedIPv4,
    ...ipv6Addresses,
    ...existingRanges
  ];

  return {
    consolidatedRanges,
    originalCount,
    consolidatedCount: consolidatedRanges.length
  };
}

/**
 * Consolidate IPv4 addresses into CIDR blocks
 */
function consolidateIPv4Addresses(ipv4Addresses: string[], maxCIDRSize: number): string[] {
  if (ipv4Addresses.length === 0) return [];

  // Group by subnet
  const subnetGroups = new Map<string, string[]>();

  for (const ip of ipv4Addresses) {
    const parts = ip.split('.');
    if (parts.length !== 4) continue; // Invalid IPv4

    // Group by /24 subnet
    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
    if (!subnetGroups.has(subnet)) {
      subnetGroups.set(subnet, []);
    }
    subnetGroups.get(subnet)!.push(ip);
  }

  const consolidated: string[] = [];

  for (const [subnet, ips] of subnetGroups.entries()) {
    // If we have many IPs in the same /24 subnet, use CIDR notation
    const threshold = Math.max(8, Math.floor(256 / 4)); // Use /24 if we have 8+ IPs in subnet
    
    if (ips.length >= threshold && maxCIDRSize >= 24) {
      consolidated.push(`${subnet}.0/24`);
    } else if (ips.length >= 4 && maxCIDRSize >= 26) {
      // Could implement /26, /27, /28 consolidation here for more granular control
      consolidated.push(...ips);
    } else {
      consolidated.push(...ips);
    }
  }

  return consolidated;
}

/**
 * Build the flattened SPF record string
 */
function buildFlattenedSPFRecord(
  originalRecord: SPFRecord,
  resolvedIncludes: Map<string, string[]>,
  options: FlatteningOptions
): string {
  const parts: string[] = [originalRecord.version];

  // Process mechanisms in order (if preserveOrder is true)
  for (const mechanism of originalRecord.mechanisms) {
    if (mechanism.type === 'include' && resolvedIncludes.has(mechanism.value)) {
      // Replace with resolved IPs
      const ips = resolvedIncludes.get(mechanism.value)!;
      
      // Consolidate if requested
      const finalIPs = options.consolidateCIDR 
        ? consolidateIPAddresses(ips).consolidatedRanges 
        : ips;

      for (const ip of finalIPs) {
        const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
        if (ip.includes(':')) {
          parts.push(`${qualifier}ip6:${ip}`);
        } else {
          parts.push(`${qualifier}ip4:${ip}`);
        }
      }
    } else if (mechanism.type === 'include' && !resolvedIncludes.has(mechanism.value)) {
      // Keep unflattened includes
      const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
      parts.push(`${qualifier}include:${mechanism.value}`);
    } else {
      // Keep other mechanisms as-is
      const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
      const value = mechanism.value ? `:${mechanism.value}` : '';
      parts.push(`${qualifier}${mechanism.type}${value}`);
    }
  }

  // Add modifiers
  for (const modifier of originalRecord.modifiers) {
    parts.push(`${modifier.type}=${modifier.value}`);
  }

  return parts.join(' ');
}

/**
 * Utility function to validate flattened record
 */
export function validateFlattenedRecord(flattenedRecord: string): {
  isValid: boolean;
  lookupCount: number;
  warnings: string[];
  errors: string[];
  recordSize: number;
} {
  try {
    const parsed = parseSPFRecordFromString(flattenedRecord);
    const recordSize = flattenedRecord.length;
    
    const warnings: string[] = [];
    
    if (recordSize > 255) {
      warnings.push(`SPF record is ${recordSize} characters. DNS TXT records should be under 255 characters.`);
    }
    
    if (parsed.totalLookups > 10) {
      warnings.push(`Record still exceeds 10 DNS lookup limit (${parsed.totalLookups})`);
    }

    const ipCount = parsed.mechanisms.filter(m => m.type === 'ip4' || m.type === 'ip6').length;
    if (ipCount > 30) {
      warnings.push(`High IP count (${ipCount}). Consider further consolidation.`);
    }

    return {
      isValid: parsed.isValid,
      lookupCount: parsed.totalLookups,
      warnings: [...parsed.warnings, ...warnings],
      errors: parsed.errors,
      recordSize
    };
  } catch (error) {
    return {
      isValid: false,
      lookupCount: 0,
      warnings: [],
      errors: [`Validation failed: ${error}`],
      recordSize: flattenedRecord.length
    };
  }
}