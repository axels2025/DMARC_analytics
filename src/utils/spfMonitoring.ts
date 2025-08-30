import { parseSPFRecord, SPFRecord } from './spfParser';
import { supabase } from '@/integrations/supabase/client';

export interface SPFMonitoringConfig {
  domain: string;
  monitoringEnabled: boolean;
  checkInterval: 'hourly' | 'daily' | 'weekly';
  alertThreshold: number;
  autoUpdate: boolean;
  notificationMethods: ('email' | 'webhook' | 'dashboard')[];
  includeMonitoring: {
    [includeDomain: string]: {
      enabled: boolean;
      lastKnownIPs: string[];
      changeDetectionSensitivity: 'low' | 'medium' | 'high';
    };
  };
}

export interface IPChangeEvent {
  domain: string;
  includeDomain: string;
  espName?: string;
  changeType: 'added' | 'removed' | 'modified';
  previousIPs: string[];
  currentIPs: string[];
  impact: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: string;
  timestamp: Date;
  autoUpdateSafe: boolean;
  riskFactors: string[];
}

export interface MonitoringResult {
  domain: string;
  status: 'healthy' | 'changed' | 'error';
  changes: IPChangeEvent[];
  lastChecked: Date;
  nextCheck: Date;
  errors: string[];
}

export interface ESPStabilityProfile {
  includeDomain: string;
  espName: string;
  isStable: boolean;
  requiresMonitoring: boolean;
  checkFrequency: 'hourly' | 'daily' | 'weekly';
  changeFrequency: 'rare' | 'monthly' | 'weekly' | 'daily';
  autoUpdateSafe: boolean;
  knownIPRanges: string[];
  lastKnownChange?: Date;
}

/**
 * Main monitoring orchestrator that coordinates SPF change detection
 * and integrates with existing ESP classification system
 */
export class SPFMonitor {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  constructor(private userId: string) {}

  /**
   * Check for changes in a specific domain's SPF record and its includes
   */
  async checkDomainChanges(domain: string): Promise<IPChangeEvent[]> {
    try {
      console.log(`[SPFMonitor] Checking changes for domain: ${domain}`);

      // Get current SPF record
      const currentRecord = await parseSPFRecord(domain);
      if (!currentRecord.isValid) {
        throw new Error(`Invalid SPF record for ${domain}: ${currentRecord.errors.join(', ')}`);
      }

      // Get baseline data for this domain
      const baseline = await this.getMonitoringBaseline(domain);
      if (!baseline) {
        // First time monitoring - establish baseline
        await this.establishBaseline(domain, currentRecord);
        return [];
      }

      const changes: IPChangeEvent[] = [];
      
      // Check each include mechanism for changes
      const includeMechanisms = currentRecord.mechanisms.filter(m => m.type === 'include');
      
      for (const mechanism of includeMechanisms) {
        const includeDomain = mechanism.value;
        const baselineData = baseline.includeMonitoring[includeDomain];
        
        if (!baselineData?.enabled) continue;

        try {
          const currentIPs = await this.resolveIncludeIPs(includeDomain);
          const previousIPs = baselineData.lastKnownIPs;

          const changeEvent = await this.detectIPChanges(
            domain,
            includeDomain,
            previousIPs,
            currentIPs,
            baselineData.changeDetectionSensitivity
          );

          if (changeEvent) {
            changes.push(changeEvent);
            
            // Update baseline with new IPs
            await this.updateBaseline(domain, includeDomain, currentIPs);
          }
        } catch (includeError) {
          console.warn(`[SPFMonitor] Failed to check include ${includeDomain}:`, includeError);
        }
      }

      // Log monitoring result
      await this.logMonitoringResult(domain, changes.length > 0 ? 'changed' : 'healthy', changes);

      return changes;

    } catch (error) {
      console.error(`[SPFMonitor] Failed to check domain changes for ${domain}:`, error);
      await this.logMonitoringResult(domain, 'error', [], [error instanceof Error ? error.message : 'Unknown error']);
      throw error;
    }
  }

  /**
   * Check all monitored domains for a user
   */
  async checkAllMonitoredDomains(userId: string): Promise<Map<string, IPChangeEvent[]>> {
    try {
      console.log(`[SPFMonitor] Checking all monitored domains for user: ${userId}`);

      // Get all monitored domains for this user
      const { data: monitoringSettings, error } = await supabase
        .from('user_spf_monitoring')
        .select('domain, monitor_enabled, auto_update')
        .eq('user_id', userId)
        .eq('monitor_enabled', true);

      if (error) throw error;

      const results = new Map<string, IPChangeEvent[]>();
      
      for (const setting of monitoringSettings || []) {
        try {
          const changes = await this.checkDomainChanges(setting.domain);
          results.set(setting.domain, changes);
          
          // If auto-update is enabled and changes are safe, trigger update
          if (setting.auto_update && changes.length > 0) {
            const safeChanges = changes.filter(c => c.autoUpdateSafe);
            if (safeChanges.length > 0) {
              console.log(`[SPFMonitor] Auto-update triggered for ${setting.domain}`);
              // This would trigger the dynamic updater
              // await this.triggerAutoUpdate(setting.domain, safeChanges);
            }
          }
        } catch (domainError) {
          console.warn(`[SPFMonitor] Failed to check domain ${setting.domain}:`, domainError);
          results.set(setting.domain, []);
        }
      }

      return results;

    } catch (error) {
      console.error('[SPFMonitor] Failed to check all monitored domains:', error);
      throw error;
    }
  }

  /**
   * Get ESP stability rating for intelligent monitoring
   */
  async getESPStabilityRating(includeDomain: string): Promise<ESPStabilityProfile> {
    try {
      // Try to get from cache first
      const cacheKey = `esp_stability_${includeDomain}`;
      const cached = this.getCached(cacheKey);
      if (cached) return cached;

      // Get ESP classification from existing database
      const { data: espData, error } = await supabase
        .from('spf_esp_classifications')
        .select('*')
        .eq('include_domain', includeDomain)
        .single();

      let profile: ESPStabilityProfile;

      if (espData && !error) {
        // Use existing classification data
        profile = {
          includeDomain: espData.include_domain,
          espName: espData.esp_name,
          isStable: espData.is_stable,
          requiresMonitoring: espData.requires_monitoring,
          checkFrequency: espData.is_stable ? 'weekly' : 'daily',
          changeFrequency: espData.is_stable ? 'rare' : 'weekly',
          autoUpdateSafe: espData.consolidation_safe,
          knownIPRanges: [], // Would be populated from historical data
        };
      } else {
        // Unknown ESP - use conservative defaults
        profile = {
          includeDomain,
          espName: 'Unknown ESP',
          isStable: false,
          requiresMonitoring: true,
          checkFrequency: 'daily',
          changeFrequency: 'weekly',
          autoUpdateSafe: false,
          knownIPRanges: [],
        };
      }

      // Cache for 1 hour
      this.setCached(cacheKey, profile, 60 * 60 * 1000);
      return profile;

    } catch (error) {
      console.error(`[SPFMonitor] Failed to get ESP stability rating for ${includeDomain}:`, error);
      
      // Return conservative defaults on error
      return {
        includeDomain,
        espName: 'Unknown ESP',
        isStable: false,
        requiresMonitoring: true,
        checkFrequency: 'daily',
        changeFrequency: 'weekly',
        autoUpdateSafe: false,
        knownIPRanges: [],
      };
    }
  }

  /**
   * Detect IP changes between previous and current state
   */
  private async detectIPChanges(
    domain: string,
    includeDomain: string,
    previousIPs: string[],
    currentIPs: string[],
    sensitivity: 'low' | 'medium' | 'high'
  ): Promise<IPChangeEvent | null> {
    const added = currentIPs.filter(ip => !previousIPs.includes(ip));
    const removed = previousIPs.filter(ip => !currentIPs.includes(ip));

    // No changes detected
    if (added.length === 0 && removed.length === 0) {
      return null;
    }

    // Get ESP profile for impact assessment
    const espProfile = await this.getESPStabilityRating(includeDomain);

    // Determine change type
    let changeType: 'added' | 'removed' | 'modified';
    if (added.length > 0 && removed.length === 0) {
      changeType = 'added';
    } else if (added.length === 0 && removed.length > 0) {
      changeType = 'removed';
    } else {
      changeType = 'modified';
    }

    // Assess impact based on sensitivity and ESP profile
    const impact = this.assessChangeImpact(added, removed, espProfile, sensitivity);
    
    // Determine if auto-update is safe
    const autoUpdateSafe = this.isAutoUpdateSafe(changeType, impact, espProfile);
    
    // Generate recommended action
    const recommendedAction = this.generateRecommendedAction(changeType, impact, espProfile);

    // Identify risk factors
    const riskFactors = this.identifyRiskFactors(added, removed, espProfile);

    return {
      domain,
      includeDomain,
      espName: espProfile.espName,
      changeType,
      previousIPs,
      currentIPs,
      impact,
      recommendedAction,
      timestamp: new Date(),
      autoUpdateSafe,
      riskFactors
    };
  }

  /**
   * Assess the impact level of IP changes
   */
  private assessChangeImpact(
    added: string[],
    removed: string[],
    espProfile: ESPStabilityProfile,
    sensitivity: 'low' | 'medium' | 'high'
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical: Many IPs removed from stable ESP
    if (removed.length > 5 && espProfile.isStable) {
      return 'critical';
    }

    // High: Any removals from unstable ESP or major changes to stable ESP
    if (removed.length > 0 && !espProfile.isStable) {
      return 'high';
    }
    if ((added.length + removed.length) > 10 && espProfile.isStable) {
      return 'high';
    }

    // Medium: Moderate changes based on sensitivity
    const totalChanges = added.length + removed.length;
    if (sensitivity === 'high' && totalChanges > 1) {
      return 'medium';
    }
    if (sensitivity === 'medium' && totalChanges > 3) {
      return 'medium';
    }
    if (sensitivity === 'low' && totalChanges > 5) {
      return 'medium';
    }

    // Low: Minor changes
    return 'low';
  }

  /**
   * Determine if automatic update is safe for this change
   */
  private isAutoUpdateSafe(
    changeType: 'added' | 'removed' | 'modified',
    impact: 'low' | 'medium' | 'high' | 'critical',
    espProfile: ESPStabilityProfile
  ): boolean {
    // Never auto-update critical or high impact changes
    if (impact === 'critical' || impact === 'high') {
      return false;
    }

    // Never auto-update if ESP is not marked as safe for consolidation
    if (!espProfile.autoUpdateSafe) {
      return false;
    }

    // Never auto-update removals unless it's a stable ESP with low impact
    if (changeType === 'removed' && !(espProfile.isStable && impact === 'low')) {
      return false;
    }

    // Only auto-update additions and modifications for stable ESPs with low/medium impact
    return espProfile.isStable && (impact === 'low' || impact === 'medium');
  }

  /**
   * Generate recommended action text
   */
  private generateRecommendedAction(
    changeType: 'added' | 'removed' | 'modified',
    impact: 'low' | 'medium' | 'high' | 'critical',
    espProfile: ESPStabilityProfile
  ): string {
    if (impact === 'critical') {
      return 'Immediate review required - significant IP changes detected that may break email authentication';
    }

    if (impact === 'high') {
      return 'Review recommended within 24 hours - monitor for authentication failures';
    }

    if (changeType === 'added') {
      return impact === 'medium' 
        ? 'Consider updating SPF record to include new IPs - monitor for a few days first'
        : 'New IPs detected - safe to add to SPF record';
    }

    if (changeType === 'removed') {
      return 'IPs removed from ESP - verify they are no longer needed before removing from SPF';
    }

    return 'IP addresses modified - review changes and update SPF record as needed';
  }

  /**
   * Identify specific risk factors
   */
  private identifyRiskFactors(
    added: string[],
    removed: string[],
    espProfile: ESPStabilityProfile
  ): string[] {
    const risks: string[] = [];

    if (!espProfile.isStable) {
      risks.push('ESP marked as unstable');
    }

    if (!espProfile.autoUpdateSafe) {
      risks.push('ESP not recommended for automatic updates');
    }

    if (removed.length > 0) {
      risks.push('IP addresses removed - potential authentication failures');
    }

    if (added.length > 10) {
      risks.push('Large number of new IPs - verify legitimacy');
    }

    if (espProfile.changeFrequency === 'daily') {
      risks.push('ESP changes IPs frequently');
    }

    return risks;
  }

  /**
   * Resolve include mechanism to current IP addresses
   */
  private async resolveIncludeIPs(includeDomain: string): Promise<string[]> {
    try {
      // Use existing DNS lookup function with caching
      const response = await fetch('https://epzcwplbouhbucbmhcur.supabase.co/functions/v1/dns-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwemN3cGxib3VoYnVjYm1oY3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTk5NDIsImV4cCI6MjA2ODI5NTk0Mn0.l54eLAp-3kwOHvF3qTVMDVTorYGzGeMmju1YsIFFUeU`
        },
        body: JSON.stringify({
          spfMonitor: {
            domain: includeDomain,
            includes: [includeDomain],
            compareToBaseline: false
          }
        })
      });

      if (!response.ok) {
        throw new Error(`DNS lookup failed: ${response.status}`);
      }

      const result = await response.json();
      return result.resolvedIPs || [];

    } catch (error) {
      console.error(`[SPFMonitor] Failed to resolve IPs for ${includeDomain}:`, error);
      throw error;
    }
  }

  /**
   * Get monitoring baseline for a domain
   */
  private async getMonitoringBaseline(domain: string): Promise<SPFMonitoringConfig | null> {
    try {
      const { data: config, error } = await supabase
        .from('user_spf_monitoring')
        .select('*')
        .eq('user_id', this.userId)
        .eq('domain', domain)
        .single();

      if (error || !config) return null;

      // Get include baselines
      const { data: baselines, error: baselineError } = await supabase
        .from('spf_esp_monitoring_baseline')
        .select('*')
        .eq('user_id', this.userId)
        .eq('domain', domain);

      if (baselineError) {
        console.warn('[SPFMonitor] Failed to fetch baselines:', baselineError);
      }

      const includeMonitoring: SPFMonitoringConfig['includeMonitoring'] = {};
      
      (baselines || []).forEach(baseline => {
        includeMonitoring[baseline.include_domain] = {
          enabled: baseline.monitoring_enabled,
          lastKnownIPs: baseline.baseline_ips,
          changeDetectionSensitivity: 'medium' // Default, could be stored in config
        };
      });

      return {
        domain: config.domain,
        monitoringEnabled: config.monitor_enabled,
        checkInterval: 'daily', // Default, could be stored in config
        alertThreshold: config.alert_threshold,
        autoUpdate: config.auto_update || false,
        notificationMethods: ['dashboard'], // Default, could be expanded
        includeMonitoring
      };

    } catch (error) {
      console.error(`[SPFMonitor] Failed to get baseline for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Establish baseline for first-time monitoring
   */
  private async establishBaseline(domain: string, record: SPFRecord): Promise<void> {
    try {
      console.log(`[SPFMonitor] Establishing baseline for ${domain}`);

      const includeMechanisms = record.mechanisms.filter(m => m.type === 'include');
      
      for (const mechanism of includeMechanisms) {
        const includeDomain = mechanism.value;
        
        try {
          const currentIPs = await this.resolveIncludeIPs(includeDomain);
          
          await supabase
            .from('spf_esp_monitoring_baseline')
            .upsert({
              user_id: this.userId,
              domain,
              include_domain: includeDomain,
              baseline_ips: currentIPs,
              monitoring_enabled: true,
              last_verified: new Date().toISOString()
            }, {
              onConflict: 'user_id,domain,include_domain'
            });

        } catch (includeError) {
          console.warn(`[SPFMonitor] Failed to establish baseline for ${includeDomain}:`, includeError);
        }
      }

    } catch (error) {
      console.error(`[SPFMonitor] Failed to establish baseline for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Update baseline with new IP addresses
   */
  private async updateBaseline(domain: string, includeDomain: string, newIPs: string[]): Promise<void> {
    try {
      await supabase
        .from('spf_esp_monitoring_baseline')
        .update({
          baseline_ips: newIPs,
          last_verified: new Date().toISOString()
        })
        .eq('user_id', this.userId)
        .eq('domain', domain)
        .eq('include_domain', includeDomain);

    } catch (error) {
      console.error(`[SPFMonitor] Failed to update baseline for ${includeDomain}:`, error);
    }
  }

  /**
   * Log monitoring result to database
   */
  private async logMonitoringResult(
    domain: string, 
    status: 'healthy' | 'changed' | 'error',
    changes: IPChangeEvent[],
    errors: string[] = []
  ): Promise<void> {
    try {
      // Update last checked time
      await supabase
        .from('user_spf_monitoring')
        .update({
          last_checked_at: new Date().toISOString(),
          last_change_detected: changes.length > 0 ? new Date().toISOString() : undefined
        })
        .eq('user_id', this.userId)
        .eq('domain', domain);

      // Log change events
      if (changes.length > 0) {
        const changeEvents = changes.map(change => ({
          user_id: this.userId,
          domain: change.domain,
          include_domain: change.includeDomain,
          esp_name: change.espName,
          change_type: change.changeType,
          previous_ips: change.previousIPs,
          current_ips: change.currentIPs,
          impact_level: change.impact,
          auto_updated: false // Will be updated by the dynamic updater if applicable
        }));

        await supabase
          .from('spf_change_events')
          .insert(changeEvents);
      }

    } catch (error) {
      console.error('[SPFMonitor] Failed to log monitoring result:', error);
    }
  }

  // Cache management utilities
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
 * Factory function to create a monitor instance
 */
export function createSPFMonitor(userId: string): SPFMonitor {
  return new SPFMonitor(userId);
}

/**
 * Utility function to get monitoring recommendations for a domain
 */
export async function getMonitoringRecommendations(domain: string): Promise<{
  shouldMonitor: boolean;
  recommendedInterval: 'hourly' | 'daily' | 'weekly';
  riskFactors: string[];
  autoUpdateSafe: boolean;
}> {
  try {
    const record = await parseSPFRecord(domain);
    if (!record.isValid) {
      return {
        shouldMonitor: false,
        recommendedInterval: 'daily',
        riskFactors: ['Invalid SPF record'],
        autoUpdateSafe: false
      };
    }

    const includeMechanisms = record.mechanisms.filter(m => m.type === 'include');
    const riskFactors: string[] = [];
    let highestRiskInterval: 'hourly' | 'daily' | 'weekly' = 'weekly';
    let anyAutoUpdateUnsafe = false;

    // Check each include for ESP stability
    for (const mechanism of includeMechanisms) {
      const { data: espData } = await supabase
        .from('spf_esp_classifications')
        .select('*')
        .eq('include_domain', mechanism.value)
        .single();

      if (espData) {
        if (!espData.is_stable) {
          riskFactors.push(`${espData.esp_name} is unstable`);
          highestRiskInterval = 'daily';
        }
        if (espData.requires_monitoring) {
          riskFactors.push(`${espData.esp_name} requires active monitoring`);
          if (highestRiskInterval === 'weekly') highestRiskInterval = 'daily';
        }
        if (!espData.consolidation_safe) {
          anyAutoUpdateUnsafe = true;
          riskFactors.push(`${espData.esp_name} not safe for automatic updates`);
        }
      } else {
        riskFactors.push(`Unknown ESP: ${mechanism.value}`);
        highestRiskInterval = 'daily';
        anyAutoUpdateUnsafe = true;
      }
    }

    // High lookup count increases risk
    if (record.totalLookups >= 8) {
      riskFactors.push('High DNS lookup count');
      if (highestRiskInterval === 'weekly') highestRiskInterval = 'daily';
    }

    return {
      shouldMonitor: includeMechanisms.length > 0,
      recommendedInterval: highestRiskInterval,
      riskFactors,
      autoUpdateSafe: !anyAutoUpdateUnsafe && riskFactors.length === 0
    };

  } catch (error) {
    console.error('[getMonitoringRecommendations] Failed to get recommendations:', error);
    return {
      shouldMonitor: false,
      recommendedInterval: 'daily',
      riskFactors: ['Unable to analyze domain'],
      autoUpdateSafe: false
    };
  }
}