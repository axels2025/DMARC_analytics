import { supabase } from '@/integrations/supabase/client';

export type PrivacyEventType = 
  | 'data_access' 
  | 'privacy_change' 
  | 'decrypt' 
  | 'export' 
  | 'temporary_reveal'
  | 'key_generation'
  | 'key_rotation'
  | 'data_deletion'
  | 'settings_change';

export type DataType = 
  | 'forensic_report' 
  | 'email_content' 
  | 'headers' 
  | 'subject_line'
  | 'email_addresses'
  | 'encryption_keys'
  | 'privacy_settings';

export interface PrivacyAuditEvent {
  id: string;
  userId: string;
  eventType: PrivacyEventType;
  dataType: DataType;
  resourceId: string;
  previousSettings?: any;
  newSettings?: any;
  metadata?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  success: boolean;
  errorMessage?: string;
}

export interface AuditSummary {
  totalEvents: number;
  eventsByType: Record<PrivacyEventType, number>;
  eventsByDataType: Record<DataType, number>;
  recentActivity: PrivacyAuditEvent[];
  securityAlerts: PrivacyAuditEvent[];
  complianceMetrics: {
    dataAccessFrequency: number;
    encryptionUsage: number;
    retentionCompliance: number;
    auditCoverage: number;
  };
}

export interface ComplianceReport {
  reportId: string;
  userId: string;
  reportType: 'gdpr' | 'ccpa' | 'hipaa' | 'custom';
  dateRange: {
    start: Date;
    end: Date;
  };
  dataProcessingActivities: Array<{
    dataType: DataType;
    processingPurpose: string;
    legalBasis: string;
    accessCount: number;
    retentionPeriod: number;
  }>;
  privacyRights: Array<{
    rightType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
    requestDate: Date;
    status: 'pending' | 'completed' | 'rejected';
    completionDate?: Date;
  }>;
  securityMeasures: string[];
  dataBreaches: Array<{
    incidentId: string;
    detectedDate: Date;
    notifiedDate?: Date;
    affectedDataTypes: DataType[];
    severity: string;
    status: string;
  }>;
  generatedAt: Date;
}

/**
 * Privacy audit logger with local storage fallback
 */
export class PrivacyAuditLogger {
  private static readonly LOCAL_STORAGE_KEY = 'dmarc_privacy_audit';
  private static readonly MAX_LOCAL_EVENTS = 1000;

  /**
   * Log a privacy-related event
   */
  static async logEvent(eventData: Omit<PrivacyAuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const event: PrivacyAuditEvent = {
      ...eventData,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sessionId: this.getSessionId(),
    };

    // Add browser information if available
    if (typeof navigator !== 'undefined') {
      event.userAgent = navigator.userAgent;
    }

    // Try to store in database first
    try {
      const { error } = await supabase
        .from('privacy_audit_log')
        .insert({
          user_id: event.userId,
          event_type: event.eventType,
          resource_type: event.dataType,
          resource_id: event.resourceId,
          event_details: {
            severity: event.severity,
            metadata: event.metadata,
            previousSettings: event.previousSettings,
            newSettings: event.newSettings,
            success: event.success,
            errorMessage: event.errorMessage,
          },
          ip_address: event.ipAddress,
          user_agent: event.userAgent,
        });

      if (error) {
        console.warn('Failed to store audit event in database:', error);
        this.storeLocally(event);
      }
    } catch (error) {
      console.warn('Database unavailable, storing audit event locally:', error);
      this.storeLocally(event);
    }

    // Log security alerts to console
    if (event.severity === 'critical' || event.severity === 'high') {
      console.warn('Privacy Security Alert:', {
        type: event.eventType,
        dataType: event.dataType,
        severity: event.severity,
        userId: event.userId.substring(0, 8) + '...',
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * Store event locally as fallback
   */
  private static storeLocally(event: PrivacyAuditEvent): void {
    try {
      const existingEvents = this.getLocalEvents();
      existingEvents.push(event);

      // Keep only the most recent events
      const recentEvents = existingEvents
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.MAX_LOCAL_EVENTS);

      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(recentEvents));
    } catch (error) {
      console.error('Failed to store audit event locally:', error);
    }
  }

  /**
   * Get locally stored events
   */
  private static getLocalEvents(): PrivacyAuditEvent[] {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const events = JSON.parse(stored);
        return events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }
    } catch (error) {
      console.error('Failed to parse local audit events:', error);
    }
    return [];
  }

  /**
   * Get session ID for tracking
   */
  private static getSessionId(): string {
    const sessionKey = 'dmarc_session_id';
    let sessionId = sessionStorage.getItem(sessionKey);
    
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(sessionKey, sessionId);
    }
    
    return sessionId;
  }

  /**
   * Get audit events for a user
   */
  static async getAuditEvents(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      eventType?: PrivacyEventType;
      dataType?: DataType;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<PrivacyAuditEvent[]> {
    try {
      let query = supabase
        .from('privacy_audit_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.eventType) {
        query = query.eq('event_type', options.eventType);
      }

      if (options.dataType) {
        query = query.eq('resource_type', options.dataType);
      }

      if (options.startDate) {
        query = query.gte('created_at', options.startDate.toISOString());
      }

      if (options.endDate) {
        query = query.lte('created_at', options.endDate.toISOString());
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        eventType: row.event_type,
        dataType: row.resource_type,
        resourceId: row.resource_id,
        severity: row.event_details?.severity || 'low',
        metadata: row.event_details?.metadata,
        previousSettings: row.event_details?.previousSettings,
        newSettings: row.event_details?.newSettings,
        success: row.event_details?.success ?? true,
        errorMessage: row.event_details?.errorMessage,
        timestamp: new Date(row.created_at),
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
      }));
    } catch (error) {
      console.warn('Failed to fetch audit events from database, using local storage:', error);
      return this.getLocalEvents().filter(event => event.userId === userId);
    }
  }

  /**
   * Generate audit summary for a user
   */
  static async generateAuditSummary(
    userId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<AuditSummary> {
    const events = await this.getAuditEvents(userId, {
      startDate: dateRange.start,
      endDate: dateRange.end,
      limit: 1000,
    });

    const eventsByType: Partial<Record<PrivacyEventType, number>> = {};
    const eventsByDataType: Partial<Record<DataType, number>> = {};

    events.forEach(event => {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsByDataType[event.dataType] = (eventsByDataType[event.dataType] || 0) + 1;
    });

    const securityAlerts = events.filter(
      event => event.severity === 'high' || event.severity === 'critical'
    );

    const recentActivity = events.slice(0, 20);

    // Calculate compliance metrics
    const totalDataAccess = events.filter(e => e.eventType === 'data_access').length;
    const encryptionEvents = events.filter(e => e.eventType === 'decrypt' || e.eventType === 'key_generation').length;
    const totalEvents = events.length;

    return {
      totalEvents,
      eventsByType: eventsByType as Record<PrivacyEventType, number>,
      eventsByDataType: eventsByDataType as Record<DataType, number>,
      recentActivity,
      securityAlerts,
      complianceMetrics: {
        dataAccessFrequency: totalDataAccess,
        encryptionUsage: totalEvents > 0 ? (encryptionEvents / totalEvents) * 100 : 0,
        retentionCompliance: 95, // TODO: Calculate based on actual data retention
        auditCoverage: Math.min(100, (totalEvents / 30) * 100), // Expect at least 30 events per period
      },
    };
  }

  /**
   * Clear audit events older than retention period
   */
  static async cleanupOldEvents(userId: string, retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const { data, error } = await supabase
        .from('privacy_audit_log')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        throw error;
      }

      // Also clean up local storage
      const localEvents = this.getLocalEvents();
      const recentEvents = localEvents.filter(
        event => event.timestamp > cutoffDate && event.userId === userId
      );
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(recentEvents));

      return Array.isArray(data) ? data.length : 0;
    } catch (error) {
      console.error('Failed to cleanup old audit events:', error);
      return 0;
    }
  }
}

/**
 * Convenience logging functions
 */
export const logPrivacyEvent = (eventData: Omit<PrivacyAuditEvent, 'id' | 'timestamp'>) => {
  return PrivacyAuditLogger.logEvent(eventData);
};

export const logDataAccess = (userId: string, dataType: DataType, resourceId: string, metadata?: Record<string, any>) => {
  return logPrivacyEvent({
    userId,
    eventType: 'data_access',
    dataType,
    resourceId,
    metadata,
    severity: 'low',
    success: true,
  });
};

export const logPrivacyChange = (
  userId: string,
  previousSettings: any,
  newSettings: any,
  resourceId: string = 'privacy_settings'
) => {
  return logPrivacyEvent({
    userId,
    eventType: 'privacy_change',
    dataType: 'privacy_settings',
    resourceId,
    previousSettings,
    newSettings,
    severity: 'medium',
    success: true,
  });
};

export const logDecryption = (userId: string, dataType: DataType, resourceId: string, success: boolean = true) => {
  return logPrivacyEvent({
    userId,
    eventType: 'decrypt',
    dataType,
    resourceId,
    severity: success ? 'medium' : 'high',
    success,
  });
};

export const logDataExport = (
  userId: string,
  dataType: DataType,
  resourceId: string,
  exportFormat: string,
  encryptionUsed: boolean
) => {
  return logPrivacyEvent({
    userId,
    eventType: 'export',
    dataType,
    resourceId,
    metadata: {
      exportFormat,
      encryptionUsed,
    },
    severity: encryptionUsed ? 'low' : 'medium',
    success: true,
  });
};

export const logTemporaryReveal = (userId: string, dataType: DataType, resourceId: string, duration: number) => {
  return logPrivacyEvent({
    userId,
    eventType: 'temporary_reveal',
    dataType,
    resourceId,
    metadata: {
      revealDurationMs: duration,
    },
    severity: 'medium',
    success: true,
  });
};

export const logSecurityEvent = (
  userId: string,
  eventType: PrivacyEventType,
  dataType: DataType,
  resourceId: string,
  errorMessage: string
) => {
  return logPrivacyEvent({
    userId,
    eventType,
    dataType,
    resourceId,
    severity: 'critical',
    success: false,
    errorMessage,
  });
};

/**
 * Generate compliance report
 */
export const generateComplianceReport = async (
  userId: string,
  reportType: ComplianceReport['reportType'],
  dateRange: { start: Date; end: Date }
): Promise<ComplianceReport> => {
  const events = await PrivacyAuditLogger.getAuditEvents(userId, {
    startDate: dateRange.start,
    endDate: dateRange.end,
    limit: 5000,
  });

  // Analyze data processing activities
  const dataProcessingActivities = Object.entries(
    events.reduce((acc, event) => {
      if (!acc[event.dataType]) {
        acc[event.dataType] = {
          accessCount: 0,
          processingPurpose: getProcessingPurpose(event.dataType),
          legalBasis: getLegalBasis(event.dataType, reportType),
        };
      }
      if (event.eventType === 'data_access') {
        acc[event.dataType].accessCount++;
      }
      return acc;
    }, {} as Record<DataType, any>)
  ).map(([dataType, stats]) => ({
    dataType: dataType as DataType,
    processingPurpose: stats.processingPurpose,
    legalBasis: stats.legalBasis,
    accessCount: stats.accessCount,
    retentionPeriod: 90, // TODO: Get from user settings
  }));

  return {
    reportId: crypto.randomUUID(),
    userId,
    reportType,
    dateRange,
    dataProcessingActivities,
    privacyRights: [], // TODO: Implement privacy rights tracking
    securityMeasures: [
      'End-to-end encryption using AES-256-GCM',
      'Row-level security in database',
      'Comprehensive audit logging',
      'Data masking and anonymization',
      'Secure key management',
    ],
    dataBreaches: [], // TODO: Implement breach tracking
    generatedAt: new Date(),
  };
};

/**
 * Helper functions for compliance reporting
 */
const getProcessingPurpose = (dataType: DataType): string => {
  const purposes: Record<DataType, string> = {
    forensic_report: 'Email security monitoring and threat analysis',
    email_content: 'Authentication failure investigation',
    headers: 'Email routing and authentication analysis',
    subject_line: 'Threat pattern identification',
    email_addresses: 'Communication routing analysis',
    encryption_keys: 'Data protection and security',
    privacy_settings: 'User preference management',
  };
  return purposes[dataType] || 'Data processing for security analysis';
};

const getLegalBasis = (dataType: DataType, reportType: ComplianceReport['reportType']): string => {
  if (reportType === 'gdpr') {
    const gdprBasis: Partial<Record<DataType, string>> = {
      forensic_report: 'Legitimate interests (Article 6(1)(f)) - Cybersecurity',
      email_content: 'Legitimate interests (Article 6(1)(f)) - Fraud prevention',
      privacy_settings: 'Consent (Article 6(1)(a))',
    };
    return gdprBasis[dataType] || 'Legitimate interests (Article 6(1)(f))';
  }
  
  return 'Business necessity for security monitoring';
};