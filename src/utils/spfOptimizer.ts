import { SPFRecord, SPFMechanism, OptimizationSuggestion, parseSPFRecordFromString } from './spfParser';

export interface FlatteningResult {
  success: boolean;
  flattenedRecord: string;
  originalLookups: number;
  newLookups: number;
  ipCount: number;
  resolvedIPs: Map<string, string[]>;
  warnings: string[];
  implementationNotes: string[];
  errors: string[];
}

export class SPFOptimizer {
  analyzeOptimizations(record: SPFRecord): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    
    // Add all optimization strategies
    suggestions.push(...this.identifyFlatteningOpportunities(record.mechanisms));
    suggestions.push(...this.findRedundantMechanisms(record.mechanisms));
    suggestions.push(...this.suggestIPConsolidation(record.mechanisms));
    suggestions.push(...this.detectUnnecessaryPTR(record.mechanisms));
    
    // Sort by severity and estimated savings
    return suggestions.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.estimatedSavings - a.estimatedSavings;
    });
  }

  identifyFlatteningOpportunities(mechanisms: SPFMechanism[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const includeMechanisms = mechanisms.filter(m => m.type === 'include');
    
    if (includeMechanisms.length === 0) return suggestions;

    // Identify includes that could be flattened
    for (const include of includeMechanisms) {
      // High priority for common ESPs that have stable IPs
      if (this.isCommonESP(include.value)) {
        suggestions.push({
          type: 'flatten_include',
          severity: 'medium',
          description: `Flatten ${include.value} to reduce DNS lookups. This ESP has relatively stable IP ranges.`,
          mechanism: include.value,
          currentLookups: 1,
          estimatedSavings: 1,
          implementation: `Replace "include:${include.value}" with direct ip4/ip6 mechanisms for their IP ranges. Monitor for changes monthly.`
        });
      }
      
      // Medium priority for other includes if close to limit
      else if (mechanisms.reduce((total, m) => total + m.lookupCount, 0) >= 8) {
        suggestions.push({
          type: 'flatten_include',
          severity: 'high',
          description: `Consider flattening ${include.value} as you're approaching the 10 DNS lookup limit.`,
          mechanism: include.value,
          currentLookups: 1,
          estimatedSavings: 1,
          implementation: `Resolve ${include.value}'s SPF record and replace with direct IP mechanisms. Requires regular monitoring for changes.`
        });
      }
    }

    return suggestions;
  }

  findRedundantMechanisms(mechanisms: SPFMechanism[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const seen = new Map<string, SPFMechanism>();
    
    for (const mechanism of mechanisms) {
      const key = `${mechanism.type}:${mechanism.value}`;
      
      if (seen.has(key)) {
        const original = seen.get(key)!;
        suggestions.push({
          type: 'remove_redundant',
          severity: 'low',
          description: `Duplicate ${mechanism.type} mechanism found`,
          mechanism: key,
          currentLookups: mechanism.lookupCount,
          estimatedSavings: mechanism.lookupCount,
          implementation: `Remove the duplicate "${mechanism.qualifier}${mechanism.type}${mechanism.value ? ':' + mechanism.value : ''}" mechanism`
        });
      } else {
        seen.set(key, mechanism);
      }
    }

    // Check for overlapping IP ranges
    const ip4Mechanisms = mechanisms.filter(m => m.type === 'ip4');
    for (let i = 0; i < ip4Mechanisms.length; i++) {
      for (let j = i + 1; j < ip4Mechanisms.length; j++) {
        if (this.areIPRangesOverlapping(ip4Mechanisms[i].value, ip4Mechanisms[j].value)) {
          suggestions.push({
            type: 'remove_redundant',
            severity: 'low',
            description: `Overlapping IP ranges detected`,
            mechanism: `${ip4Mechanisms[i].value} and ${ip4Mechanisms[j].value}`,
            currentLookups: 0,
            estimatedSavings: 0,
            implementation: `Consolidate overlapping IP ranges: ${ip4Mechanisms[i].value} and ${ip4Mechanisms[j].value}`
          });
        }
      }
    }

    return suggestions;
  }

  suggestIPConsolidation(mechanisms: SPFMechanism[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const ip4Mechanisms = mechanisms.filter(m => m.type === 'ip4');
    
    if (ip4Mechanisms.length < 3) return suggestions;

    // Look for multiple IPs that could be consolidated into CIDR blocks
    const ips = ip4Mechanisms.map(m => m.value).filter(ip => !ip.includes('/'));
    
    if (ips.length >= 3) {
      const consolidationOpportunities = this.findCIDRConsolidationOpportunities(ips);
      
      for (const opportunity of consolidationOpportunities) {
        suggestions.push({
          type: 'use_ip4',
          severity: 'low',
          description: `Multiple individual IPs could be consolidated into CIDR blocks`,
          mechanism: opportunity.ips.join(', '),
          currentLookups: 0,
          estimatedSavings: 0,
          implementation: `Replace individual IPs ${opportunity.ips.join(', ')} with CIDR block ${opportunity.cidr}`
        });
      }
    }

    return suggestions;
  }

  detectUnnecessaryPTR(mechanisms: SPFMechanism[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const ptrMechanisms = mechanisms.filter(m => m.type === 'ptr');
    
    for (const ptr of ptrMechanisms) {
      suggestions.push({
        type: 'remove_ptr',
        severity: 'high',
        description: 'PTR mechanism is deprecated, slow, and unreliable',
        mechanism: ptr.value || 'ptr',
        currentLookups: ptr.lookupCount,
        estimatedSavings: ptr.lookupCount,
        implementation: `Remove PTR mechanism and replace with specific ip4/ip6 mechanisms for authorized sending IPs. PTR mechanisms are deprecated in RFC 7208.`
      });
    }

    return suggestions;
  }

  generateOptimizedRecord(original: SPFRecord, suggestions: OptimizationSuggestion[]): string {
    let optimizedMechanisms = [...original.mechanisms];
    let optimizedModifiers = [...original.modifiers];

    // Apply high-priority optimizations
    const highPrioritySuggestions = suggestions.filter(s => s.severity === 'high');
    
    for (const suggestion of highPrioritySuggestions) {
      switch (suggestion.type) {
        case 'remove_ptr':
          optimizedMechanisms = optimizedMechanisms.filter(m => 
            m.type !== 'ptr' || m.value !== suggestion.mechanism.replace('ptr', '').replace(':', '')
          );
          break;
          
        case 'remove_redundant':
          // Remove first occurrence of redundant mechanism
          const [type, value] = suggestion.mechanism.split(':');
          let removed = false;
          optimizedMechanisms = optimizedMechanisms.filter(m => {
            if (!removed && m.type === type && m.value === value) {
              removed = true;
              return false;
            }
            return true;
          });
          break;
      }
    }

    // Reconstruct SPF record
    const mechanisms = optimizedMechanisms.map(m => {
      const qualifier = m.qualifier === '+' ? '' : m.qualifier;
      const value = m.value ? `:${m.value}` : '';
      return `${qualifier}${m.type}${value}`;
    });

    const modifiers = optimizedModifiers.map(m => `${m.type}=${m.value}`);
    
    return `v=spf1 ${[...mechanisms, ...modifiers].join(' ')}`;
  }

  // Helper methods
  private isCommonESP(domain: string): boolean {
    const commonESPs = [
      '_spf.google.com',
      'spf.protection.outlook.com',
      'include.mailgun.org',
      '_spf.salesforce.com',
      'spf1.mailgun.org',
      'sendgrid.net',
      '_spf.mandrillapp.com',
      'mail.zendesk.com',
      'spf.constantcontact.com',
      '_spf.hubspot.com',
      'spf.mailchimp.com',
      'spf.aweber.com',
      'spf.getresponse.com',
      'spf.mailerlite.com',
      'spf.convertkit.com'
    ];

    return commonESPs.some(esp => domain.includes(esp));
  }

  private areIPRangesOverlapping(range1: string, range2: string): boolean {
    // Basic overlap detection for IP ranges
    // This is a simplified implementation - in production you'd want more sophisticated CIDR overlap detection
    if (!range1.includes('/') && !range2.includes('/')) {
      return range1 === range2; // Exact IP match
    }
    
    // For CIDR ranges, you'd implement proper subnet overlap checking
    // This is a placeholder for more complex logic
    return false;
  }

  private findCIDRConsolidationOpportunities(ips: string[]): Array<{ips: string[], cidr: string}> {
    // Simplified CIDR consolidation detection
    // In a real implementation, you'd analyze IP addresses for common subnets
    const opportunities: Array<{ips: string[], cidr: string}> = [];
    
    // Group IPs by first 3 octets
    const groups = new Map<string, string[]>();
    
    for (const ip of ips) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        if (!groups.has(subnet)) {
          groups.set(subnet, []);
        }
        groups.get(subnet)!.push(ip);
      }
    }

    // Find groups with 3+ IPs that could be consolidated
    for (const [subnet, groupIps] of groups.entries()) {
      if (groupIps.length >= 3) {
        opportunities.push({
          ips: groupIps,
          cidr: `${subnet}.0/24`
        });
      }
    }

    return opportunities;
  }

  // Advanced analysis methods
  estimateLookupReduction(record: SPFRecord, appliedSuggestions: OptimizationSuggestion[]): number {
    return appliedSuggestions.reduce((total, suggestion) => total + suggestion.estimatedSavings, 0);
  }

  calculateRiskAssessment(record: SPFRecord): {
    currentRisk: string;
    lookupUtilization: number;
    failureRisk: string;
    recommendedActions: string[];
  } {
    const lookupUtilization = (record.totalLookups / 10) * 100;
    
    let currentRisk = 'Low';
    let failureRisk = 'Low';
    const recommendedActions: string[] = [];

    if (record.totalLookups >= 10) {
      currentRisk = 'Critical';
      failureRisk = 'Immediate';
      recommendedActions.push('SPF record is exceeding lookup limit - emails will fail SPF authentication');
      recommendedActions.push('Immediate action required to flatten includes or remove unnecessary mechanisms');
    } else if (record.totalLookups >= 8) {
      currentRisk = 'High';
      failureRisk = 'High';
      recommendedActions.push('Close to lookup limit - implement optimizations soon');
      recommendedActions.push('Monitor for any additional includes that might push over the limit');
    } else if (record.totalLookups >= 6) {
      currentRisk = 'Medium';
      failureRisk = 'Medium';
      recommendedActions.push('Consider optimization to maintain buffer for future changes');
    } else {
      recommendedActions.push('SPF record is healthy - maintain current configuration');
    }

    // Check for specific risky mechanisms
    const hasPTR = record.mechanisms.some(m => m.type === 'ptr');
    if (hasPTR) {
      recommendedActions.push('Remove deprecated PTR mechanisms');
    }

    const includeCount = record.mechanisms.filter(m => m.type === 'include').length;
    if (includeCount > 5) {
      recommendedActions.push('High number of includes may impact performance');
    }

    return {
      currentRisk,
      lookupUtilization,
      failureRisk,
      recommendedActions
    };
  }

  // Validation method for optimized records
  validateOptimizedRecord(optimizedRecord: string): {
    isValid: boolean;
    lookupCount: number;
    warnings: string[];
    errors: string[];
  } {
    try {
      const parsed = parseSPFRecordFromString(optimizedRecord);
      
      return {
        isValid: parsed.isValid,
        lookupCount: parsed.totalLookups,
        warnings: parsed.warnings,
        errors: parsed.errors
      };
    } catch (error) {
      return {
        isValid: false,
        lookupCount: 0,
        warnings: [],
        errors: [`Failed to validate optimized record: ${error}`]
      };
    }
  }

  // ==== NEW FLATTENING METHODS ====

  /**
   * Actually performs SPF flattening by resolving includes to IP addresses
   */
  async flattenSPFRecord(
    record: SPFRecord, 
    selectedSuggestions: OptimizationSuggestion[]
  ): Promise<FlatteningResult> {
    const result: FlatteningResult = {
      success: false,
      flattenedRecord: '',
      originalLookups: record.totalLookups,
      newLookups: 0,
      ipCount: 0,
      resolvedIPs: new Map(),
      warnings: [],
      implementationNotes: [],
      errors: []
    };

    try {
      // Get includes to flatten from suggestions
      const includesToFlatten = selectedSuggestions
        .filter(s => s.type === 'flatten_include')
        .map(s => s.mechanism);

      if (includesToFlatten.length === 0) {
        result.errors.push('No includes selected for flattening');
        return result;
      }

      // Resolve each include to IP addresses
      const resolvedIncludes = new Map<string, string[]>();
      
      for (const includeDomain of includesToFlatten) {
        try {
          const resolution = await this.resolveIncludeToIPs(includeDomain);
          if (resolution.ipAddresses.length > 0) {
            resolvedIncludes.set(includeDomain, resolution.ipAddresses);
            result.resolvedIPs.set(includeDomain, resolution.ipAddresses);
            
            if (resolution.errors.length > 0) {
              result.warnings.push(`Partial resolution for ${includeDomain}: ${resolution.errors.join(', ')}`);
            }
            
            if (resolution.nestedIncludes && resolution.nestedIncludes.length > 0) {
              result.implementationNotes.push(`${includeDomain} contains nested includes: ${resolution.nestedIncludes.join(', ')}`);
            }
          } else {
            result.errors.push(`Failed to resolve any IPs for ${includeDomain}`);
          }
        } catch (error) {
          result.errors.push(`Error resolving ${includeDomain}: ${error}`);
        }
      }

      // If we have resolution errors for all includes, fail
      if (resolvedIncludes.size === 0) {
        result.errors.push('Failed to resolve any includes for flattening');
        return result;
      }

      // Build the flattened record
      result.flattenedRecord = this.buildFlattenedRecord(record, resolvedIncludes, selectedSuggestions);
      
      // Calculate new lookup count
      const parsedFlattened = parseSPFRecordFromString(result.flattenedRecord);
      result.newLookups = parsedFlattened.totalLookups;
      
      // Count total resolved IPs
      result.ipCount = Array.from(result.resolvedIPs.values())
        .reduce((total, ips) => total + ips.length, 0);

      // Add implementation notes
      result.implementationNotes.push(
        `Flattened ${includesToFlatten.length} include(s), reduced lookups from ${result.originalLookups} to ${result.newLookups}`
      );
      result.implementationNotes.push(
        `Monitor flattened IPs for changes. Common ESPs: monthly check recommended. Custom domains: weekly check recommended.`
      );

      // Add warnings for large IP counts
      if (result.ipCount > 20) {
        result.warnings.push(`High IP count (${result.ipCount}). Consider CIDR consolidation to reduce SPF record size.`);
      }

      // Add warnings for common ESPs
      for (const includeDomain of includesToFlatten) {
        if (this.isCommonESP(includeDomain)) {
          result.warnings.push(`${includeDomain} is a major ESP - their IP ranges may change. Set up monitoring.`);
        }
      }

      result.success = true;
      return result;

    } catch (error) {
      result.errors.push(`Flattening failed: ${error}`);
      return result;
    }
  }

  /**
   * Resolves an include mechanism to its IP addresses
   */
  private async resolveIncludeToIPs(includeDomain: string): Promise<{
    ipAddresses: string[];
    errors: string[];
    nestedIncludes?: string[];
  }> {
    const result = {
      ipAddresses: [] as string[],
      errors: [] as string[],
      nestedIncludes: [] as string[]
    };

    try {
      // Make DNS request to resolve TXT record
      const response = await fetch('/functions/v1/dns-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: includeDomain,
          recordType: 'TXT'
        })
      });

      if (!response.ok) {
        result.errors.push(`DNS lookup failed: ${response.status}`);
        return result;
      }

      const dnsResult = await response.json();
      if (!dnsResult.success || !dnsResult.records) {
        result.errors.push(`No TXT records found for ${includeDomain}`);
        return result;
      }

      // Find SPF record
      const spfRecord = dnsResult.records.find((record: string) => record.startsWith('v=spf1'));
      if (!spfRecord) {
        result.errors.push(`No SPF record found in TXT records for ${includeDomain}`);
        return result;
      }

      // Parse the SPF record
      const parsed = parseSPFRecordFromString(spfRecord);
      if (!parsed.isValid) {
        result.errors.push(`Invalid SPF record for ${includeDomain}: ${parsed.errors.join(', ')}`);
        return result;
      }

      // Extract IP addresses and track nested includes
      for (const mechanism of parsed.mechanisms) {
        switch (mechanism.type) {
          case 'ip4':
          case 'ip6':
            result.ipAddresses.push(mechanism.value);
            break;
          case 'include':
            result.nestedIncludes.push(mechanism.value);
            // Note: We don't recursively resolve to avoid complexity and infinite loops
            break;
          case 'a':
          case 'mx':
            try {
              const resolvedIPs = await this.resolveMechanismToIPs(mechanism);
              result.ipAddresses.push(...resolvedIPs);
            } catch (error) {
              result.errors.push(`Failed to resolve ${mechanism.type}:${mechanism.value}: ${error}`);
            }
            break;
        }
      }

      return result;

    } catch (error) {
      result.errors.push(`Resolution failed: ${error}`);
      return result;
    }
  }

  /**
   * Resolve a mechanism (a, mx) to IP addresses
   */
  private async resolveMechanismToIPs(mechanism: SPFMechanism): Promise<string[]> {
    const ips: string[] = [];
    const domain = mechanism.value || mechanism.subdomain;
    
    if (!domain) return ips;

    try {
      if (mechanism.type === 'a') {
        const response = await fetch('/functions/v1/dns-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain,
            recordType: 'A'
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.records) {
            ips.push(...result.records);
          }
        }
      } else if (mechanism.type === 'mx') {
        const response = await fetch('/functions/v1/dns-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain,
            recordType: 'MX'
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.records) {
            // Resolve each MX record to A records
            for (const mxRecord of result.records) {
              const parts = mxRecord.split(' ');
              const mxHostname = parts.length > 1 ? parts[1] : parts[0];
              
              const aResponse = await fetch('/functions/v1/dns-lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  domain: mxHostname,
                  recordType: 'A'
                })
              });

              if (aResponse.ok) {
                const aResult = await aResponse.json();
                if (aResult.success && aResult.records) {
                  ips.push(...aResult.records);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to resolve ${mechanism.type}:${domain}:`, error);
    }

    return ips;
  }

  /**
   * Consolidates multiple IP addresses into efficient CIDR blocks
   */
  private consolidateIPRanges(ipAddresses: string[]): {
    consolidatedRanges: string[];
    reductionCount: number;
  } {
    const originalCount = ipAddresses.length;
    
    // Basic CIDR consolidation - group by /24 subnets
    const subnets = new Map<string, string[]>();
    const standaloneIPs: string[] = [];

    for (const ip of ipAddresses) {
      if (!ip.includes('/')) { // Individual IP address
        const parts = ip.split('.');
        if (parts.length === 4) {
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
          if (!subnets.has(subnet)) {
            subnets.set(subnet, []);
          }
          subnets.get(subnet)!.push(ip);
        } else {
          standaloneIPs.push(ip); // IPv6 or malformed
        }
      } else {
        standaloneIPs.push(ip); // Already a CIDR range
      }
    }

    const consolidated: string[] = [];
    
    // Convert subnets with 8+ IPs to /24 CIDR
    for (const [subnet, ips] of subnets.entries()) {
      if (ips.length >= 8) {
        consolidated.push(`${subnet}.0/24`);
      } else {
        consolidated.push(...ips);
      }
    }

    consolidated.push(...standaloneIPs);

    return {
      consolidatedRanges: consolidated,
      reductionCount: originalCount - consolidated.length
    };
  }

  /**
   * Generates the actual flattened SPF record string
   */
  private buildFlattenedRecord(
    originalRecord: SPFRecord,
    resolvedIncludes: Map<string, string[]>,
    suggestions: OptimizationSuggestion[]
  ): string {
    const mechanisms: string[] = [];
    const modifiers: string[] = [];

    // Start with version
    const recordParts = [originalRecord.version];

    // Process existing mechanisms
    for (const mechanism of originalRecord.mechanisms) {
      if (mechanism.type === 'include' && resolvedIncludes.has(mechanism.value)) {
        // Replace include with resolved IPs
        const ips = resolvedIncludes.get(mechanism.value)!;
        const consolidated = this.consolidateIPRanges(ips);
        
        for (const ipOrRange of consolidated.consolidatedRanges) {
          const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
          if (ipOrRange.includes(':')) {
            mechanisms.push(`${qualifier}ip6:${ipOrRange}`);
          } else {
            mechanisms.push(`${qualifier}ip4:${ipOrRange}`);
          }
        }
      } else if (mechanism.type === 'ptr' && 
                 suggestions.some(s => s.type === 'remove_ptr' && s.mechanism.includes('ptr'))) {
        // Skip PTR mechanisms if suggested for removal
        continue;
      } else {
        // Keep other mechanisms as-is
        const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
        const value = mechanism.value ? `:${mechanism.value}` : '';
        mechanisms.push(`${qualifier}${mechanism.type}${value}`);
      }
    }

    // Add modifiers
    for (const modifier of originalRecord.modifiers) {
      modifiers.push(`${modifier.type}=${modifier.value}`);
    }

    // Combine all parts
    const allParts = [originalRecord.version, ...mechanisms, ...modifiers];
    
    return allParts.join(' ');
  }
}