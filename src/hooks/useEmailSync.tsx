import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface EmailConfig {
  id: string;
  provider: string;
  email_address: string;
  is_active: boolean;
  delete_after_import: boolean;
  deletion_confirmation_shown: boolean;
  sync_status: 'idle' | 'syncing' | 'completed' | 'error';
  last_sync_at: string | null;
  last_error_message: string | null;
  auto_sync_enabled: boolean;
  created_at: string;
}

export interface SyncLogEntry {
  id: string;
  sync_started_at: string;
  sync_completed_at: string | null;
  sync_duration_seconds: number | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  emails_found: number;
  emails_fetched: number;
  attachments_found: number;
  reports_processed: number;
  reports_skipped: number;
  emails_deleted: number;
  deletion_enabled: boolean;
  deletion_errors: number;
  error_message: string | null;
  deleted_emails_metadata: any[] | null;
}

export interface SyncSummary {
  totalSyncs: number;
  successfulSyncs: number;
  totalEmailsProcessed: number;
  totalReportsImported: number;
  totalDuplicatesSkipped: number;
  totalEmailsDeleted: number;
  averageSyncDuration: number | null;
  lastSync: string | null;
  activeConfigs: number;
}

export interface SyncMetrics {
  lastSync: Date | null;
  emailsFound: number;
  emailsFetched: number;
  attachmentsFound: number;
  reportsImported: number;
  duplicatesSkipped: number;
  emailsDeleted: number;
  deletionEnabled: boolean;
  duration: number | null; // in seconds
  status: 'idle' | 'syncing' | 'completed' | 'error';
  errorMessage?: string;
}

// Hook for managing email configurations
export const useEmailConfigs = () => {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('user_email_configs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setConfigs(data || []);
    } catch (err) {
      console.error('Error fetching email configs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch email configurations');
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  return { configs, loading, error, refreshConfigs: fetchConfigs };
};

// Hook for sync history and logs
export const useSyncHistory = (configId?: string, limit: number = 10) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('email_sync_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('sync_started_at', { ascending: false })
        .limit(limit);

      if (configId) {
        query = query.eq('config_id', configId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching sync history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sync history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [user, configId, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refreshHistory: fetchHistory };
};

// Hook for comprehensive sync summary
export const useSyncSummary = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_user_sync_summary', { target_user_id: user.id });

      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        const summaryData = data[0];
        setSummary({
          totalSyncs: parseInt(summaryData.total_syncs) || 0,
          successfulSyncs: parseInt(summaryData.successful_syncs) || 0,
          totalEmailsProcessed: parseInt(summaryData.total_emails_processed) || 0,
          totalReportsImported: parseInt(summaryData.total_reports_imported) || 0,
          totalDuplicatesSkipped: parseInt(summaryData.total_duplicates_skipped) || 0,
          totalEmailsDeleted: parseInt(summaryData.total_emails_deleted) || 0,
          averageSyncDuration: summaryData.average_sync_duration,
          lastSync: summaryData.last_sync,
          activeConfigs: summaryData.active_configs || 0
        });
      } else {
        setSummary({
          totalSyncs: 0,
          successfulSyncs: 0,
          totalEmailsProcessed: 0,
          totalReportsImported: 0,
          totalDuplicatesSkipped: 0,
          totalEmailsDeleted: 0,
          averageSyncDuration: null,
          lastSync: null,
          activeConfigs: 0
        });
      }
    } catch (err) {
      console.error('Error fetching sync summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sync summary');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refreshSummary: fetchSummary };
};

// Hook for recent sync status (for dashboard display)
export const useRecentSyncStatus = (configId: string) => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!user || !configId) return;

    setLoading(true);
    setError(null);

    try {
      // Get latest sync log for this config
      const { data: syncData, error: syncError } = await supabase
        .from('email_sync_logs')
        .select('*')
        .eq('config_id', configId)
        .order('sync_started_at', { ascending: false })
        .limit(1);

      if (syncError) throw syncError;

      // Get config status
      const { data: configData, error: configError } = await supabase
        .from('user_email_configs')
        .select('sync_status, last_sync_at, last_error_message, delete_after_import')
        .eq('id', configId)
        .single();

      if (configError) throw configError;

      const latestSync = syncData && syncData.length > 0 ? syncData[0] : null;
      
      setMetrics({
        lastSync: latestSync ? new Date(latestSync.sync_started_at) : 
                  configData.last_sync_at ? new Date(configData.last_sync_at) : null,
        emailsFound: latestSync?.emails_found || 0,
        emailsFetched: latestSync?.emails_fetched || 0,
        attachmentsFound: latestSync?.attachments_found || 0,
        reportsImported: latestSync?.reports_processed || 0,
        duplicatesSkipped: latestSync?.reports_skipped || 0,
        emailsDeleted: latestSync?.emails_deleted || 0,
        deletionEnabled: latestSync?.deletion_enabled || configData.delete_after_import || false,
        duration: latestSync?.sync_duration_seconds || null,
        status: configData.sync_status as any || 'idle',
        errorMessage: latestSync?.error_message || configData.last_error_message || undefined
      });
    } catch (err) {
      console.error('Error fetching sync metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sync metrics');
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [user, configId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, loading, error, refreshMetrics: fetchMetrics };
};

// Hook for deletion audit logs
export const useDeletionAuditLogs = (configId?: string, limit: number = 50) => {
  const { user } = useAuth();
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('email_deletion_audit')
        .select('*')
        .eq('user_id', user.id)
        .order('deleted_at', { ascending: false })
        .limit(limit);

      if (configId) {
        query = query.eq('config_id', configId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setAuditLogs(data || []);
    } catch (err) {
      console.error('Error fetching deletion audit logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch deletion audit logs');
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  }, [user, configId, limit]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  return { auditLogs, loading, error, refreshAuditLogs: fetchAuditLogs };
};

export default {
  useEmailConfigs,
  useSyncHistory,
  useSyncSummary,
  useRecentSyncStatus,
  useDeletionAuditLogs
};