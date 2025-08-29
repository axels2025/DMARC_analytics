import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { 
  SPFRecord, 
  SPFAnalysis, 
  parseSPFRecord, 
  analyzeSPFRecord 
} from '@/utils/spfParser';
import { SPFOptimizer } from '@/utils/spfOptimizer';

export interface SPFAnalysisHistoryEntry {
  id: string;
  domain: string;
  spfRecord: string;
  lookupCount: number;
  riskLevel: string;
  analysisData: SPFAnalysis;
  createdAt: string;
}

export interface SPFMonitoringSettings {
  id: string;
  domain: string;
  monitorEnabled: boolean;
  alertThreshold: number;
  lastCheckedAt?: string;
  createdAt: string;
}

export const useSPFAnalysis = (domain?: string) => {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<SPFAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeRecord = useCallback(async (targetDomain: string) => {
    if (!user || !targetDomain) return;

    setLoading(true);
    setError(null);

    try {
      console.log(`[useSPFAnalysis] Starting analysis for domain: ${targetDomain}`);
      
      // Parse SPF record using our integrated DNS system
      const record = await parseSPFRecord(targetDomain);
      
      if (!record.isValid && record.errors.length > 0) {
        setError(record.errors.join(', '));
        setAnalysis(null);
        return;
      }

      // Analyze the record
      const analysisResult = await analyzeSPFRecord(record);
      
      // Enhance with optimizer suggestions
      const optimizer = new SPFOptimizer();
      const optimizationSuggestions = optimizer.analyzeOptimizations(record);
      
      const enhancedAnalysis: SPFAnalysis = {
        ...analysisResult,
        optimizationSuggestions
      };

      setAnalysis(enhancedAnalysis);

      // Store analysis in history if we have database access
      try {
        const { error: insertError } = await supabase
          .from('spf_analysis_history')
          .insert({
            user_id: user.id,
            domain: targetDomain,
            spf_record: record.raw,
            lookup_count: record.totalLookups,
            risk_level: enhancedAnalysis.riskLevel,
            analysis_data: enhancedAnalysis
          });

        if (insertError) {
          console.warn('[useSPFAnalysis] Failed to store analysis history:', insertError);
          // Don't fail the analysis if history storage fails
        }
      } catch (historyError) {
        console.warn('[useSPFAnalysis] History storage error:', historyError);
      }

    } catch (err) {
      console.error('[useSPFAnalysis] Analysis failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze SPF record');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshAnalysis = useCallback(() => {
    if (domain) {
      analyzeRecord(domain);
    }
  }, [domain, analyzeRecord]);

  // Auto-analyze when domain changes
  useEffect(() => {
    if (domain) {
      analyzeRecord(domain);
    }
  }, [domain, analyzeRecord]);

  return { 
    analysis, 
    loading, 
    error, 
    analyzeRecord, 
    refreshAnalysis 
  };
};

export const useSPFHistory = (domain?: string) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<SPFAnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('spf_analysis_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50); // Limit to recent 50 analyses

      if (domain) {
        query = query.eq('domain', domain);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const formattedHistory: SPFAnalysisHistoryEntry[] = (data || []).map(item => ({
        id: item.id,
        domain: item.domain,
        spfRecord: item.spf_record,
        lookupCount: item.lookup_count,
        riskLevel: item.risk_level,
        analysisData: item.analysis_data as SPFAnalysis,
        createdAt: item.created_at
      }));

      setHistory(formattedHistory);
    } catch (err) {
      console.error('[useSPFHistory] Failed to fetch history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch SPF analysis history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [user, domain]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refreshHistory: fetchHistory };
};

export const useSPFMonitoring = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SPFMonitoringSettings[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('user_spf_monitoring')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const formattedSettings: SPFMonitoringSettings[] = (data || []).map(item => ({
        id: item.id,
        domain: item.domain,
        monitorEnabled: item.monitor_enabled,
        alertThreshold: item.alert_threshold,
        lastCheckedAt: item.last_checked_at,
        createdAt: item.created_at
      }));

      setSettings(formattedSettings);
    } catch (err) {
      console.error('[useSPFMonitoring] Failed to fetch settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch monitoring settings');
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateMonitoringSettings = useCallback(async (
    domain: string,
    enabled: boolean,
    threshold: number = 8
  ) => {
    if (!user) return;

    try {
      const { error: upsertError } = await supabase
        .from('user_spf_monitoring')
        .upsert({
          user_id: user.id,
          domain,
          monitor_enabled: enabled,
          alert_threshold: threshold
        }, {
          onConflict: 'user_id,domain'
        });

      if (upsertError) throw upsertError;

      // Refresh settings after update
      await fetchSettings();
    } catch (err) {
      console.error('[useSPFMonitoring] Failed to update settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update monitoring settings');
    }
  }, [user, fetchSettings]);

  const removeMonitoring = useCallback(async (domain: string) => {
    if (!user) return;

    try {
      const { error: deleteError } = await supabase
        .from('user_spf_monitoring')
        .delete()
        .eq('user_id', user.id)
        .eq('domain', domain);

      if (deleteError) throw deleteError;

      // Refresh settings after removal
      await fetchSettings();
    } catch (err) {
      console.error('[useSPFMonitoring] Failed to remove monitoring:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove monitoring');
    }
  }, [user, fetchSettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { 
    settings, 
    loading, 
    error, 
    updateMonitoringSettings, 
    removeMonitoring, 
    refreshSettings: fetchSettings 
  };
};

// Hook for SPF health metrics across all user domains
export const useSPFHealthMetrics = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState({
    totalDomains: 0,
    healthyDomains: 0,
    warningDomains: 0,
    criticalDomains: 0,
    averageLookups: 0,
    lastAnalyzed: null as string | null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Get latest analysis for each domain
      const { data: latestAnalyses, error: fetchError } = await supabase
        .from('spf_analysis_history')
        .select('domain, lookup_count, risk_level, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Group by domain and get latest for each
      const domainLatest = new Map();
      (latestAnalyses || []).forEach(analysis => {
        if (!domainLatest.has(analysis.domain)) {
          domainLatest.set(analysis.domain, analysis);
        }
      });

      const analyses = Array.from(domainLatest.values());
      
      const healthyCount = analyses.filter(a => a.risk_level === 'low').length;
      const warningCount = analyses.filter(a => ['medium', 'high'].includes(a.risk_level)).length;
      const criticalCount = analyses.filter(a => a.risk_level === 'critical').length;
      
      const totalLookups = analyses.reduce((sum, a) => sum + a.lookup_count, 0);
      const avgLookups = analyses.length > 0 ? Math.round(totalLookups / analyses.length) : 0;
      
      const mostRecent = analyses.length > 0 
        ? analyses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null;

      setMetrics({
        totalDomains: analyses.length,
        healthyDomains: healthyCount,
        warningDomains: warningCount,
        criticalDomains: criticalCount,
        averageLookups: avgLookups,
        lastAnalyzed: mostRecent?.created_at || null
      });
    } catch (err) {
      console.error('[useSPFHealthMetrics] Failed to fetch metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch SPF health metrics');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, loading, error, refreshMetrics: fetchMetrics };
};

// Utility hook for SPF record validation without full analysis
export const useSPFValidation = () => {
  const validateRecord = useCallback(async (spfRecord: string) => {
    try {
      const parsedRecord = await parseSPFRecord(spfRecord);
      
      return {
        isValid: parsedRecord.isValid,
        lookupCount: parsedRecord.totalLookups,
        errors: parsedRecord.errors,
        warnings: parsedRecord.warnings,
        riskLevel: parsedRecord.totalLookups >= 10 ? 'critical' 
                  : parsedRecord.totalLookups >= 8 ? 'high'
                  : parsedRecord.totalLookups >= 6 ? 'medium' 
                  : 'low'
      };
    } catch (error) {
      return {
        isValid: false,
        lookupCount: 0,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: [],
        riskLevel: 'critical' as const
      };
    }
  }, []);

  return { validateRecord };
};