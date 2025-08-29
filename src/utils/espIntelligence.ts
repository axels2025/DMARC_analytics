import { supabase } from '@/integrations/supabase/client';
import { IPChangeEvent } from './spfMonitoring';

export interface ESPIntelligence {
  name: string;
  includeDomain: string;
  type: 'transactional' | 'marketing' | 'enterprise' | 'infrastructure' | 'unknown';
  stabilityRating: number; // 1-10 scale
  changeFrequency: 'rare' | 'monthly' | 'weekly' | 'daily';
  monitoringRecommendation: {
    checkInterval: 'hourly' | 'daily' | 'weekly';
    alertThreshold: number;
    autoUpdateSafe: boolean;
    confidenceThreshold: number;
  };
  knownIPRanges: string[];
  recentChanges: {
    lastKnownChange?: Date;
    changePattern?: string;
    seasonalVariation?: boolean;
  };
  businessContext: {
    primaryUse: string[];
    expectedVolume: 'low' | 'medium' | 'high' | 'very_high';
    criticality: 'low' | 'medium' | 'high' | 'critical';
  };
  technicalDetails: {
    supportsIPv6: boolean;
    usesCDN: boolean;
    hasRedundancy: boolean;
    maintenanceWindows?: string[];
  };
}

export interface ESPChangePattern {
  includeDomain: string;
  patternType: 'expansion' | 'migration' | 'maintenance' | 'rotation' | 'unknown';
  frequency: number; // changes per month
  predictability: 'high' | 'medium' | 'low';
  seasonality: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ESPRiskAssessment {
  includeDomain: string;
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];
  mitigations: string[];
  monitoringRecommendations: string[];
}

/**
 * ESP Intelligence Engine using existing classification data and learning from changes
 * Provides intelligent insights for SPF monitoring and automation decisions
 */
export class ESPIntelligenceEngine {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Get comprehensive ESP intelligence profile
   */
  async getESPProfile(includeDomain: string): Promise<ESPIntelligence> {
    try {
      const cacheKey = `esp_profile_${includeDomain}`;
      const cached = this.getCached<ESPIntelligence>(cacheKey);
      if (cached) return cached;

      console.log(`[ESPIntelligence] Getting profile for: ${includeDomain}`);

      // Get base ESP classification
      const baseClassification = await this.getBaseClassification(includeDomain);
      
      // Get change history and patterns
      const changeHistory = await this.getChangeHistory(includeDomain);
      const changePattern = this.analyzeChangePattern(changeHistory);
      
      // Get IP range analysis
      const knownRanges = await this.analyzeKnownIPRanges(includeDomain);
      
      // Build comprehensive profile
      const profile: ESPIntelligence = {
        name: baseClassification.esp_name || 'Unknown ESP',
        includeDomain,
        type: baseClassification.esp_type || 'unknown',
        stabilityRating: this.calculateStabilityRating(baseClassification, changePattern),
        changeFrequency: this.determineChangeFrequency(changePattern),
        monitoringRecommendation: this.generateMonitoringRecommendation(
          baseClassification, 
          changePattern
        ),
        knownIPRanges: knownRanges,
        recentChanges: {
          lastKnownChange: changeHistory.length > 0 ? new Date(changeHistory[0].created_at) : undefined,
          changePattern: changePattern.patternType,
          seasonalVariation: changePattern.seasonality
        },
        businessContext: this.inferBusinessContext(baseClassification),
        technicalDetails: this.inferTechnicalDetails(includeDomain, knownRanges)
      };

      // Cache for 6 hours
      this.setCached(cacheKey, profile, 6 * 60 * 60 * 1000);
      
      return profile;

    } catch (error) {
      console.error(`[ESPIntelligence] Failed to get ESP profile for ${includeDomain}:`, error);
      
      // Return minimal profile on error
      return this.getMinimalESPProfile(includeDomain);
    }
  }

  /**
   * Predict the impact of detected changes based on ESP intelligence
   */
  async predictChangeImpact(
    esp: ESPIntelligence, 
    changes: string[]
  ): Promise<{
    riskLevel: 'low' | 'medium' | 'high';
    reasoning: string[];
    recommendedResponse: string;
    confidenceLevel: number;
  }> {
    try {
      console.log(`[ESPIntelligence] Predicting impact for ${esp.name} with ${changes.length} changes`);

      const reasoning: string[] = [];
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      let confidenceLevel = esp.stabilityRating * 10; // Base confidence on stability

      // Analyze change volume relative to ESP patterns
      const changeVolume = changes.length;
      const expectedVolume = this.getExpectedChangeVolume(esp);
      
      if (changeVolume > expectedVolume * 3) {
        riskLevel = 'high';
        reasoning.push(`Unusually high change volume: ${changeVolume} vs expected ${expectedVolume}`);
        confidenceLevel -= 20;
      } else if (changeVolume > expectedVolume * 1.5) {
        riskLevel = riskLevel === 'high' ? 'high' : 'medium';
        reasoning.push(`Above normal change volume: ${changeVolume} vs expected ${expectedVolume}`);
        confidenceLevel -= 10;
      }

      // Factor in ESP stability rating
      if (esp.stabilityRating <= 3) {
        riskLevel = 'high';
        reasoning.push(`Low stability ESP (${esp.stabilityRating}/10) - changes are inherently risky`);
      } else if (esp.stabilityRating <= 6) {
        riskLevel = riskLevel === 'high' ? 'high' : 'medium';
        reasoning.push(`Medium stability ESP (${esp.stabilityRating}/10) - monitor closely`);
      }

      // Consider ESP type and business criticality
      if (esp.type === 'transactional' && esp.businessContext.criticality === 'critical') {
        if (riskLevel === 'low') riskLevel = 'medium';
        reasoning.push('Critical transactional ESP - changes may impact important emails');
      }

      // Analyze change timing
      const isMaintenanceWindow = this.isMaintenanceWindow(esp);
      if (!isMaintenanceWindow && esp.changeFrequency === 'rare') {
        riskLevel = riskLevel === 'low' ? 'medium' : 'high';
        reasoning.push('Unexpected timing - changes outside normal patterns');
        confidenceLevel -= 15;
      }

      // Check for IP range expansion vs contraction
      const ipAnalysis = this.analyzeIPChanges(changes, esp.knownIPRanges);
      if (ipAnalysis.isExpansion) {
        reasoning.push('IP range expansion detected - generally safe');
        confidenceLevel += 5;
      } else if (ipAnalysis.isContraction) {
        riskLevel = riskLevel === 'low' ? 'medium' : 'high';
        reasoning.push('IP range contraction - potential service disruption');
        confidenceLevel -= 10;
      }

      // Generate recommended response
      const recommendedResponse = this.generateRecommendedResponse(riskLevel, esp, reasoning);

      return {
        riskLevel,
        reasoning,
        recommendedResponse,
        confidenceLevel: Math.max(0, Math.min(100, confidenceLevel))
      };

    } catch (error) {
      console.error('[ESPIntelligence] Failed to predict change impact:', error);
      
      return {
        riskLevel: 'medium',
        reasoning: ['Unable to analyze changes - proceed with caution'],
        recommendedResponse: 'Manual review recommended due to analysis failure',
        confidenceLevel: 0
      };
    }
  }

  /**
   * Update ESP classification with new intelligence data
   */
  async updateESPClassification(
    includeDomain: string, 
    newData: Partial<ESPIntelligence>
  ): Promise<void> {
    try {
      console.log(`[ESPIntelligence] Updating classification for: ${includeDomain}`);

      // Convert intelligence data to database format
      const updateData: any = {};
      
      if (newData.stabilityRating !== undefined) {
        updateData.is_stable = newData.stabilityRating >= 7;
      }
      
      if (newData.monitoringRecommendation?.autoUpdateSafe !== undefined) {
        updateData.consolidation_safe = newData.monitoringRecommendation.autoUpdateSafe;
      }
      
      if (newData.changeFrequency !== undefined) {
        updateData.requires_monitoring = ['daily', 'weekly'].includes(newData.changeFrequency);
      }

      // Update existing ESP classification
      const { error } = await supabase
        .from('spf_esp_classifications')
        .update(updateData)
        .eq('include_domain', includeDomain);

      if (error) {
        console.warn(`[ESPIntelligence] Failed to update classification:`, error);
        // Don't throw - this is supplementary data
      }

      // Update user-specific baseline if it exists
      if (newData.knownIPRanges) {
        await supabase
          .from('spf_esp_monitoring_baseline')
          .update({
            ip_ranges: newData.knownIPRanges,
            esp_stability_rating: newData.stabilityRating || 5,
            change_frequency: newData.changeFrequency || 'monthly'
          })
          .eq('include_domain', includeDomain)
          .eq('user_id', this.userId);
      }

      // Clear cache to force refresh
      this.cache.delete(`esp_profile_${includeDomain}`);

    } catch (error) {
      console.error(`[ESPIntelligence] Failed to update ESP classification:`, error);
      throw error;
    }
  }

  /**
   * Get risk assessment for multiple ESPs
   */
  async assessESPRisks(includeDomains: string[]): Promise<Map<string, ESPRiskAssessment>> {
    const assessments = new Map<string, ESPRiskAssessment>();

    for (const domain of includeDomains) {
      try {
        const profile = await this.getESPProfile(domain);
        const assessment = this.generateRiskAssessment(profile);
        assessments.set(domain, assessment);
      } catch (error) {
        console.warn(`[ESPIntelligence] Failed to assess risk for ${domain}:`, error);
        
        // Provide conservative assessment on error
        assessments.set(domain, {
          includeDomain: domain,
          riskLevel: 'high',
          riskFactors: ['Unable to analyze ESP - insufficient data'],
          mitigations: ['Manual monitoring required', 'Conservative update strategy'],
          monitoringRecommendations: ['Daily monitoring', 'Manual approval for changes']
        });
      }
    }

    return assessments;
  }

  /**
   * Learn from successful and failed update operations
   */
  async learnFromUpdateResults(
    includeDomain: string,
    updateSuccess: boolean,
    changes: IPChangeEvent[],
    metadata: any = {}
  ): Promise<void> {
    try {
      console.log(`[ESPIntelligence] Learning from ${updateSuccess ? 'successful' : 'failed'} update for: ${includeDomain}`);

      const currentProfile = await this.getESPProfile(includeDomain);
      
      // Adjust stability rating based on results
      let stabilityAdjustment = 0;
      if (updateSuccess) {
        // Successful updates increase confidence
        stabilityAdjustment = changes.length > 10 ? 0.1 : 0.2;
      } else {
        // Failed updates decrease confidence
        stabilityAdjustment = changes.length > 10 ? -0.5 : -0.3;
      }

      const newStabilityRating = Math.max(1, Math.min(10, 
        currentProfile.stabilityRating + stabilityAdjustment
      ));

      // Update auto-update safety based on results
      const autoUpdateSafe = updateSuccess && 
        newStabilityRating >= 7 && 
        changes.every(c => c.impact !== 'critical');

      // Learn about change patterns
      const changeFrequency = this.adjustChangeFrequency(
        currentProfile.changeFrequency,
        changes.length,
        updateSuccess
      );

      // Apply learnings
      await this.updateESPClassification(includeDomain, {
        stabilityRating: newStabilityRating,
        changeFrequency,
        monitoringRecommendation: {
          ...currentProfile.monitoringRecommendation,
          autoUpdateSafe
        }
      });

    } catch (error) {
      console.error('[ESPIntelligence] Failed to learn from update results:', error);
    }
  }

  // Private helper methods

  private async getBaseClassification(includeDomain: string): Promise<any> {
    const { data, error } = await supabase
      .from('spf_esp_classifications')
      .select('*')
      .eq('include_domain', includeDomain)
      .single();

    if (error || !data) {
      // Return unknown ESP data
      return {
        include_domain: includeDomain,
        esp_name: 'Unknown ESP',
        esp_type: 'unknown',
        is_stable: false,
        requires_monitoring: true,
        consolidation_safe: false
      };
    }

    return data;
  }

  private async getChangeHistory(includeDomain: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('spf_change_events')
      .select('*')
      .eq('include_domain', includeDomain)
      .order('created_at', { ascending: false })
      .limit(50);

    return data || [];
  }

  private analyzeChangePattern(changes: any[]): ESPChangePattern {
    if (changes.length === 0) {
      return {
        includeDomain: '',
        patternType: 'unknown',
        frequency: 0,
        predictability: 'low',
        seasonality: false,
        riskLevel: 'medium'
      };
    }

    // Calculate frequency (changes per month)
    const oldestChange = changes[changes.length - 1];
    const monthsSpan = Math.max(1, 
      (Date.now() - new Date(oldestChange.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    const frequency = changes.length / monthsSpan;

    // Analyze pattern type
    const addedChanges = changes.filter(c => c.change_type === 'added').length;
    const removedChanges = changes.filter(c => c.change_type === 'removed').length;
    
    let patternType: ESPChangePattern['patternType'] = 'unknown';
    if (addedChanges > removedChanges * 2) {
      patternType = 'expansion';
    } else if (removedChanges > addedChanges) {
      patternType = 'rotation';
    } else if (changes.some(c => c.impact_level === 'high')) {
      patternType = 'migration';
    }

    // Assess predictability
    const predictability = frequency > 2 ? 'low' : frequency > 0.5 ? 'medium' : 'high';
    
    // Check for seasonality (simplified)
    const monthlyDistribution = this.analyzeMonthlyDistribution(changes);
    const seasonality = Object.values(monthlyDistribution).some(count => count > changes.length * 0.4);

    return {
      includeDomain: changes[0]?.include_domain || '',
      patternType,
      frequency,
      predictability,
      seasonality,
      riskLevel: frequency > 4 ? 'high' : frequency > 1 ? 'medium' : 'low'
    };
  }

  private async analyzeKnownIPRanges(includeDomain: string): Promise<string[]> {
    // Get historical IP data for this include domain
    const { data } = await supabase
      .from('spf_change_events')
      .select('current_ips, previous_ips')
      .eq('include_domain', includeDomain)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!data) return [];

    // Collect all known IPs
    const allIPs = new Set<string>();
    data.forEach(change => {
      change.current_ips?.forEach((ip: string) => allIPs.add(ip));
      change.previous_ips?.forEach((ip: string) => allIPs.add(ip));
    });

    // Group IPs into ranges (simplified CIDR analysis)
    return this.groupIPsIntoRanges(Array.from(allIPs));
  }

  private calculateStabilityRating(
    classification: any, 
    changePattern: ESPChangePattern
  ): number {
    let rating = classification.is_stable ? 7 : 4; // Base rating

    // Adjust based on change frequency
    if (changePattern.frequency > 4) {
      rating -= 3; // Very frequent changes
    } else if (changePattern.frequency > 1) {
      rating -= 1; // Moderate frequency
    }

    // Adjust based on predictability
    if (changePattern.predictability === 'high') {
      rating += 1;
    } else if (changePattern.predictability === 'low') {
      rating -= 2;
    }

    return Math.max(1, Math.min(10, rating));
  }

  private determineChangeFrequency(pattern: ESPChangePattern): ESPIntelligence['changeFrequency'] {
    if (pattern.frequency > 4) return 'daily';
    if (pattern.frequency > 1) return 'weekly';
    if (pattern.frequency > 0.25) return 'monthly';
    return 'rare';
  }

  private generateMonitoringRecommendation(
    classification: any,
    pattern: ESPChangePattern
  ): ESPIntelligence['monitoringRecommendation'] {
    const baseRecommendation = {
      checkInterval: 'daily' as const,
      alertThreshold: 5,
      autoUpdateSafe: false,
      confidenceThreshold: 80
    };

    // Adjust based on stability and patterns
    if (classification.is_stable && pattern.predictability === 'high') {
      baseRecommendation.checkInterval = 'weekly';
      baseRecommendation.autoUpdateSafe = pattern.riskLevel === 'low';
      baseRecommendation.confidenceThreshold = 70;
    }

    if (pattern.frequency > 2) {
      baseRecommendation.checkInterval = 'daily';
      baseRecommendation.alertThreshold = 3;
      baseRecommendation.confidenceThreshold = 90;
    }

    return baseRecommendation;
  }

  private inferBusinessContext(classification: any): ESPIntelligence['businessContext'] {
    const typeMapping: Record<string, any> = {
      'transactional': {
        primaryUse: ['Order confirmations', 'Password resets', 'System notifications'],
        expectedVolume: 'medium',
        criticality: 'high'
      },
      'marketing': {
        primaryUse: ['Newsletters', 'Promotional campaigns', 'Customer engagement'],
        expectedVolume: 'high',
        criticality: 'medium'
      },
      'enterprise': {
        primaryUse: ['Business communications', 'Internal systems', 'Customer support'],
        expectedVolume: 'medium',
        criticality: 'critical'
      },
      'infrastructure': {
        primaryUse: ['System alerts', 'Monitoring', 'Infrastructure notifications'],
        expectedVolume: 'low',
        criticality: 'high'
      }
    };

    return typeMapping[classification.esp_type] || {
      primaryUse: ['Unknown'],
      expectedVolume: 'medium',
      criticality: 'medium'
    };
  }

  private inferTechnicalDetails(
    includeDomain: string, 
    knownRanges: string[]
  ): ESPIntelligence['technicalDetails'] {
    const hasIPv6 = knownRanges.some(range => range.includes(':'));
    const rangeCount = knownRanges.length;
    
    return {
      supportsIPv6: hasIPv6,
      usesCDN: rangeCount > 20, // Heuristic: many ranges might indicate CDN
      hasRedundancy: rangeCount > 5,
      maintenanceWindows: this.inferMaintenanceWindows(includeDomain)
    };
  }

  private inferMaintenanceWindows(includeDomain: string): string[] {
    // This would be enhanced with actual data analysis
    const commonPatterns: Record<string, string[]> = {
      'sendgrid': ['Sunday 02:00-04:00 UTC'],
      'mailgun': ['Sunday 01:00-03:00 UTC'], 
      'mandrill': ['Saturday 23:00-01:00 UTC']
    };

    const domain = includeDomain.toLowerCase();
    for (const [key, windows] of Object.entries(commonPatterns)) {
      if (domain.includes(key)) {
        return windows;
      }
    }

    return [];
  }

  private getMinimalESPProfile(includeDomain: string): ESPIntelligence {
    return {
      name: 'Unknown ESP',
      includeDomain,
      type: 'unknown',
      stabilityRating: 5,
      changeFrequency: 'monthly',
      monitoringRecommendation: {
        checkInterval: 'daily',
        alertThreshold: 5,
        autoUpdateSafe: false,
        confidenceThreshold: 90
      },
      knownIPRanges: [],
      recentChanges: {},
      businessContext: {
        primaryUse: ['Unknown'],
        expectedVolume: 'medium',
        criticality: 'medium'
      },
      technicalDetails: {
        supportsIPv6: false,
        usesCDN: false,
        hasRedundancy: false
      }
    };
  }

  // Additional helper methods would go here...
  private getExpectedChangeVolume(esp: ESPIntelligence): number {
    const baseVolume = esp.changeFrequency === 'daily' ? 10 : 
                     esp.changeFrequency === 'weekly' ? 5 :
                     esp.changeFrequency === 'monthly' ? 2 : 1;
    
    return baseVolume * (esp.businessContext.expectedVolume === 'high' ? 2 : 1);
  }

  private isMaintenanceWindow(esp: ESPIntelligence): boolean {
    // Simplified check - would be enhanced with actual schedule analysis
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    
    // Most ESPs do maintenance on weekends, early morning UTC
    return (day === 0 || day === 6) && (hour >= 0 && hour <= 6);
  }

  private analyzeIPChanges(changes: string[], knownRanges: string[]): {
    isExpansion: boolean;
    isContraction: boolean;
    isWithinKnownRanges: boolean;
  } {
    // Simplified analysis - would be enhanced with actual IP range analysis
    const totalChanges = changes.length;
    const newIPs = changes.filter(ip => !knownRanges.some(range => this.ipInRange(ip, range)));
    
    return {
      isExpansion: newIPs.length > 0,
      isContraction: newIPs.length === 0 && totalChanges > 0,
      isWithinKnownRanges: newIPs.length === 0
    };
  }

  private ipInRange(ip: string, range: string): boolean {
    // Simplified range check - would use proper CIDR analysis
    if (range.includes('/')) {
      const baseIP = range.split('/')[0];
      return ip.startsWith(baseIP.split('.').slice(0, -1).join('.'));
    }
    return ip === range;
  }

  private generateRecommendedResponse(
    riskLevel: 'low' | 'medium' | 'high',
    esp: ESPIntelligence,
    reasoning: string[]
  ): string {
    if (riskLevel === 'high') {
      return `Immediate manual review required for ${esp.name}. Monitor for authentication failures and consider rollback plan.`;
    }
    
    if (riskLevel === 'medium') {
      return `Review changes for ${esp.name} within 24 hours. Consider gradual deployment with monitoring.`;
    }

    return `Changes for ${esp.name} appear safe. Monitor for 48 hours after deployment.`;
  }

  private generateRiskAssessment(profile: ESPIntelligence): ESPRiskAssessment {
    const riskFactors: string[] = [];
    const mitigations: string[] = [];
    const monitoringRecommendations: string[] = [];

    // Assess risk factors
    if (profile.stabilityRating <= 5) {
      riskFactors.push('Low stability rating');
      mitigations.push('Require manual approval for all changes');
    }

    if (profile.changeFrequency === 'daily') {
      riskFactors.push('Frequent changes expected');
      monitoringRecommendations.push('Daily monitoring recommended');
    }

    if (profile.businessContext.criticality === 'critical') {
      riskFactors.push('Critical business function');
      mitigations.push('Implement rollback procedures');
    }

    // Determine overall risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (riskFactors.length > 2 || profile.stabilityRating <= 3) {
      riskLevel = 'high';
    } else if (riskFactors.length > 0 || profile.stabilityRating <= 6) {
      riskLevel = 'medium';
    }

    return {
      includeDomain: profile.includeDomain,
      riskLevel,
      riskFactors,
      mitigations,
      monitoringRecommendations
    };
  }

  private analyzeMonthlyDistribution(changes: any[]): Record<number, number> {
    const distribution: Record<number, number> = {};
    
    changes.forEach(change => {
      const month = new Date(change.created_at).getMonth();
      distribution[month] = (distribution[month] || 0) + 1;
    });

    return distribution;
  }

  private groupIPsIntoRanges(ips: string[]): string[] {
    // Simplified CIDR grouping - would be enhanced with proper IP analysis
    const ranges = new Set<string>();
    
    ips.forEach(ip => {
      if (ip.includes(':')) {
        // IPv6 - simplified grouping
        const parts = ip.split(':');
        if (parts.length >= 4) {
          ranges.add(`${parts.slice(0, 4).join(':')}::/64`);
        }
      } else {
        // IPv4 - group by /24
        const parts = ip.split('.');
        if (parts.length === 4) {
          ranges.add(`${parts.slice(0, 3).join('.')}.0/24`);
        }
      }
    });

    return Array.from(ranges);
  }

  private adjustChangeFrequency(
    current: ESPIntelligence['changeFrequency'],
    changeCount: number,
    updateSuccess: boolean
  ): ESPIntelligence['changeFrequency'] {
    // Learning algorithm to adjust frequency based on observations
    if (!updateSuccess) {
      // Failed updates suggest we're missing patterns
      return current; // Don't adjust on failures
    }

    // Successful updates with high change counts might indicate higher frequency
    if (changeCount > 10) {
      return current === 'rare' ? 'monthly' : 
             current === 'monthly' ? 'weekly' : current;
    }

    return current;
  }

  // Cache utilities
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached || Date.now() > cached.timestamp + cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    return cached.data;
  }

  private setCached<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
}

/**
 * Factory function to create ESP intelligence engine
 */
export function createESPIntelligenceEngine(userId: string): ESPIntelligenceEngine {
  return new ESPIntelligenceEngine(userId);
}

/**
 * Utility function to get ESP recommendations for monitoring setup
 */
export async function getESPMonitoringRecommendations(
  includeDomains: string[],
  userId: string
): Promise<Map<string, {
  shouldMonitor: boolean;
  checkInterval: 'hourly' | 'daily' | 'weekly';
  autoUpdateRecommended: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string[];
}>> {
  const engine = new ESPIntelligenceEngine(userId);
  const recommendations = new Map();

  for (const domain of includeDomains) {
    try {
      const profile = await engine.getESPProfile(domain);
      const risk = await engine.assessESPRisks([domain]);
      const assessment = risk.get(domain);

      recommendations.set(domain, {
        shouldMonitor: profile.monitoringRecommendation.checkInterval !== 'weekly',
        checkInterval: profile.monitoringRecommendation.checkInterval,
        autoUpdateRecommended: profile.monitoringRecommendation.autoUpdateSafe,
        riskLevel: assessment?.riskLevel || 'medium',
        reasoning: assessment?.riskFactors || ['ESP analysis unavailable']
      });
    } catch (error) {
      console.warn(`Failed to get recommendations for ${domain}:`, error);
      recommendations.set(domain, {
        shouldMonitor: true,
        checkInterval: 'daily' as const,
        autoUpdateRecommended: false,
        riskLevel: 'high' as const,
        reasoning: ['Unable to analyze ESP']
      });
    }
  }

  return recommendations;
}