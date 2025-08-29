import { SPFRecord, SPFMechanism, OptimizationSuggestion, parseSPFRecordFromString } from './spfParser';

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
}