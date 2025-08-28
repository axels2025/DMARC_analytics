import { supabase } from '@/integrations/supabase/client';
import { 
  PrivacySettings,
  DataClassification,
  classifyData,
  generateDataHash
} from '@/utils/privacyManager';
import { logPrivacyEvent, DataType } from '@/utils/privacyAudit';

export interface RetentionPolicy {
  id: string;
  userId: string;
  dataType: DataType;
  retentionDays: number;
  autoDelete: boolean;
  anonymizeAfterDays?: number;
  encryptionRequired: boolean;
  lastCleanup?: Date;
  customRules?: Record<string, any>;
}

export interface DataLifecycleRule {
  condition: (data: any) => boolean;
  action: 'delete' | 'anonymize' | 'encrypt' | 'archive';
  afterDays: number;
  priority: number;
}

export interface CleanupResult {
  totalProcessed: number;
  deleted: number;
  anonymized: number;
  encrypted: number;
  archived: number;
  errors: Array<{ id: string; error: string }>;
  executionTime: number;
}

export interface DataInventory {
  dataType: DataType;
  count: number;
  oldestRecord: Date;
  newestRecord: Date;
  classification: DataClassification;
  retentionCompliance: 'compliant' | 'expiring_soon' | 'expired';
  estimatedSize: number;
}

/**
 * Comprehensive data lifecycle management system
 */
export class DataLifecycleManager {
  private static readonly BATCH_SIZE = 100;
  private static readonly MAX_EXECUTION_TIME = 5 * 60 * 1000; // 5 minutes

  /**
   * Get retention policy for a user and data type
   */
  static async getRetentionPolicy(
    userId: string, 
    dataType: DataType
  ): Promise<RetentionPolicy | null> {
    try {
      const { data, error } = await supabase
        .from('data_retention_policies')
        .select('*')
        .eq('user_id', userId)
        .eq('data_type', dataType)
        .single();

      if (error) {
        console.warn('No retention policy found:', error);
        return null;
      }

      return {
        id: data.id,
        userId: data.user_id,
        dataType: data.data_type,
        retentionDays: data.retention_days,
        autoDelete: data.auto_delete,
        anonymizeAfterDays: data.anonymize_after_days,
        encryptionRequired: data.encryption_required,
        lastCleanup: data.last_cleanup ? new Date(data.last_cleanup) : undefined,
        customRules: data.custom_rules || {}
      };
    } catch (error) {
      console.error('Failed to get retention policy:', error);
      return null;
    }
  }

  /**
   * Set retention policy for a user and data type
   */
  static async setRetentionPolicy(policy: Omit<RetentionPolicy, 'id'>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('data_retention_policies')
        .upsert({
          user_id: policy.userId,
          data_type: policy.dataType,
          retention_days: policy.retentionDays,
          auto_delete: policy.autoDelete,
          anonymize_after_days: policy.anonymizeAfterDays,
          encryption_required: policy.encryptionRequired,
          custom_rules: policy.customRules
        }, {
          onConflict: 'user_id,data_type'
        });

      if (error) throw error;

      // Log policy change
      await logPrivacyEvent({
        userId: policy.userId,
        eventType: 'settings_change',
        dataType: policy.dataType,
        resourceId: `retention_policy_${policy.dataType}`,
        severity: 'medium',
        success: true,
        metadata: {
          retentionDays: policy.retentionDays,
          autoDelete: policy.autoDelete,
          anonymizeAfterDays: policy.anonymizeAfterDays
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to set retention policy:', error);
      return false;
    }
  }

  /**
   * Execute data cleanup based on retention policies
   */
  static async executeCleanup(userId: string, dryRun: boolean = false): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      totalProcessed: 0,
      deleted: 0,
      anonymized: 0,
      encrypted: 0,
      archived: 0,
      errors: [],
      executionTime: 0
    };

    try {
      // Get all retention policies for the user
      const { data: policies, error } = await supabase
        .from('data_retention_policies')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      // Process each policy
      for (const policyData of policies || []) {
        const policy: RetentionPolicy = {
          id: policyData.id,
          userId: policyData.user_id,
          dataType: policyData.data_type,
          retentionDays: policyData.retention_days,
          autoDelete: policyData.auto_delete,
          anonymizeAfterDays: policyData.anonymize_after_days,
          encryptionRequired: policyData.encryption_required,
          lastCleanup: policyData.last_cleanup ? new Date(policyData.last_cleanup) : undefined
        };

        // Check execution time limit
        if (Date.now() - startTime > this.MAX_EXECUTION_TIME) {
          console.warn('Cleanup execution time limit reached');
          break;
        }

        // Process policy
        const policyResult = await this.processPolicyCleanup(policy, dryRun);
        result.totalProcessed += policyResult.totalProcessed;
        result.deleted += policyResult.deleted;
        result.anonymized += policyResult.anonymized;
        result.encrypted += policyResult.encrypted;
        result.archived += policyResult.archived;
        result.errors.push(...policyResult.errors);

        // Update last cleanup time
        if (!dryRun) {
          await supabase
            .from('data_retention_policies')
            .update({ last_cleanup: new Date().toISOString() })
            .eq('id', policy.id);
        }
      }

      result.executionTime = Date.now() - startTime;

      // Log cleanup completion
      if (!dryRun) {
        await logPrivacyEvent({
          userId,
          eventType: 'data_deletion',
          dataType: 'forensic_report',
          resourceId: 'cleanup_batch',
          severity: 'medium',
          success: result.errors.length === 0,
          metadata: {
            ...result,
            dryRun
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Cleanup execution failed:', error);
      result.errors.push({ id: 'cleanup_execution', error: error.message });
      result.executionTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Process cleanup for a specific retention policy
   */
  private static async processPolicyCleanup(
    policy: RetentionPolicy, 
    dryRun: boolean
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      totalProcessed: 0,
      deleted: 0,
      anonymized: 0,
      encrypted: 0,
      archived: 0,
      errors: [],
      executionTime: 0
    };

    try {
      // Calculate cutoff dates
      const deletionCutoff = new Date();
      deletionCutoff.setDate(deletionCutoff.getDate() - policy.retentionDays);

      const anonymizationCutoff = policy.anonymizeAfterDays ? new Date() : null;
      if (anonymizationCutoff) {
        anonymizationCutoff.setDate(anonymizationCutoff.getDate() - policy.anonymizeAfterDays);
      }

      // Process based on data type
      switch (policy.dataType) {
        case 'forensic_report':
          const forensicResult = await this.cleanupForensicReports(
            policy, 
            deletionCutoff, 
            anonymizationCutoff, 
            dryRun
          );
          this.mergeResults(result, forensicResult);
          break;

        case 'email_content':
        case 'headers':
        case 'subject_line':
          // These are cleaned up as part of forensic reports
          break;

        case 'privacy_settings':
          // Privacy settings are not subject to retention cleanup
          break;

        default:
          console.warn(`Unknown data type for cleanup: ${policy.dataType}`);
      }

      return result;
    } catch (error) {
      console.error(`Policy cleanup failed for ${policy.dataType}:`, error);
      result.errors.push({ id: policy.id, error: error.message });
      return result;
    }
  }

  /**
   * Clean up forensic reports based on retention policy
   */
  private static async cleanupForensicReports(
    policy: RetentionPolicy,
    deletionCutoff: Date,
    anonymizationCutoff: Date | null,
    dryRun: boolean
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      totalProcessed: 0,
      deleted: 0,
      anonymized: 0,
      encrypted: 0,
      archived: 0,
      errors: [],
      executionTime: 0
    };

    try {
      // Get records to process
      let query = supabase
        .from('dmarc_forensic_reports')
        .select('id, created_at, envelope_from, envelope_to, subject, original_headers, message_body, anonymized_at')
        .eq('user_id', policy.userId)
        .order('created_at', { ascending: true })
        .limit(this.BATCH_SIZE);

      // Add conditions based on cutoffs
      if (policy.autoDelete) {
        query = query.lt('created_at', deletionCutoff.toISOString());
      } else if (anonymizationCutoff) {
        query = query
          .lt('created_at', anonymizationCutoff.toISOString())
          .is('anonymized_at', null);
      }

      const { data: records, error } = await query;
      if (error) throw error;

      result.totalProcessed = records?.length || 0;

      if (!records || records.length === 0) {
        return result;
      }

      // Process records in batches
      for (const record of records) {
        try {
          if (policy.autoDelete && new Date(record.created_at) < deletionCutoff) {
            // Delete the record
            if (!dryRun) {
              const { error: deleteError } = await supabase
                .from('dmarc_forensic_reports')
                .delete()
                .eq('id', record.id);

              if (deleteError) throw deleteError;
            }
            result.deleted++;

          } else if (anonymizationCutoff && new Date(record.created_at) < anonymizationCutoff && !record.anonymized_at) {
            // Anonymize the record
            if (!dryRun) {
              const { error: updateError } = await supabase
                .from('dmarc_forensic_reports')
                .update({
                  envelope_from: '[ANONYMIZED]',
                  envelope_to: '[ANONYMIZED]',
                  subject: '[ANONYMIZED]',
                  original_headers: '[ANONYMIZED]',
                  message_body: '[ANONYMIZED]',
                  anonymized_at: new Date().toISOString()
                })
                .eq('id', record.id);

              if (updateError) throw updateError;
            }
            result.anonymized++;
          }
        } catch (error) {
          result.errors.push({ id: record.id, error: error.message });
        }
      }

      return result;
    } catch (error) {
      console.error('Forensic reports cleanup failed:', error);
      result.errors.push({ id: 'forensic_cleanup', error: error.message });
      return result;
    }
  }

  /**
   * Get data inventory for a user
   */
  static async getDataInventory(userId: string): Promise<DataInventory[]> {
    try {
      const inventory: DataInventory[] = [];

      // Get forensic reports inventory
      const { data: forensicStats, error: forensicError } = await supabase
        .rpc('get_forensic_data_stats', { target_user_id: userId });

      if (!forensicError && forensicStats) {
        const oldestDate = forensicStats.oldest_record ? new Date(forensicStats.oldest_record) : new Date();
        const newestDate = forensicStats.newest_record ? new Date(forensicStats.newest_record) : new Date();
        const daysSinceOldest = Math.floor((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Get retention policy
        const policy = await this.getRetentionPolicy(userId, 'forensic_report');
        const retentionDays = policy?.retentionDays || 90;

        let retentionCompliance: 'compliant' | 'expiring_soon' | 'expired' = 'compliant';
        if (daysSinceOldest > retentionDays) {
          retentionCompliance = 'expired';
        } else if (daysSinceOldest > retentionDays * 0.8) {
          retentionCompliance = 'expiring_soon';
        }

        // Classify data
        const sampleData = {
          emailAddresses: ['sample@example.com'],
          subject: 'Sample subject',
          headers: 'Sample headers',
          messageContent: 'Sample content'
        };
        const classification = classifyData(sampleData);

        inventory.push({
          dataType: 'forensic_report',
          count: forensicStats.total_count || 0,
          oldestRecord: oldestDate,
          newestRecord: newestDate,
          classification,
          retentionCompliance,
          estimatedSize: (forensicStats.total_count || 0) * 2048 // Estimate 2KB per record
        });
      }

      // Add other data types as needed
      const otherDataTypes: DataType[] = ['email_content', 'headers', 'subject_line', 'privacy_settings'];
      
      for (const dataType of otherDataTypes) {
        inventory.push({
          dataType,
          count: 0, // Would be calculated from actual data
          oldestRecord: new Date(),
          newestRecord: new Date(),
          classification: { level: 'internal', tags: [], retentionRequired: false, encryptionRequired: false },
          retentionCompliance: 'compliant',
          estimatedSize: 0
        });
      }

      return inventory;
    } catch (error) {
      console.error('Failed to get data inventory:', error);
      return [];
    }
  }

  /**
   * Schedule automatic cleanup
   */
  static async scheduleAutoCleanup(userId: string, intervalHours: number = 24): Promise<void> {
    // In a real implementation, this would integrate with a job scheduler
    // For now, we'll just log the scheduling request
    console.log(`Auto cleanup scheduled for user ${userId} every ${intervalHours} hours`);
    
    await logPrivacyEvent({
      userId,
      eventType: 'settings_change',
      dataType: 'privacy_settings',
      resourceId: 'auto_cleanup_schedule',
      severity: 'low',
      success: true,
      metadata: {
        intervalHours,
        scheduledAt: new Date().toISOString()
      }
    });
  }

  /**
   * Export data for compliance requests
   */
  static async exportUserData(
    userId: string,
    dataTypes: DataType[],
    format: 'json' | 'csv' | 'xml' = 'json',
    includeMetadata: boolean = true
  ): Promise<string> {
    try {
      const exportData: any = {
        exportInfo: {
          userId,
          exportDate: new Date().toISOString(),
          format,
          dataTypes,
          includeMetadata
        },
        data: {}
      };

      // Export forensic reports
      if (dataTypes.includes('forensic_report')) {
        const { data: forensicData, error } = await supabase
          .from('dmarc_forensic_reports')
          .select('*')
          .eq('user_id', userId);

        if (!error) {
          exportData.data.forensic_reports = forensicData;
        }
      }

      // Export privacy settings
      if (dataTypes.includes('privacy_settings')) {
        const { data: privacyData, error } = await supabase
          .from('user_privacy_settings')
          .select('*')
          .eq('user_id', userId);

        if (!error) {
          exportData.data.privacy_settings = privacyData;
        }
      }

      // Export audit logs if metadata is requested
      if (includeMetadata) {
        const { data: auditData, error } = await supabase
          .from('privacy_audit_log')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (!error) {
          exportData.metadata = {
            audit_log: auditData
          };
        }
      }

      // Log the export
      await logPrivacyEvent({
        userId,
        eventType: 'export',
        dataType: 'forensic_report',
        resourceId: `data_export_${Date.now()}`,
        severity: 'medium',
        success: true,
        metadata: {
          format,
          dataTypes,
          includeMetadata,
          recordCount: Object.values(exportData.data).reduce((sum: number, arr: any) => 
            sum + (Array.isArray(arr) ? arr.length : 0), 0
          )
        }
      });

      // Format the output
      switch (format) {
        case 'json':
          return JSON.stringify(exportData, null, 2);
        case 'csv':
          return this.convertToCSV(exportData);
        case 'xml':
          return this.convertToXML(exportData);
        default:
          return JSON.stringify(exportData, null, 2);
      }
    } catch (error) {
      console.error('Failed to export user data:', error);
      throw error;
    }
  }

  /**
   * Merge cleanup results
   */
  private static mergeResults(target: CleanupResult, source: CleanupResult): void {
    target.totalProcessed += source.totalProcessed;
    target.deleted += source.deleted;
    target.anonymized += source.anonymized;
    target.encrypted += source.encrypted;
    target.archived += source.archived;
    target.errors.push(...source.errors);
  }

  /**
   * Convert data to CSV format
   */
  private static convertToCSV(data: any): string {
    // Simplified CSV conversion - in a real implementation, this would be more robust
    const rows: string[] = [];
    
    for (const [tableName, records] of Object.entries(data.data)) {
      if (Array.isArray(records) && records.length > 0) {
        const headers = Object.keys(records[0]);
        rows.push(`# ${tableName}`);
        rows.push(headers.join(','));
        
        for (const record of records) {
          const values = headers.map(header => {
            const value = record[header];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
          });
          rows.push(values.join(','));
        }
        rows.push(''); // Empty line between tables
      }
    }
    
    return rows.join('\n');
  }

  /**
   * Convert data to XML format
   */
  private static convertToXML(data: any): string {
    // Simplified XML conversion - in a real implementation, this would be more robust
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<export>\n';
    
    for (const [key, value] of Object.entries(data)) {
      xml += `  <${key}>\n`;
      if (typeof value === 'object') {
        xml += this.objectToXML(value, '    ');
      } else {
        xml += `    ${value}\n`;
      }
      xml += `  </${key}>\n`;
    }
    
    xml += '</export>';
    return xml;
  }

  /**
   * Convert object to XML recursively
   */
  private static objectToXML(obj: any, indent: string = ''): string {
    let xml = '';
    
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        xml += `${indent}<item index="${i}">\n`;
        xml += this.objectToXML(obj[i], indent + '  ');
        xml += `${indent}</item>\n`;
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        xml += `${indent}<${key}>`;
        if (typeof value === 'object') {
          xml += '\n';
          xml += this.objectToXML(value, indent + '  ');
          xml += indent;
        } else {
          xml += value;
        }
        xml += `</${key}>\n`;
      }
    } else {
      xml += `${indent}${obj}\n`;
    }
    
    return xml;
  }
}

// Helper function to create a database function for statistics
export const createDataStatsFunction = async () => {
  const { error } = await supabase.rpc('create_forensic_data_stats_function');
  if (error) {
    console.error('Failed to create stats function:', error);
  }
};