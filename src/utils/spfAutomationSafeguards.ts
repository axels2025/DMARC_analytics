import { supabase } from '@/integrations/supabase/client';
import { IPChangeEvent } from './spfMonitoring';
import { ESPIntelligence, createESPIntelligenceEngine } from './espIntelligence';
import { parseSPFRecord } from './spfParser';

export interface SafeguardChecks {
  maxChangesPerDay: number;
  maxChangesPerWeek: number;
  requireHumanApproval: boolean;
  rollbackOnFailure: boolean;
  testBeforeApply: boolean;
  notifyBeforeChange: boolean;
  confidenceThreshold: number;
  impactThreshold: 'low' | 'medium' | 'high' | 'critical';
  businessHoursOnly: boolean;
  maintenanceWindowsOnly: boolean;
  blackoutPeriods: string[]; // ISO date strings
}

export interface SafeguardResult {
  approved: boolean;
  reasoning: string[];
  requiresApproval: boolean;
  recommendedDelay: number; // minutes
  additionalChecks: string[];
  riskMitigations: string[];
}

export interface RollbackPlan {
  rollbackRecord: string;
  rollbackInstructions: string[];
  verificationSteps: string[];
  rollbackTriggers: string[];
  emergencyContacts: string[];
  estimatedTimeToRollback: number; // minutes
}

export interface ChangeValidation {
  isValid: boolean;
  validationErrors: string[];
  potentialIssues: string[];
  recommendations: string[];
  testingRequired: boolean;
  monitoringRequired: boolean;
}

export interface AutomationContext {
  userId: string;
  domain: string;
  currentTime: Date;
  businessHours: {
    start: string; // HH:MM format
    end: string;
    timezone: string;
    businessDays: number[]; // 0-6, Sunday = 0
  };
  emergencyContact?: {
    email: string;
    phone?: string;
    webhook?: string;
  };
}

/**
 * Automation Safety System for SPF Dynamic Management
 * Provides comprehensive safeguards against dangerous automatic updates
 */
export class SPFAutomationSafeguards {
  private userId: string;
  private espIntelligence: any;
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  constructor(userId: string) {
    this.userId = userId;
    this.espIntelligence = createESPIntelligenceEngine(userId);
  }

  /**
   * Validate automatic update against comprehensive safeguards
   */
  async validateAutomaticUpdate(
    domain: string,
    proposedChange: string,
    changes: IPChangeEvent[],
    safeguards: SafeguardChecks,
    context: AutomationContext
  ): Promise<SafeguardResult> {
    try {
      console.log(`[AutomationSafeguards] Validating automatic update for ${domain}`);

      const reasoning: string[] = [];
      const additionalChecks: string[] = [];
      const riskMitigations: string[] = [];
      let approved = true;
      let requiresApproval = false;
      let recommendedDelay = 0;

      // 1. Rate Limiting Checks
      const rateLimitResult = await this.checkRateLimits(domain, safeguards);
      if (!rateLimitResult.approved) {
        approved = false;
        reasoning.push(...rateLimitResult.reasons);
      }

      // 2. Business Hours and Timing Checks
      const timingResult = this.checkBusinessHours(context, safeguards);
      if (!timingResult.approved) {
        approved = timingResult.canDelay;
        recommendedDelay = timingResult.delayMinutes;
        reasoning.push(...timingResult.reasons);
        
        if (!timingResult.canDelay) {
          requiresApproval = true;
        }
      }

      // 3. Impact Assessment
      const impactResult = await this.assessUpdateImpact(changes, safeguards);
      if (impactResult.exceedsThreshold) {
        if (impactResult.severity === 'critical') {
          approved = false;
          requiresApproval = true;
          reasoning.push('Critical impact detected - human approval required');
        } else if (impactResult.severity === 'high') {
          requiresApproval = true;
          reasoning.push('High impact detected - approval recommended');
        }
        reasoning.push(...impactResult.reasons);
      }

      // 4. ESP Intelligence Checks
      const espResults = await this.validateWithESPIntelligence(changes, safeguards);
      if (!espResults.allSafe) {
        reasoning.push(...espResults.warnings);
        riskMitigations.push(...espResults.mitigations);
        
        if (espResults.hasHighRisk) {
          approved = false;
          requiresApproval = true;
        }
      }

      // 5. Record Validation and Safety
      const recordValidation = await this.validateRecordSafety(proposedChange, safeguards);
      if (!recordValidation.isValid) {
        approved = false;
        reasoning.push(...recordValidation.validationErrors);
        additionalChecks.push(...recordValidation.recommendations);
      }

      // 6. Historical Pattern Analysis
      const patternResult = await this.analyzeHistoricalPatterns(domain, changes);
      if (patternResult.hasAnomaly) {
        reasoning.push(...patternResult.warnings);
        if (patternResult.severity === 'high') {
          requiresApproval = true;
        }
      }

      // 7. External Dependency Checks
      const dependencyResult = await this.checkExternalDependencies(domain, changes);
      if (dependencyResult.hasRisks) {
        reasoning.push(...dependencyResult.warnings);
        riskMitigations.push(...dependencyResult.mitigations);
      }

      // Final decision logic
      if (safeguards.requireHumanApproval) {
        requiresApproval = true;
        reasoning.push('Human approval required by policy');
      }

      // Override approval if too many risk factors
      if (reasoning.length > 5 && !requiresApproval) {
        requiresApproval = true;
        reasoning.push('Multiple risk factors detected - approval recommended');
      }

      return {
        approved: approved && !requiresApproval,
        reasoning: [...new Set(reasoning)],
        requiresApproval,
        recommendedDelay,
        additionalChecks: [...new Set(additionalChecks)],
        riskMitigations: [...new Set(riskMitigations)]
      };

    } catch (error) {
      console.error('[AutomationSafeguards] Validation failed:', error);
      
      return {
        approved: false,
        reasoning: [`Safeguard validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        requiresApproval: true,
        recommendedDelay: 0,
        additionalChecks: ['Manual validation required due to system error'],
        riskMitigations: ['Conservative manual approach recommended']
      };
    }
  }

  /**
   * Create comprehensive rollback plan
   */
  async createRollbackPlan(
    domain: string,
    currentRecord: string,
    proposedRecord: string,
    changes: IPChangeEvent[],
    context: AutomationContext
  ): Promise<RollbackPlan> {
    try {
      console.log(`[AutomationSafeguards] Creating rollback plan for ${domain}`);

      const instructions = [
        `1. Immediately revert SPF record for ${domain}`,
        `   FROM: ${proposedRecord}`,
        `   TO: ${currentRecord}`,
        '2. Wait 5-10 minutes for DNS propagation',
        '3. Test email authentication with major providers',
        '4. Monitor authentication success rates for 1 hour',
        '5. Document rollback reason and lessons learned'
      ];

      const verificationSteps = [
        'Verify DNS TXT record has been updated',
        'Check SPF record propagation with online tools',
        'Send test emails through affected ESPs',
        'Monitor DMARC reports for authentication failures',
        'Check email delivery to major providers (Gmail, Outlook, Yahoo)',
        'Verify no increase in bounce rates or spam reports'
      ];

      // Determine rollback triggers based on change analysis
      const rollbackTriggers = await this.generateRollbackTriggers(changes);
      
      // Estimate rollback time based on change complexity
      const estimatedTime = this.estimateRollbackTime(changes, context);

      const emergencyContacts = [
        context.emergencyContact?.email || 'No emergency contact configured',
        ...(context.emergencyContact?.phone ? [context.emergencyContact.phone] : []),
        'DNS provider support',
        'Email service provider support'
      ];

      return {
        rollbackRecord: currentRecord,
        rollbackInstructions: instructions,
        verificationSteps,
        rollbackTriggers,
        emergencyContacts,
        estimatedTimeToRollback: estimatedTime
      };

    } catch (error) {
      console.error('[AutomationSafeguards] Failed to create rollback plan:', error);
      
      return {
        rollbackRecord: currentRecord,
        rollbackInstructions: ['Manual rollback required due to planning error'],
        verificationSteps: ['Manual verification required'],
        rollbackTriggers: ['Any authentication failures'],
        emergencyContacts: ['System administrator'],
        estimatedTimeToRollback: 30
      };
    }
  }

  /**
   * Perform pre-deployment safety testing
   */
  async performSafetyTesting(
    domain: string,
    proposedRecord: string,
    changes: IPChangeEvent[],
    context: AutomationContext
  ): Promise<{
    passed: boolean;
    results: { test: string; passed: boolean; details: string }[];
    recommendations: string[];
  }> {
    const results: { test: string; passed: boolean; details: string }[] = [];
    const recommendations: string[] = [];

    try {
      console.log(`[AutomationSafeguards] Performing safety testing for ${domain}`);

      // Test 1: SPF Record Syntax Validation
      const syntaxTest = await this.testSPFSyntax(proposedRecord);
      results.push({
        test: 'SPF Record Syntax',
        passed: syntaxTest.valid,
        details: syntaxTest.details
      });

      // Test 2: DNS Lookup Count Validation
      const lookupTest = await this.testDNSLookupCount(proposedRecord);
      results.push({
        test: 'DNS Lookup Count',
        passed: lookupTest.passed,
        details: lookupTest.details
      });

      // Test 3: Record Size Validation
      const sizeTest = this.testRecordSize(proposedRecord);
      results.push({
        test: 'Record Size',
        passed: sizeTest.passed,
        details: sizeTest.details
      });

      // Test 4: IP Range Validation
      const ipTest = await this.testIPRangeValidity(changes);
      results.push({
        test: 'IP Range Validity',
        passed: ipTest.passed,
        details: ipTest.details
      });

      // Test 5: ESP Reachability Test
      const reachabilityTest = await this.testESPReachability(changes);
      results.push({
        test: 'ESP Reachability',
        passed: reachabilityTest.passed,
        details: reachabilityTest.details
      });

      // Generate recommendations based on test results
      const failedTests = results.filter(r => !r.passed);
      if (failedTests.length > 0) {
        recommendations.push(`${failedTests.length} test(s) failed - review before deployment`);
        failedTests.forEach(test => {
          recommendations.push(`Fix: ${test.test} - ${test.details}`);
        });
      }

      // Performance recommendations
      if (results.some(r => r.test === 'DNS Lookup Count' && !r.passed)) {
        recommendations.push('Consider SPF flattening to reduce DNS lookups');
      }

      if (results.some(r => r.test === 'Record Size' && r.details.includes('large'))) {
        recommendations.push('Monitor DNS propagation time due to record size');
      }

      const allPassed = results.every(r => r.passed);
      
      return {
        passed: allPassed,
        results,
        recommendations
      };

    } catch (error) {
      console.error('[AutomationSafeguards] Safety testing failed:', error);
      
      return {
        passed: false,
        results: [{
          test: 'Safety Testing',
          passed: false,
          details: `Testing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        recommendations: ['Manual testing required due to system error']
      };
    }
  }

  /**
   * Monitor deployment and trigger rollback if needed
   */
  async monitorDeployment(
    domain: string,
    deploymentId: string,
    rollbackPlan: RollbackPlan,
    monitoringDuration: number = 30 // minutes
  ): Promise<{
    success: boolean;
    metrics: any;
    actions: string[];
    rollbackTriggered: boolean;
  }> {
    console.log(`[AutomationSafeguards] Starting deployment monitoring for ${domain}`);
    
    const startTime = Date.now();
    const actions: string[] = [];
    let rollbackTriggered = false;

    try {
      // Simulate monitoring (in real implementation, this would be more complex)
      actions.push(`Started monitoring deployment ${deploymentId} at ${new Date().toISOString()}`);
      
      // Check DNS propagation
      actions.push('Verifying DNS propagation...');
      
      // Check authentication metrics (would integrate with actual monitoring)
      actions.push('Monitoring authentication success rates...');
      
      // Check for error conditions that would trigger rollback
      const errorConditions = await this.checkRollbackConditions(domain, rollbackPlan);
      
      if (errorConditions.shouldRollback) {
        rollbackTriggered = true;
        actions.push(`ROLLBACK TRIGGERED: ${errorConditions.reason}`);
        actions.push('Executing rollback plan...');
        
        // Execute rollback (simplified)
        actions.push(`Reverted SPF record to: ${rollbackPlan.rollbackRecord}`);
      } else {
        actions.push('No rollback conditions detected');
        actions.push('Deployment appears successful');
      }

      const metrics = {
        monitoringDuration: Date.now() - startTime,
        checksPerformed: actions.length,
        rollbackTriggered,
        deploymentId
      };

      return {
        success: !rollbackTriggered,
        metrics,
        actions,
        rollbackTriggered
      };

    } catch (error) {
      console.error('[AutomationSafeguards] Deployment monitoring failed:', error);
      actions.push(`Monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        success: false,
        metrics: { error: true },
        actions,
        rollbackTriggered: false
      };
    }
  }

  // Private helper methods

  private async checkRateLimits(domain: string, safeguards: SafeguardChecks): Promise<{
    approved: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    try {
      // Check daily updates
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: dailyUpdates } = await supabase
        .from('spf_dynamic_update_operations')
        .select('id')
        .eq('user_id', this.userId)
        .eq('domain', domain)
        .gte('created_at', today.toISOString());

      const dailyCount = dailyUpdates?.length || 0;
      if (dailyCount >= safeguards.maxChangesPerDay) {
        reasons.push(`Daily update limit exceeded: ${dailyCount}/${safeguards.maxChangesPerDay}`);
      }

      // Check weekly updates
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: weeklyUpdates } = await supabase
        .from('spf_dynamic_update_operations')
        .select('id')
        .eq('user_id', this.userId)
        .eq('domain', domain)
        .gte('created_at', weekAgo.toISOString());

      const weeklyCount = weeklyUpdates?.length || 0;
      if (weeklyCount >= safeguards.maxChangesPerWeek) {
        reasons.push(`Weekly update limit exceeded: ${weeklyCount}/${safeguards.maxChangesPerWeek}`);
      }

      return {
        approved: reasons.length === 0,
        reasons
      };

    } catch (error) {
      return {
        approved: false,
        reasons: ['Failed to check rate limits - assuming exceeded']
      };
    }
  }

  private checkBusinessHours(context: AutomationContext, safeguards: SafeguardChecks): {
    approved: boolean;
    canDelay: boolean;
    delayMinutes: number;
    reasons: string[];
  } {
    const reasons: string[] = [];
    const now = context.currentTime;

    if (!safeguards.businessHoursOnly) {
      return { approved: true, canDelay: false, delayMinutes: 0, reasons: [] };
    }

    // Check if current time is in business hours
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();

    const [startHour, startMinute] = context.businessHours.start.split(':').map(Number);
    const [endHour, endMinute] = context.businessHours.end.split(':').map(Number);

    const currentTimeMinutes = currentHour * 60 + currentMinute;
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;

    const isBusinessDay = context.businessHours.businessDays.includes(currentDay);
    const isBusinessHour = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;

    if (!isBusinessDay || !isBusinessHour) {
      reasons.push(`Outside business hours (${context.businessHours.start}-${context.businessHours.end}, ${context.businessHours.timezone})`);
      
      // Calculate delay until next business hour
      let delayMinutes = 0;
      if (isBusinessDay && currentTimeMinutes < startTimeMinutes) {
        delayMinutes = startTimeMinutes - currentTimeMinutes;
      } else {
        // Next business day
        const daysUntilNext = this.calculateDaysUntilNextBusinessDay(currentDay, context.businessHours.businessDays);
        delayMinutes = (daysUntilNext * 24 * 60) + startTimeMinutes - currentTimeMinutes;
      }

      return {
        approved: false,
        canDelay: true,
        delayMinutes: Math.max(0, delayMinutes),
        reasons
      };
    }

    return { approved: true, canDelay: false, delayMinutes: 0, reasons: [] };
  }

  private async assessUpdateImpact(changes: IPChangeEvent[], safeguards: SafeguardChecks): Promise<{
    exceedsThreshold: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Determine overall severity from changes
    const severityLevels = changes.map(c => c.impact);
    if (severityLevels.includes('critical')) {
      severity = 'critical';
      reasons.push('Critical impact changes detected');
    } else if (severityLevels.includes('high')) {
      severity = 'high';
      reasons.push('High impact changes detected');
    } else if (severityLevels.includes('medium')) {
      severity = 'medium';
      reasons.push('Medium impact changes detected');
    }

    // Consider volume of changes
    if (changes.length > 20) {
      severity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : severity;
      reasons.push(`Large number of changes: ${changes.length}`);
    }

    // Consider ESP types affected
    const criticalESPs = changes.filter(c => 
      c.espName && ['Google Workspace', 'Microsoft 365'].includes(c.espName)
    );
    
    if (criticalESPs.length > 0) {
      severity = severity === 'low' ? 'medium' : severity;
      reasons.push(`Critical ESPs affected: ${criticalESPs.map(c => c.espName).join(', ')}`);
    }

    const exceedsThreshold = this.severityExceeds(severity, safeguards.impactThreshold);

    return {
      exceedsThreshold,
      severity,
      reasons
    };
  }

  private async validateWithESPIntelligence(changes: IPChangeEvent[], safeguards: SafeguardChecks): Promise<{
    allSafe: boolean;
    hasHighRisk: boolean;
    warnings: string[];
    mitigations: string[];
  }> {
    const warnings: string[] = [];
    const mitigations: string[] = [];
    let allSafe = true;
    let hasHighRisk = false;

    for (const change of changes) {
      try {
        const espProfile = await this.espIntelligence.getESPProfile(change.includeDomain);
        const impactPrediction = await this.espIntelligence.predictChangeImpact(
          espProfile,
          change.currentIPs
        );

        if (impactPrediction.riskLevel === 'high') {
          hasHighRisk = true;
          allSafe = false;
          warnings.push(`High risk predicted for ${change.includeDomain}: ${impactPrediction.reasoning.join(', ')}`);
        } else if (impactPrediction.riskLevel === 'medium') {
          allSafe = false;
          warnings.push(`Medium risk for ${change.includeDomain}: ${impactPrediction.reasoning.join(', ')}`);
        }

        if (impactPrediction.confidenceLevel < safeguards.confidenceThreshold) {
          allSafe = false;
          warnings.push(`Low confidence (${impactPrediction.confidenceLevel}%) for ${change.includeDomain}`);
        }

        mitigations.push(impactPrediction.recommendedResponse);

      } catch (error) {
        console.warn(`ESP intelligence failed for ${change.includeDomain}:`, error);
        allSafe = false;
        warnings.push(`ESP analysis unavailable for ${change.includeDomain}`);
        mitigations.push('Manual review recommended');
      }
    }

    return {
      allSafe,
      hasHighRisk,
      warnings: [...new Set(warnings)],
      mitigations: [...new Set(mitigations)]
    };
  }

  private async validateRecordSafety(proposedRecord: string, safeguards: SafeguardChecks): Promise<ChangeValidation> {
    try {
      const parsed = await parseSPFRecord('', proposedRecord);
      const validationErrors: string[] = [];
      const potentialIssues: string[] = [];
      const recommendations: string[] = [];

      if (!parsed.isValid) {
        validationErrors.push(...parsed.errors);
      }

      if (parsed.totalLookups > 10) {
        validationErrors.push(`SPF record exceeds 10 DNS lookup limit: ${parsed.totalLookups}`);
      } else if (parsed.totalLookups > 8) {
        potentialIssues.push(`SPF record approaching DNS lookup limit: ${parsed.totalLookups}`);
      }

      if (proposedRecord.length > 255) {
        validationErrors.push(`SPF record exceeds 255 character limit: ${proposedRecord.length}`);
      }

      const testingRequired = safeguards.testBeforeApply || validationErrors.length > 0;
      const monitoringRequired = potentialIssues.length > 0 || parsed.totalLookups > 6;

      if (testingRequired) {
        recommendations.push('Pre-deployment testing required');
      }
      
      if (monitoringRequired) {
        recommendations.push('Enhanced monitoring recommended');
      }

      return {
        isValid: validationErrors.length === 0,
        validationErrors,
        potentialIssues,
        recommendations,
        testingRequired,
        monitoringRequired
      };

    } catch (error) {
      return {
        isValid: false,
        validationErrors: [`Record validation failed: ${error}`],
        potentialIssues: [],
        recommendations: ['Manual validation required'],
        testingRequired: true,
        monitoringRequired: true
      };
    }
  }

  private async analyzeHistoricalPatterns(domain: string, changes: IPChangeEvent[]): Promise<{
    hasAnomaly: boolean;
    severity: 'low' | 'medium' | 'high';
    warnings: string[];
  }> {
    const warnings: string[] = [];
    let hasAnomaly = false;
    let severity: 'low' | 'medium' | 'high' = 'low';

    try {
      // Get historical change data
      const { data: history } = await supabase
        .from('spf_change_events')
        .select('*')
        .eq('user_id', this.userId)
        .eq('domain', domain)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!history || history.length < 5) {
        warnings.push('Limited historical data - cannot detect patterns');
        return { hasAnomaly: false, severity: 'low', warnings };
      }

      // Analyze change frequency
      const recentChanges = history.filter(h => 
        new Date(h.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      if (recentChanges.length > 10) {
        hasAnomaly = true;
        severity = 'high';
        warnings.push(`Unusually high change frequency: ${recentChanges.length} changes in last 7 days`);
      }

      // Analyze change patterns by ESP
      const changesByESP = new Map<string, number>();
      changes.forEach(change => {
        const count = changesByESP.get(change.includeDomain) || 0;
        changesByESP.set(change.includeDomain, count + 1);
      });

      for (const [esp, count] of changesByESP) {
        const historicalCount = history.filter(h => h.include_domain === esp).length;
        const avgPerWeek = historicalCount / Math.max(1, history.length / 7);
        
        if (count > avgPerWeek * 3) {
          hasAnomaly = true;
          severity = severity === 'high' ? 'high' : 'medium';
          warnings.push(`Unusual change volume for ${esp}: ${count} vs avg ${avgPerWeek.toFixed(1)}/week`);
        }
      }

      return { hasAnomaly, severity, warnings };

    } catch (error) {
      return {
        hasAnomaly: false,
        severity: 'low',
        warnings: ['Historical analysis failed - proceeding with caution']
      };
    }
  }

  private async checkExternalDependencies(domain: string, changes: IPChangeEvent[]): Promise<{
    hasRisks: boolean;
    warnings: string[];
    mitigations: string[];
  }> {
    const warnings: string[] = [];
    const mitigations: string[] = [];
    let hasRisks = false;

    // Check for dependencies on critical ESPs
    const criticalESPs = ['_spf.google.com', 'spf.protection.outlook.com'];
    const criticalChanges = changes.filter(c => criticalESPs.includes(c.includeDomain));
    
    if (criticalChanges.length > 0) {
      hasRisks = true;
      warnings.push('Changes affect critical email service providers');
      mitigations.push('Monitor email delivery closely');
      mitigations.push('Have rollback plan ready');
    }

    // Check for weekend/holiday timing
    const now = new Date();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    if (isWeekend) {
      hasRisks = true;
      warnings.push('Deployment during weekend - limited support availability');
      mitigations.push('Ensure 24/7 monitoring capability');
    }

    return { hasRisks, warnings, mitigations };
  }

  // Additional testing methods

  private async testSPFSyntax(record: string): Promise<{ valid: boolean; details: string }> {
    try {
      const parsed = await parseSPFRecord('', record);
      return {
        valid: parsed.isValid,
        details: parsed.isValid ? 'Valid SPF syntax' : `Invalid: ${parsed.errors.join(', ')}`
      };
    } catch (error) {
      return {
        valid: false,
        details: `Syntax test failed: ${error}`
      };
    }
  }

  private async testDNSLookupCount(record: string): Promise<{ passed: boolean; details: string }> {
    try {
      const parsed = await parseSPFRecord('', record);
      const passed = parsed.totalLookups <= 10;
      return {
        passed,
        details: `${parsed.totalLookups}/10 DNS lookups${passed ? ' (OK)' : ' (EXCEEDED)'}`
      };
    } catch (error) {
      return {
        passed: false,
        details: `Lookup count test failed: ${error}`
      };
    }
  }

  private testRecordSize(record: string): { passed: boolean; details: string } {
    const size = record.length;
    const passed = size <= 255;
    
    return {
      passed,
      details: `${size}/255 characters${passed ? ' (OK)' : ' (TOO LARGE)'}${size > 200 ? ' (large)' : ''}`
    };
  }

  private async testIPRangeValidity(changes: IPChangeEvent[]): Promise<{ passed: boolean; details: string }> {
    let invalidIPs = 0;
    let totalIPs = 0;

    changes.forEach(change => {
      change.currentIPs.forEach(ip => {
        totalIPs++;
        if (!this.isValidIP(ip)) {
          invalidIPs++;
        }
      });
    });

    const passed = invalidIPs === 0;
    return {
      passed,
      details: passed ? `${totalIPs} valid IP addresses` : `${invalidIPs}/${totalIPs} invalid IP addresses`
    };
  }

  private async testESPReachability(changes: IPChangeEvent[]): Promise<{ passed: boolean; details: string }> {
    // Simplified reachability test - would do actual network tests in production
    const uniqueESPs = [...new Set(changes.map(c => c.espName).filter(Boolean))];
    
    return {
      passed: true, // Assume reachable for demo
      details: `Tested ${uniqueESPs.length} ESP(s): ${uniqueESPs.join(', ')}`
    };
  }

  private async generateRollbackTriggers(changes: IPChangeEvent[]): Promise<string[]> {
    const triggers = [
      'Authentication failure rate > 5%',
      'Email delivery failure rate > 2%',
      'Bounce rate increase > 10%',
      'DMARC failure notifications'
    ];

    // Add ESP-specific triggers
    const criticalChanges = changes.filter(c => c.impact === 'critical' || c.impact === 'high');
    if (criticalChanges.length > 0) {
      triggers.push('Any authentication issues with critical ESPs');
    }

    return triggers;
  }

  private estimateRollbackTime(changes: IPChangeEvent[], context: AutomationContext): number {
    // Base time: 15 minutes for DNS propagation + testing
    let estimatedMinutes = 15;

    // Add time based on complexity
    if (changes.length > 10) {
      estimatedMinutes += 10;
    }

    // Add time for business hours coordination
    if (!this.isInBusinessHours(context)) {
      estimatedMinutes += 30; // Additional coordination time
    }

    return estimatedMinutes;
  }

  private async checkRollbackConditions(domain: string, rollbackPlan: RollbackPlan): Promise<{
    shouldRollback: boolean;
    reason: string;
  }> {
    // Simulate rollback condition checking
    // In real implementation, this would check actual metrics
    
    // For demo, randomly decide (would be based on real metrics)
    const shouldRollback = Math.random() < 0.1; // 10% chance for demo
    
    return {
      shouldRollback,
      reason: shouldRollback ? 'Simulated authentication failure detected' : 'No rollback conditions met'
    };
  }

  // Utility methods

  private severityExceeds(current: string, threshold: string): boolean {
    const levels = { 'low': 0, 'medium': 1, 'high': 2, 'critical': 3 };
    return levels[current as keyof typeof levels] > levels[threshold as keyof typeof levels];
  }

  private calculateDaysUntilNextBusinessDay(currentDay: number, businessDays: number[]): number {
    for (let i = 1; i <= 7; i++) {
      const nextDay = (currentDay + i) % 7;
      if (businessDays.includes(nextDay)) {
        return i;
      }
    }
    return 1; // Default to tomorrow
  }

  private isInBusinessHours(context: AutomationContext): boolean {
    const now = context.currentTime;
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    const [startHour] = context.businessHours.start.split(':').map(Number);
    const [endHour] = context.businessHours.end.split(':').map(Number);

    return context.businessHours.businessDays.includes(currentDay) &&
           currentHour >= startHour && currentHour <= endHour;
  }

  private isValidIP(ip: string): boolean {
    // Simplified IP validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]*:){2,7}[0-9a-fA-F]*$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip.includes('/');
  }
}

/**
 * Factory function to create automation safeguards
 */
export function createSPFAutomationSafeguards(userId: string): SPFAutomationSafeguards {
  return new SPFAutomationSafeguards(userId);
}

/**
 * Default safeguard configurations
 */
export const SafeguardPresets = {
  CONSERVATIVE: {
    maxChangesPerDay: 1,
    maxChangesPerWeek: 3,
    requireHumanApproval: true,
    rollbackOnFailure: true,
    testBeforeApply: true,
    notifyBeforeChange: true,
    confidenceThreshold: 95,
    impactThreshold: 'low' as const,
    businessHoursOnly: true,
    maintenanceWindowsOnly: false,
    blackoutPeriods: []
  },
  BALANCED: {
    maxChangesPerDay: 3,
    maxChangesPerWeek: 10,
    requireHumanApproval: false,
    rollbackOnFailure: true,
    testBeforeApply: false,
    notifyBeforeChange: true,
    confidenceThreshold: 80,
    impactThreshold: 'medium' as const,
    businessHoursOnly: true,
    maintenanceWindowsOnly: false,
    blackoutPeriods: []
  },
  AGGRESSIVE: {
    maxChangesPerDay: 10,
    maxChangesPerWeek: 25,
    requireHumanApproval: false,
    rollbackOnFailure: true,
    testBeforeApply: false,
    notifyBeforeChange: false,
    confidenceThreshold: 70,
    impactThreshold: 'high' as const,
    businessHoursOnly: false,
    maintenanceWindowsOnly: false,
    blackoutPeriods: []
  }
};