import { parseSPFRecord, SPFRecord, analyzeSPFRecord, SPFAnalysis } from './spfParser';
import { validateFlattenedRecord } from './spfFlattening';
import { IPChangeEvent } from './spfMonitoring';
import { supabase } from '@/integrations/supabase/client';

export interface UpdateStrategy {
  strategy: 'immediate' | 'scheduled' | 'manual_approval';
  confidenceThreshold: number;
  rollbackPlan: boolean;
  testingRequired: boolean;
  maxChangesPerDay: number;
  notifyBeforeUpdate: boolean;
}

export interface UpdateRecommendation {
  updateRecommendation: 'update' | 'hold' | 'alert_only';
  confidence: number;
  reasoning: string[];
  newRecord?: string;
  riskAssessment: 'low' | 'medium' | 'high' | 'critical';
  rollbackRequired: boolean;
  testingRecommended: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  lookupCount: number;
  errors: string[];
  warnings: string[];
  recordSize: number;
  passesTests: boolean;
  potentialIssues: string[];
}

export interface GeneratedUpdate {
  updatedRecord: string;
  validationResults: ValidationResult;
  rollbackRecord: string;
  changesSummary: {
    addedIPs: string[];
    removedIPs: string[];
    modifiedIncludes: string[];
    impactedESPs: string[];
  };
  recommendedTesting: string[];
}

/**
 * Smart Update System for Dynamic SPF Management
 * Integrates with existing SPF infrastructure to provide intelligent updates
 */
export class DynamicSPFUpdater {
  private userId: string;
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Analyzes changes and determines update strategy
   */
  async analyzeChanges(changes: IPChangeEvent[]): Promise<UpdateRecommendation> {
    try {
      console.log(`[DynamicSPFUpdater] Analyzing ${changes.length} changes`);

      if (changes.length === 0) {
        return {
          updateRecommendation: 'hold',
          confidence: 100,
          reasoning: ['No changes detected'],
          riskAssessment: 'low',
          rollbackRequired: false,
          testingRecommended: false
        };
      }

      // Group changes by domain for analysis
      const domainChanges = new Map<string, IPChangeEvent[]>();
      changes.forEach(change => {
        if (!domainChanges.has(change.domain)) {
          domainChanges.set(change.domain, []);
        }
        domainChanges.get(change.domain)!.push(change);
      });

      let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
      let overallConfidence = 100;
      const reasoning: string[] = [];
      let requiresUpdate = false;
      let rollbackRequired = false;
      let testingRecommended = false;

      // Analyze each domain's changes
      for (const [domain, domainChangeList] of domainChanges) {
        const analysis = await this.analyzeDomainChanges(domain, domainChangeList);
        
        // Aggregate risk assessment
        if (analysis.riskLevel === 'critical' || overallRisk === 'critical') {
          overallRisk = 'critical';
        } else if (analysis.riskLevel === 'high' || overallRisk === 'high') {
          overallRisk = 'high';
        } else if (analysis.riskLevel === 'medium' || overallRisk === 'medium') {
          overallRisk = 'medium';
        }

        // Adjust confidence based on analysis
        overallConfidence = Math.min(overallConfidence, analysis.confidence);
        
        reasoning.push(...analysis.reasoning);

        if (analysis.requiresUpdate) {
          requiresUpdate = true;
        }

        if (analysis.rollbackRequired) {
          rollbackRequired = true;
        }

        if (analysis.testingRecommended) {
          testingRecommended = true;
        }
      }

      // Determine final recommendation
      let updateRecommendation: 'update' | 'hold' | 'alert_only';

      if (overallRisk === 'critical') {
        updateRecommendation = 'alert_only';
        reasoning.push('Critical risk detected - manual intervention required');
      } else if (overallRisk === 'high') {
        updateRecommendation = requiresUpdate ? 'hold' : 'alert_only';
        reasoning.push('High risk - requires careful review before updating');
      } else if (overallConfidence < 70) {
        updateRecommendation = 'hold';
        reasoning.push('Low confidence in analysis - additional review needed');
      } else if (requiresUpdate) {
        updateRecommendation = 'update';
      } else {
        updateRecommendation = 'alert_only';
        reasoning.push('Changes detected but no immediate update required');
      }

      return {
        updateRecommendation,
        confidence: overallConfidence,
        reasoning: [...new Set(reasoning)], // Remove duplicates
        riskAssessment: overallRisk,
        rollbackRequired,
        testingRecommended
      };

    } catch (error) {
      console.error('[DynamicSPFUpdater] Failed to analyze changes:', error);
      
      return {
        updateRecommendation: 'alert_only',
        confidence: 0,
        reasoning: [`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        riskAssessment: 'critical',
        rollbackRequired: true,
        testingRecommended: true
      };
    }
  }

  /**
   * Generates updated SPF record incorporating changes
   */
  async generateUpdatedRecord(
    originalRecord: string,
    changes: IPChangeEvent[],
    strategy: UpdateStrategy
  ): Promise<GeneratedUpdate> {
    try {
      console.log(`[DynamicSPFUpdater] Generating updated record for ${changes.length} changes`);

      // Parse the original record
      const parsedRecord = await parseSPFRecord(changes[0]?.domain || '');
      if (!parsedRecord.isValid) {
        throw new Error(`Invalid original SPF record: ${parsedRecord.errors.join(', ')}`);
      }

      // Group changes by include domain
      const includeChanges = new Map<string, IPChangeEvent>();
      changes.forEach(change => {
        includeChanges.set(change.includeDomain, change);
      });

      // Generate the updated record
      const updatedRecord = this.buildUpdatedSPFRecord(parsedRecord, includeChanges);
      
      // Validate the updated record
      const validationResults = await this.validateUpdate(changes[0].domain, updatedRecord);
      
      // Generate rollback record (current record)
      const rollbackRecord = parsedRecord.raw;
      
      // Create changes summary
      const changesSummary = this.createChangesSummary(changes);
      
      // Generate testing recommendations
      const recommendedTesting = this.generateTestingRecommendations(changes, strategy);

      return {
        updatedRecord,
        validationResults,
        rollbackRecord,
        changesSummary,
        recommendedTesting
      };

    } catch (error) {
      console.error('[DynamicSPFUpdater] Failed to generate updated record:', error);
      throw error;
    }
  }

  /**
   * Validates proposed changes won't break authentication
   */
  async validateUpdate(domain: string, proposedRecord: string): Promise<ValidationResult> {
    try {
      console.log(`[DynamicSPFUpdater] Validating proposed update for ${domain}`);

      // Use existing validation from flattening utils
      const basicValidation = validateFlattenedRecord(proposedRecord);
      
      // Additional SPF-specific validation
      const parsedRecord = await parseSPFRecord(domain, proposedRecord);
      const analysis = await analyzeSPFRecord(parsedRecord);

      // Perform advanced validation checks
      const potentialIssues = this.identifyPotentialIssues(parsedRecord, analysis);
      const passesTests = this.performSafetyTests(parsedRecord);

      return {
        isValid: basicValidation.isValid && parsedRecord.isValid,
        lookupCount: basicValidation.lookupCount,
        errors: [...basicValidation.errors, ...parsedRecord.errors],
        warnings: [...basicValidation.warnings, ...parsedRecord.warnings],
        recordSize: basicValidation.recordSize,
        passesTests,
        potentialIssues
      };

    } catch (error) {
      console.error(`[DynamicSPFUpdater] Validation failed for ${domain}:`, error);
      
      return {
        isValid: false,
        lookupCount: 0,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: [],
        recordSize: proposedRecord.length,
        passesTests: false,
        potentialIssues: ['Validation process failed']
      };
    }
  }

  /**
   * Execute automatic update with safeguards
   */
  async executeUpdate(
    domain: string,
    updatedRecord: string,
    strategy: UpdateStrategy,
    changes: IPChangeEvent[]
  ): Promise<{
    success: boolean;
    recordDeployed: string;
    rollbackPlan: string;
    errors: string[];
    warnings: string[];
  }> {
    try {
      console.log(`[DynamicSPFUpdater] Executing update for ${domain} with strategy: ${strategy.strategy}`);

      // Pre-update validation
      const validation = await this.validateUpdate(domain, updatedRecord);
      if (!validation.isValid) {
        throw new Error(`Update validation failed: ${validation.errors.join(', ')}`);
      }

      // Check safeguards
      const safeguardCheck = await this.checkUpdateSafeguards(domain, strategy, changes);
      if (!safeguardCheck.approved) {
        throw new Error(`Safeguard check failed: ${safeguardCheck.reasoning.join(', ')}`);
      }

      // Create rollback plan
      const rollbackPlan = await this.createRollbackPlan(domain, updatedRecord);
      
      // For demo purposes, we'll simulate the update
      // In a real implementation, this would interact with DNS provider APIs
      const deploymentResult = await this.simulateRecordDeployment(domain, updatedRecord);

      // Log the update operation
      await this.logUpdateOperation(domain, updatedRecord, rollbackPlan, changes);

      // Mark changes as auto-updated in database
      await this.markChangesAsUpdated(changes);

      return {
        success: deploymentResult.success,
        recordDeployed: deploymentResult.deployedRecord,
        rollbackPlan: rollbackPlan.instructions.join('; '),
        errors: deploymentResult.errors,
        warnings: validation.warnings
      };

    } catch (error) {
      console.error(`[DynamicSPFUpdater] Update execution failed for ${domain}:`, error);
      
      return {
        success: false,
        recordDeployed: '',
        rollbackPlan: '',
        errors: [error instanceof Error ? error.message : 'Update failed'],
        warnings: []
      };
    }
  }

  /**
   * Analyze changes for a specific domain
   */
  private async analyzeDomainChanges(domain: string, changes: IPChangeEvent[]): Promise<{
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    reasoning: string[];
    requiresUpdate: boolean;
    rollbackRequired: boolean;
    testingRecommended: boolean;
  }> {
    const reasoning: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let confidence = 90;
    let requiresUpdate = false;
    let rollbackRequired = false;
    let testingRecommended = false;

    // Analyze each change
    for (const change of changes) {
      // Assess individual change risk
      if (change.impact === 'critical') {
        riskLevel = 'critical';
        reasoning.push(`Critical change detected in ${change.includeDomain}`);
        rollbackRequired = true;
        testingRecommended = true;
      } else if (change.impact === 'high') {
        riskLevel = riskLevel === 'critical' ? 'critical' : 'high';
        reasoning.push(`High impact change in ${change.includeDomain}`);
        testingRecommended = true;
      }

      // Check if change type requires update
      if (change.changeType === 'added' && change.autoUpdateSafe) {
        requiresUpdate = true;
        reasoning.push(`Safe to add new IPs from ${change.includeDomain}`);
      } else if (change.changeType === 'removed') {
        requiresUpdate = true;
        rollbackRequired = true;
        reasoning.push(`IPs removed from ${change.includeDomain} - may affect authentication`);
      } else if (change.changeType === 'modified') {
        requiresUpdate = true;
        testingRecommended = true;
        reasoning.push(`IP modifications in ${change.includeDomain} require review`);
      }

      // Adjust confidence based on risk factors
      if (change.riskFactors.length > 0) {
        confidence -= change.riskFactors.length * 10;
        reasoning.push(`Risk factors for ${change.includeDomain}: ${change.riskFactors.join(', ')}`);
      }
    }

    // Check historical update frequency
    const updateFrequency = await this.getUpdateFrequency(domain);
    if (updateFrequency.todayCount >= 5) {
      riskLevel = 'high';
      confidence -= 20;
      reasoning.push('Multiple updates today - proceed with caution');
    }

    return {
      riskLevel,
      confidence: Math.max(0, confidence),
      reasoning,
      requiresUpdate,
      rollbackRequired,
      testingRecommended
    };
  }

  /**
   * Build updated SPF record with changes
   */
  private buildUpdatedSPFRecord(
    originalRecord: SPFRecord,
    includeChanges: Map<string, IPChangeEvent>
  ): string {
    const parts: string[] = [originalRecord.version];

    // Process each mechanism and apply changes where applicable
    for (const mechanism of originalRecord.mechanisms) {
      if (mechanism.type === 'include') {
        const change = includeChanges.get(mechanism.value);
        
        if (change && change.changeType === 'added') {
          // Keep the include and add new IPs directly
          const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
          parts.push(`${qualifier}include:${mechanism.value}`);
          
          // Add new IPs as ip4/ip6 mechanisms
          const addedIPs = change.currentIPs.filter(ip => !change.previousIPs.includes(ip));
          for (const ip of addedIPs) {
            if (ip.includes(':')) {
              parts.push(`ip6:${ip}`);
            } else {
              parts.push(`ip4:${ip}`);
            }
          }
        } else if (change && change.changeType === 'removed') {
          // Keep the include - removal is more complex and should be manual
          const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
          parts.push(`${qualifier}include:${mechanism.value}`);
          
          // Note: Removing IPs is dangerous and should be done manually
          // The system will alert but not auto-remove
        } else {
          // No change or non-safe change - keep as is
          const qualifier = mechanism.qualifier === '+' ? '' : mechanism.qualifier;
          const value = mechanism.value ? `:${mechanism.value}` : '';
          parts.push(`${qualifier}${mechanism.type}${value}`);
        }
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
   * Create summary of changes
   */
  private createChangesSummary(changes: IPChangeEvent[]): {
    addedIPs: string[];
    removedIPs: string[];
    modifiedIncludes: string[];
    impactedESPs: string[];
  } {
    const addedIPs: string[] = [];
    const removedIPs: string[] = [];
    const modifiedIncludes: string[] = [];
    const impactedESPs: string[] = [];

    changes.forEach(change => {
      const added = change.currentIPs.filter(ip => !change.previousIPs.includes(ip));
      const removed = change.previousIPs.filter(ip => !change.currentIPs.includes(ip));

      addedIPs.push(...added);
      removedIPs.push(...removed);
      modifiedIncludes.push(change.includeDomain);
      
      if (change.espName) {
        impactedESPs.push(change.espName);
      }
    });

    return {
      addedIPs: [...new Set(addedIPs)],
      removedIPs: [...new Set(removedIPs)],
      modifiedIncludes: [...new Set(modifiedIncludes)],
      impactedESPs: [...new Set(impactedESPs)]
    };
  }

  /**
   * Generate testing recommendations
   */
  private generateTestingRecommendations(changes: IPChangeEvent[], strategy: UpdateStrategy): string[] {
    const recommendations: string[] = [];

    if (strategy.testingRequired) {
      recommendations.push('Send test emails through updated SPF record before full deployment');
    }

    // Check for high-risk changes
    const highRiskChanges = changes.filter(c => c.impact === 'high' || c.impact === 'critical');
    if (highRiskChanges.length > 0) {
      recommendations.push('Perform gradual rollout with monitoring');
      recommendations.push('Test authentication with major email providers');
    }

    // ESP-specific recommendations
    const unstableESPs = changes.filter(c => c.riskFactors.includes('ESP marked as unstable'));
    if (unstableESPs.length > 0) {
      recommendations.push('Monitor ESP stability before and after update');
    }

    return recommendations;
  }

  /**
   * Identify potential issues with the proposed record
   */
  private identifyPotentialIssues(record: SPFRecord, analysis: SPFAnalysis): string[] {
    const issues: string[] = [];

    if (record.totalLookups >= 10) {
      issues.push('Record exceeds 10 DNS lookup limit');
    }

    if (record.totalLookups >= 8) {
      issues.push('Record approaching DNS lookup limit');
    }

    if (record.raw.length > 255) {
      issues.push('Record exceeds 255 character DNS TXT limit');
    }

    if (analysis.riskLevel === 'high' || analysis.riskLevel === 'critical') {
      issues.push('SPF analysis indicates high risk configuration');
    }

    return issues;
  }

  /**
   * Perform safety tests on the record
   */
  private performSafetyTests(record: SPFRecord): boolean {
    // Basic safety checks
    if (!record.isValid) return false;
    if (record.totalLookups > 10) return false;
    if (record.raw.length > 500) return false; // Conservative limit

    // Check for dangerous configurations
    const hasSoftFail = record.mechanisms.some(m => m.qualifier === '~');
    const hasHardFail = record.mechanisms.some(m => m.qualifier === '-');
    
    // Must have some form of policy
    return hasSoftFail || hasHardFail;
  }

  /**
   * Check update safeguards
   */
  private async checkUpdateSafeguards(
    domain: string,
    strategy: UpdateStrategy,
    changes: IPChangeEvent[]
  ): Promise<{
    approved: boolean;
    reasoning: string[];
  }> {
    const reasoning: string[] = [];
    
    // Check update frequency limits
    const updateFreq = await this.getUpdateFrequency(domain);
    if (updateFreq.todayCount >= strategy.maxChangesPerDay) {
      return {
        approved: false,
        reasoning: [`Exceeded maximum updates per day (${strategy.maxChangesPerDay})`]
      };
    }

    // Check confidence threshold
    const analysis = await this.analyzeChanges(changes);
    if (analysis.confidence < strategy.confidenceThreshold) {
      return {
        approved: false,
        reasoning: [`Confidence ${analysis.confidence}% below threshold ${strategy.confidenceThreshold}%`]
      };
    }

    // Check for critical changes
    const criticalChanges = changes.filter(c => c.impact === 'critical');
    if (criticalChanges.length > 0) {
      return {
        approved: false,
        reasoning: ['Critical changes require manual approval']
      };
    }

    return {
      approved: true,
      reasoning: ['All safeguard checks passed']
    };
  }

  /**
   * Create rollback plan
   */
  private async createRollbackPlan(domain: string, proposedRecord: string): Promise<{
    rollbackRecord: string;
    instructions: string[];
  }> {
    // Get current record
    const currentRecord = await parseSPFRecord(domain);
    
    return {
      rollbackRecord: currentRecord.raw,
      instructions: [
        `Revert SPF record for ${domain}`,
        `Replace: ${proposedRecord}`,
        `With: ${currentRecord.raw}`,
        'Monitor authentication for 24 hours after rollback'
      ]
    };
  }

  /**
   * Simulate record deployment (for demo)
   */
  private async simulateRecordDeployment(domain: string, record: string): Promise<{
    success: boolean;
    deployedRecord: string;
    errors: string[];
  }> {
    // Simulate deployment process
    console.log(`[DynamicSPFUpdater] Simulating deployment for ${domain}`);
    
    // In real implementation, this would:
    // 1. Connect to DNS provider API
    // 2. Update TXT record
    // 3. Verify propagation
    
    return {
      success: true,
      deployedRecord: record,
      errors: []
    };
  }

  /**
   * Log update operation
   */
  private async logUpdateOperation(
    domain: string,
    updatedRecord: string,
    rollbackPlan: { rollbackRecord: string; instructions: string[] },
    changes: IPChangeEvent[]
  ): Promise<void> {
    try {
      // This would log to an audit table in the real implementation
      console.log(`[DynamicSPFUpdater] Logging update operation for ${domain}`);
      
      // Store in flattening operations table as dynamic update
      await supabase
        .from('spf_flattening_operations')
        .insert({
          user_id: this.userId,
          domain,
          operation_type: 'flatten', // Using existing structure
          status: 'completed',
          original_record: rollbackPlan.rollbackRecord,
          original_lookup_count: 0, // Would be calculated
          target_includes: changes.map(c => c.includeDomain),
          flattening_options: { note: 'Dynamic update operation' },
          flattened_record: updatedRecord,
          new_lookup_count: 0, // Would be calculated
          warnings: [],
          errors: []
        });

    } catch (error) {
      console.error('[DynamicSPFUpdater] Failed to log operation:', error);
    }
  }

  /**
   * Mark changes as auto-updated
   */
  private async markChangesAsUpdated(changes: IPChangeEvent[]): Promise<void> {
    try {
      // Update change events to mark as auto-updated
      for (const change of changes) {
        await supabase
          .from('spf_change_events')
          .update({ auto_updated: true })
          .eq('domain', change.domain)
          .eq('include_domain', change.includeDomain)
          .eq('change_type', change.changeType);
      }

    } catch (error) {
      console.error('[DynamicSPFUpdater] Failed to mark changes as updated:', error);
    }
  }

  /**
   * Get update frequency for domain
   */
  private async getUpdateFrequency(domain: string): Promise<{
    todayCount: number;
    weekCount: number;
    lastUpdate?: Date;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: todayUpdates } = await supabase
        .from('spf_flattening_operations')
        .select('id')
        .eq('user_id', this.userId)
        .eq('domain', domain)
        .gte('created_at', today.toISOString());

      const { data: weekUpdates } = await supabase
        .from('spf_flattening_operations')
        .select('id, created_at')
        .eq('user_id', this.userId)
        .eq('domain', domain)
        .gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      return {
        todayCount: todayUpdates?.length || 0,
        weekCount: weekUpdates?.length || 0,
        lastUpdate: weekUpdates?.[0]?.created_at ? new Date(weekUpdates[0].created_at) : undefined
      };

    } catch (error) {
      console.error('[DynamicSPFUpdater] Failed to get update frequency:', error);
      return { todayCount: 0, weekCount: 0 };
    }
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
 * Factory function to create updater instance
 */
export function createDynamicSPFUpdater(userId: string): DynamicSPFUpdater {
  return new DynamicSPFUpdater(userId);
}

/**
 * Default update strategies
 */
export const UpdateStrategies = {
  CONSERVATIVE: {
    strategy: 'manual_approval' as const,
    confidenceThreshold: 90,
    rollbackPlan: true,
    testingRequired: true,
    maxChangesPerDay: 2,
    notifyBeforeUpdate: true
  },
  BALANCED: {
    strategy: 'scheduled' as const,
    confidenceThreshold: 80,
    rollbackPlan: true,
    testingRequired: false,
    maxChangesPerDay: 5,
    notifyBeforeUpdate: true
  },
  AGGRESSIVE: {
    strategy: 'immediate' as const,
    confidenceThreshold: 70,
    rollbackPlan: true,
    testingRequired: false,
    maxChangesPerDay: 10,
    notifyBeforeUpdate: false
  }
};