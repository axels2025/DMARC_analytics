import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { maskEmailAddress, truncateSubject, getFailureTypeLabel } from '@/utils/privacyProtection';

export interface ForensicMetrics {
  totalFailedEmails: number;
  uniqueSources: number;
  commonFailureType: string;
  recentActivityCount: number;
  topThreatSources: Array<{
    ip: string;
    count: number;
    provider: string;
    lastSeen: Date;
  }>;
  failureTypes: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  timelineCounts: Array<{
    date: string;
    count: number;
  }>;
}

export interface ForensicRecord {
  id: string;
  arrivalDate: Date;
  sourceIp: string;
  maskedFrom: string;
  maskedTo: string;
  truncatedSubject: string;
  authFailure: string;
  spfResult: string;
  dkimResult: string;
  dmarcResult: string;
  policyEvaluated: string;
  messageId?: string;
  domain: string;
  reportId: string;
  rawData?: {
    originalHeaders?: string;
    messageBody?: string;
    isEncrypted: boolean;
  };
}

export interface ForensicFilters {
  dateRange: {
    start: Date;
    end: Date;
  };
  sourceIp?: string;
  failureTypes?: string[];
  domains?: string[];
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface ForensicDataState {
  records: ForensicRecord[];
  metrics: ForensicMetrics | null;
  loading: boolean;
  error: string | null;
  totalCount: number;
  hasMore: boolean;
}

const DEFAULT_FILTERS: ForensicFilters = {
  dateRange: {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    end: new Date(),
  },
  limit: 50,
  offset: 0,
};

export const useForensicData = (domain?: string, filters: Partial<ForensicFilters> = {}) => {
  const { user } = useAuth();
  const [state, setState] = useState<ForensicDataState>({
    records: [],
    metrics: null,
    loading: true,
    error: null,
    totalCount: 0,
    hasMore: false,
  });

  const mergedFilters = useMemo(() => ({
    ...DEFAULT_FILTERS,
    ...filters,
  }), [filters]);

  const fetchForensicRecords = useCallback(async (appendResults = false) => {
    if (!user) {
      setState(prev => ({ ...prev, loading: false, error: 'User not authenticated' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Build the query for forensic reports
      let query = supabase
        .from('dmarc_forensic_reports')
        .select('*')
        .eq('user_id', user.id)
        .gte('arrival_date', Math.floor(mergedFilters.dateRange.start.getTime() / 1000))
        .lte('arrival_date', Math.floor(mergedFilters.dateRange.end.getTime() / 1000))
        .order('arrival_date', { ascending: false });

      // Apply domain filter
      if (domain && domain !== 'all') {
        query = query.eq('domain', domain);
      }

      // Apply additional filters
      if (mergedFilters.domains && mergedFilters.domains.length > 0 && !domain) {
        query = query.in('domain', mergedFilters.domains);
      }

      if (mergedFilters.sourceIp) {
        query = query.eq('source_ip', mergedFilters.sourceIp);
      }

      // Apply pagination
      const startIndex = appendResults ? state.records.length : (mergedFilters.offset || 0);
      query = query.range(startIndex, startIndex + (mergedFilters.limit || 50) - 1);

      const { data: forensicReports, error: fetchError, count } = await query;

      if (fetchError) {
        console.error('Error fetching forensic reports:', fetchError);
        
        // Check if it's a missing table error
        if (fetchError.code === '42P01' || fetchError.message.includes('does not exist')) {
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Forensic reports table not found. Please apply database migrations to enable forensic reporting.' 
          }));
        } else {
          setState(prev => ({ ...prev, loading: false, error: fetchError.message }));
        }
        return;
      }

      // Transform the data with privacy protection
      const transformedRecords: ForensicRecord[] = (forensicReports || []).map(report => ({
        id: report.id,
        arrivalDate: new Date(report.arrival_date * 1000),
        sourceIp: report.source_ip || '',
        maskedFrom: maskEmailAddress(report.envelope_from || '', 'medium'),
        maskedTo: maskEmailAddress(report.envelope_to || '', 'medium'),
        truncatedSubject: truncateSubject(report.subject || '', 60, 'medium'),
        authFailure: getFailureTypeLabel(report.spf_result, report.dkim_result),
        spfResult: report.spf_result || '',
        dkimResult: report.dkim_result || '',
        dmarcResult: report.dmarc_result || '',
        policyEvaluated: report.policy_evaluated || '',
        messageId: report.message_id || undefined,
        domain: report.domain,
        reportId: report.report_id,
        rawData: {
          originalHeaders: report.original_headers,
          messageBody: report.message_body,
          isEncrypted: report.is_encrypted || false,
        },
      }));

      // Apply client-side filters for more complex filtering
      let filteredRecords = transformedRecords;

      if (mergedFilters.failureTypes && mergedFilters.failureTypes.length > 0) {
        filteredRecords = filteredRecords.filter(record =>
          mergedFilters.failureTypes?.includes(record.authFailure.toLowerCase())
        );
      }

      if (mergedFilters.searchQuery) {
        const searchLower = mergedFilters.searchQuery.toLowerCase();
        filteredRecords = filteredRecords.filter(record =>
          record.truncatedSubject.toLowerCase().includes(searchLower) ||
          record.sourceIp.includes(searchLower) ||
          record.maskedFrom.toLowerCase().includes(searchLower) ||
          record.domain.toLowerCase().includes(searchLower)
        );
      }

      setState(prev => ({
        ...prev,
        records: appendResults ? [...prev.records, ...filteredRecords] : filteredRecords,
        loading: false,
        totalCount: count || 0,
        hasMore: (count || 0) > startIndex + (mergedFilters.limit || 50),
      }));

    } catch (error) {
      console.error('Error in fetchForensicRecords:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }));
    }
  }, [user, domain, mergedFilters, state.records.length]);

  const fetchMetrics = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch metrics data
      let metricsQuery = supabase
        .from('dmarc_forensic_reports')
        .select('*')
        .eq('user_id', user.id)
        .gte('arrival_date', Math.floor(mergedFilters.dateRange.start.getTime() / 1000))
        .lte('arrival_date', Math.floor(mergedFilters.dateRange.end.getTime() / 1000));

      if (domain && domain !== 'all') {
        metricsQuery = metricsQuery.eq('domain', domain);
      }

      const { data: metricsData, error: metricsError } = await metricsQuery;

      if (metricsError) {
        console.error('Error fetching metrics:', metricsError);
        
        // Handle missing table gracefully for metrics
        if (metricsError.code === '42P01' || metricsError.message.includes('does not exist')) {
          // Provide default metrics when table doesn't exist
          const defaultMetrics: ForensicMetrics = {
            totalFailedEmails: 0,
            uniqueSources: 0,
            commonFailureType: 'No Data',
            recentActivityCount: 0,
            topThreatSources: [],
            failureTypes: [],
            timelineCounts: []
          };
          setState(prev => ({ ...prev, metrics: defaultMetrics }));
        }
        return;
      }

      if (!metricsData) return;

      // Calculate metrics
      const totalFailedEmails = metricsData.length;
      const uniqueSources = new Set(metricsData.map(r => r.source_ip)).size;
      
      // Calculate failure types
      const failureTypeCounts = metricsData.reduce((acc: Record<string, number>, report) => {
        const failureType = getFailureTypeLabel(report.spf_result, report.dkim_result);
        acc[failureType] = (acc[failureType] || 0) + 1;
        return acc;
      }, {});

      const failureTypes = Object.entries(failureTypeCounts).map(([type, count]) => ({
        type,
        count: count as number,
        percentage: ((count as number) / totalFailedEmails) * 100,
      })).sort((a, b) => b.count - a.count);

      const commonFailureType = failureTypes[0]?.type || 'Unknown';

      // Calculate top threat sources
      const sourceIpCounts = metricsData.reduce((acc: Record<string, { count: number; lastSeen: number }>, report) => {
        const ip = report.source_ip;
        if (!acc[ip]) {
          acc[ip] = { count: 0, lastSeen: 0 };
        }
        acc[ip].count++;
        acc[ip].lastSeen = Math.max(acc[ip].lastSeen, report.arrival_date);
        return acc;
      }, {});

      const topThreatSources = Object.entries(sourceIpCounts)
        .map(([ip, data]) => ({
          ip,
          count: data.count,
          provider: 'Unknown', // TODO: Integrate IP geolocation service
          lastSeen: new Date(data.lastSeen * 1000),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Calculate timeline data (last 7 days)
      const timelineCounts = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const dayStart = Math.floor(date.setHours(0, 0, 0, 0) / 1000);
        const dayEnd = Math.floor(date.setHours(23, 59, 59, 999) / 1000);
        
        const count = metricsData.filter(r => 
          r.arrival_date >= dayStart && r.arrival_date <= dayEnd
        ).length;
        
        timelineCounts.push({ date: dateStr, count });
      }

      // Recent activity (last 24 hours)
      const yesterday = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      const recentActivityCount = metricsData.filter(r => r.arrival_date >= yesterday).length;

      const metrics: ForensicMetrics = {
        totalFailedEmails,
        uniqueSources,
        commonFailureType,
        recentActivityCount,
        topThreatSources,
        failureTypes,
        timelineCounts,
      };

      setState(prev => ({ ...prev, metrics }));

    } catch (error) {
      console.error('Error calculating metrics:', error);
    }
  }, [user, domain, mergedFilters.dateRange]);

  // Fetch data when dependencies change
  useEffect(() => {
    fetchForensicRecords();
    fetchMetrics();
  }, [fetchForensicRecords, fetchMetrics]);

  const refetch = useCallback(() => {
    fetchForensicRecords();
    fetchMetrics();
  }, [fetchForensicRecords, fetchMetrics]);

  const loadMore = useCallback(() => {
    if (state.hasMore && !state.loading) {
      fetchForensicRecords(true);
    }
  }, [fetchForensicRecords, state.hasMore, state.loading]);

  return {
    ...state,
    refetch,
    loadMore,
  };
};

export default useForensicData;