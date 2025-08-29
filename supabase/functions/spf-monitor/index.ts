import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Types for request/response
interface MonitoringJobRequest {
  userId?: string;
  domain?: string;
  operation: 'check_all' | 'check_domain' | 'update_record' | 'health_check';
  force?: boolean; // Force check even if recently checked
}

interface MonitoringJobResponse {
  success: boolean;
  operation: string;
  results?: {
    domainsChecked: number;
    changesDetected: number;
    errorsEncountered: number;
    autoUpdatesTriggered: number;
  };
  errors?: string[];
  timestamp: string;
}

interface IPChangeEvent {
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

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

/**
 * Background job that runs periodically to check SPF changes
 * Integrates with existing DNS lookup function and ESP classification
 */
serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[SPF Monitor] Job started');
    
    const request: MonitoringJobRequest = await req.json();
    console.log('[SPF Monitor] Request:', request);

    let response: MonitoringJobResponse;

    switch (request.operation) {
      case 'check_all':
        response = await checkAllDomains(request.force);
        break;
      case 'check_domain':
        if (!request.domain || !request.userId) {
          throw new Error('Domain and userId required for check_domain operation');
        }
        response = await checkSpecificDomain(request.userId, request.domain);
        break;
      case 'health_check':
        response = await performHealthCheck();
        break;
      default:
        throw new Error(`Unknown operation: ${request.operation}`);
    }

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.success ? 200 : 500,
      },
    );

  } catch (error) {
    console.error('[SPF Monitor] Job failed:', error);
    
    const errorResponse: MonitoringJobResponse = {
      success: false,
      operation: 'unknown',
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      timestamp: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

/**
 * Check all domains across all users that have monitoring enabled
 */
async function checkAllDomains(force = false): Promise<MonitoringJobResponse> {
  let domainsChecked = 0;
  let changesDetected = 0;
  let errorsEncountered = 0;
  let autoUpdatesTriggered = 0;
  const errors: string[] = [];

  try {
    console.log('[SPF Monitor] Checking all monitored domains');

    // Get all users with active SPF monitoring
    const { data: monitoringSettings, error: fetchError } = await supabase
      .from('user_spf_monitoring')
      .select('user_id, domain, monitor_enabled, auto_update, last_checked_at')
      .eq('monitor_enabled', true);

    if (fetchError) throw fetchError;

    console.log(`[SPF Monitor] Found ${monitoringSettings?.length || 0} monitored domains`);

    for (const setting of monitoringSettings || []) {
      try {
        // Check if we should skip based on last check time (unless forced)
        if (!force && setting.last_checked_at) {
          const lastCheck = new Date(setting.last_checked_at);
          const hoursSinceLastCheck = (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60);
          
          // Skip if checked within last hour (configurable based on user preferences)
          if (hoursSinceLastCheck < 1) {
            console.log(`[SPF Monitor] Skipping ${setting.domain} - checked recently`);
            continue;
          }
        }

        console.log(`[SPF Monitor] Checking domain: ${setting.domain}`);
        domainsChecked++;

        const changes = await checkDomainForChanges(setting.user_id, setting.domain);
        
        if (changes.length > 0) {
          changesDetected += changes.length;
          console.log(`[SPF Monitor] Found ${changes.length} changes for ${setting.domain}`);

          // Store change events
          await storeChangeEvents(setting.user_id, changes);

          // Trigger auto-update if enabled and safe
          if (setting.auto_update) {
            const safeChanges = changes.filter(c => c.autoUpdateSafe);
            if (safeChanges.length > 0) {
              console.log(`[SPF Monitor] Triggering auto-update for ${setting.domain}`);
              // Note: Auto-update would be handled by the Dynamic Update Engine
              autoUpdatesTriggered++;
            }
          }

          // Send notifications if configured
          await sendChangeNotifications(setting.user_id, setting.domain, changes);
        }

        // Update last checked time
        await updateLastChecked(setting.user_id, setting.domain);

      } catch (domainError) {
        errorsEncountered++;
        const errorMsg = `Failed to check ${setting.domain}: ${domainError instanceof Error ? domainError.message : 'Unknown error'}`;
        console.error('[SPF Monitor]', errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log('[SPF Monitor] Batch check completed');

    return {
      success: true,
      operation: 'check_all',
      results: {
        domainsChecked,
        changesDetected,
        errorsEncountered,
        autoUpdatesTriggered
      },
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[SPF Monitor] Failed to check all domains:', error);
    throw error;
  }
}

/**
 * Check a specific domain for changes
 */
async function checkSpecificDomain(userId: string, domain: string): Promise<MonitoringJobResponse> {
  try {
    console.log(`[SPF Monitor] Checking specific domain: ${domain} for user: ${userId}`);

    const changes = await checkDomainForChanges(userId, domain);
    
    if (changes.length > 0) {
      await storeChangeEvents(userId, changes);
      await sendChangeNotifications(userId, domain, changes);
    }

    await updateLastChecked(userId, domain);

    return {
      success: true,
      operation: 'check_domain',
      results: {
        domainsChecked: 1,
        changesDetected: changes.length,
        errorsEncountered: 0,
        autoUpdatesTriggered: 0 // Would be handled by separate auto-update process
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`[SPF Monitor] Failed to check domain ${domain}:`, error);
    throw error;
  }
}

/**
 * Perform system health check
 */
async function performHealthCheck(): Promise<MonitoringJobResponse> {
  try {
    // Check database connectivity
    const { data, error } = await supabase
      .from('user_spf_monitoring')
      .select('count(*)')
      .limit(1);

    if (error) throw error;

    // Check DNS lookup function availability
    const dnsCheck = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dns-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
      },
      body: JSON.stringify({
        domain: 'google.com',
        recordType: 'TXT'
      })
    });

    if (!dnsCheck.ok) {
      throw new Error(`DNS lookup function not available: ${dnsCheck.status}`);
    }

    return {
      success: true,
      operation: 'health_check',
      results: {
        domainsChecked: 0,
        changesDetected: 0,
        errorsEncountered: 0,
        autoUpdatesTriggered: 0
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[SPF Monitor] Health check failed:', error);
    throw error;
  }
}

/**
 * Check a specific domain for SPF changes
 */
async function checkDomainForChanges(userId: string, domain: string): Promise<IPChangeEvent[]> {
  try {
    // Get current SPF record
    const currentRecord = await getCurrentSPFRecord(domain);
    if (!currentRecord) {
      throw new Error(`No SPF record found for ${domain}`);
    }

    // Get monitoring baselines
    const baselines = await getMonitoringBaselines(userId, domain);
    const changes: IPChangeEvent[] = [];

    // Check each include mechanism
    for (const includeDomain of currentRecord.includes) {
      const baseline = baselines.get(includeDomain);
      if (!baseline?.monitoring_enabled) continue;

      try {
        const currentIPs = await resolveIncludeIPs(includeDomain);
        const previousIPs = baseline.baseline_ips;

        const change = detectIPChanges(
          domain,
          includeDomain,
          previousIPs,
          currentIPs,
          baseline.esp_name || 'Unknown'
        );

        if (change) {
          changes.push(change);
          
          // Update baseline
          await updateBaseline(userId, domain, includeDomain, currentIPs);
        }

      } catch (includeError) {
        console.warn(`[SPF Monitor] Failed to check include ${includeDomain}:`, includeError);
      }
    }

    return changes;

  } catch (error) {
    console.error(`[SPF Monitor] Failed to check domain changes:`, error);
    throw error;
  }
}

/**
 * Get current SPF record and parse includes
 */
async function getCurrentSPFRecord(domain: string): Promise<{ includes: string[] } | null> {
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dns-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        domain,
        recordType: 'TXT'
      })
    });

    if (!response.ok) {
      throw new Error(`DNS lookup failed: ${response.status}`);
    }

    const result = await response.json();
    const spfRecord = result.records?.find((record: string) => 
      record.startsWith('v=spf1')
    );

    if (!spfRecord) return null;

    // Parse include mechanisms
    const includes = [];
    const includeRegex = /include:([^\s]+)/g;
    let match;
    while ((match = includeRegex.exec(spfRecord)) !== null) {
      includes.push(match[1]);
    }

    return { includes };

  } catch (error) {
    console.error(`[SPF Monitor] Failed to get SPF record for ${domain}:`, error);
    throw error;
  }
}

/**
 * Get monitoring baselines for a domain
 */
async function getMonitoringBaselines(userId: string, domain: string): Promise<Map<string, any>> {
  const { data: baselines, error } = await supabase
    .from('spf_esp_monitoring_baseline')
    .select(`
      include_domain,
      baseline_ips,
      monitoring_enabled,
      spf_esp_classifications (esp_name)
    `)
    .eq('user_id', userId)
    .eq('domain', domain);

  if (error) throw error;

  const baselineMap = new Map();
  (baselines || []).forEach(baseline => {
    baselineMap.set(baseline.include_domain, {
      ...baseline,
      esp_name: baseline.spf_esp_classifications?.esp_name
    });
  });

  return baselineMap;
}

/**
 * Resolve include mechanism to IP addresses
 */
async function resolveIncludeIPs(includeDomain: string): Promise<string[]> {
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dns-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
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
    console.error(`[SPF Monitor] Failed to resolve IPs for ${includeDomain}:`, error);
    return [];
  }
}

/**
 * Detect IP changes between previous and current state
 */
function detectIPChanges(
  domain: string,
  includeDomain: string,
  previousIPs: string[],
  currentIPs: string[],
  espName: string
): IPChangeEvent | null {
  const added = currentIPs.filter(ip => !previousIPs.includes(ip));
  const removed = previousIPs.filter(ip => !currentIPs.includes(ip));

  if (added.length === 0 && removed.length === 0) {
    return null;
  }

  // Determine change type
  let changeType: 'added' | 'removed' | 'modified';
  if (added.length > 0 && removed.length === 0) {
    changeType = 'added';
  } else if (added.length === 0 && removed.length > 0) {
    changeType = 'removed';
  } else {
    changeType = 'modified';
  }

  // Simple impact assessment (would use ESP intelligence in full implementation)
  const totalChanges = added.length + removed.length;
  const impact = removed.length > 0 ? 'high' : 
                totalChanges > 5 ? 'medium' : 'low';

  return {
    domain,
    includeDomain,
    espName,
    changeType,
    previousIPs,
    currentIPs,
    impact,
    recommendedAction: generateRecommendedAction(changeType, impact),
    timestamp: new Date(),
    autoUpdateSafe: changeType === 'added' && impact === 'low',
    riskFactors: generateRiskFactors(changeType, totalChanges, removed.length > 0)
  };
}

/**
 * Generate recommended action based on change type and impact
 */
function generateRecommendedAction(
  changeType: 'added' | 'removed' | 'modified',
  impact: 'low' | 'medium' | 'high'
): string {
  if (impact === 'high') {
    return 'Immediate review required - potential authentication failures';
  }

  if (changeType === 'added') {
    return impact === 'medium' 
      ? 'Consider updating SPF record to include new IPs'
      : 'New IPs detected - safe to add to SPF record';
  }

  if (changeType === 'removed') {
    return 'IPs removed from ESP - verify before removing from SPF';
  }

  return 'IP addresses modified - review and update as needed';
}

/**
 * Generate risk factors based on change characteristics
 */
function generateRiskFactors(
  changeType: 'added' | 'removed' | 'modified',
  totalChanges: number,
  hasRemovals: boolean
): string[] {
  const risks = [];

  if (hasRemovals) {
    risks.push('IP addresses removed - potential authentication failures');
  }

  if (totalChanges > 10) {
    risks.push('Large number of IP changes');
  }

  if (changeType === 'modified') {
    risks.push('Both additions and removals detected');
  }

  return risks;
}

/**
 * Store change events in database
 */
async function storeChangeEvents(userId: string, changes: IPChangeEvent[]): Promise<void> {
  const changeEvents = changes.map(change => ({
    user_id: userId,
    domain: change.domain,
    include_domain: change.includeDomain,
    esp_name: change.espName,
    change_type: change.changeType,
    previous_ips: change.previousIPs,
    current_ips: change.currentIPs,
    impact_level: change.impact,
    auto_updated: false
  }));

  const { error } = await supabase
    .from('spf_change_events')
    .insert(changeEvents);

  if (error) {
    console.error('[SPF Monitor] Failed to store change events:', error);
    throw error;
  }
}

/**
 * Send change notifications (placeholder - would integrate with notification system)
 */
async function sendChangeNotifications(userId: string, domain: string, changes: IPChangeEvent[]): Promise<void> {
  // This would integrate with the existing notification system
  // For now, just log the notification
  console.log(`[SPF Monitor] Would send notifications for ${changes.length} changes to ${domain}`);
  
  // Could send via:
  // - Email alerts
  // - Webhook notifications  
  // - Dashboard notifications
  // - Slack/Teams integration
}

/**
 * Update last checked timestamp
 */
async function updateLastChecked(userId: string, domain: string): Promise<void> {
  const { error } = await supabase
    .from('user_spf_monitoring')
    .update({ 
      last_checked_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('domain', domain);

  if (error) {
    console.error('[SPF Monitor] Failed to update last checked:', error);
  }
}

/**
 * Update monitoring baseline with new IPs
 */
async function updateBaseline(userId: string, domain: string, includeDomain: string, newIPs: string[]): Promise<void> {
  const { error } = await supabase
    .from('spf_esp_monitoring_baseline')
    .update({
      baseline_ips: newIPs,
      last_verified: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('include_domain', includeDomain);

  if (error) {
    console.error('[SPF Monitor] Failed to update baseline:', error);
  }
}

console.log("SPF Monitor Edge Function deployed successfully");