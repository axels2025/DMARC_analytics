import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ipIntelligenceService, IPIntelligenceData, IPIntelligenceBatchResponse, IPIntelligenceStats } from '@/services/ipIntelligenceService';
import { toast } from '@/components/ui/use-toast';

export interface IPIntelligenceConfig {
  enabled: boolean;
  batchSize: number;
  retryAttempts: number;
  showCacheStatus: boolean;
  autoRefreshInterval: number; // minutes, 0 = disabled
}

interface UseIPIntelligenceResult {
  // Data
  stats: IPIntelligenceStats | null;
  config: IPIntelligenceConfig;
  
  // Loading states
  loading: boolean;
  processingIPs: boolean;
  
  // Error handling
  error: string | null;
  lastError: Error | null;
  
  // Actions
  getIPIntelligence: (ip: string) => Promise<IPIntelligenceData | null>;
  getIPIntelligenceBatch: (ips: string[]) => Promise<IPIntelligenceBatchResponse | null>;
  refreshStats: () => Promise<void>;
  clearCache: () => Promise<void>;
  updateConfig: (newConfig: Partial<IPIntelligenceConfig>) => void;
  clearError: () => void;
  
  // Utilities
  isValidIP: (ip: string) => boolean;
  filterValidIPs: (ips: string[]) => string[];
  getThreatLevelColor: (level: string) => string;
  formatLocation: (data: IPIntelligenceData) => string;
  formatOrganization: (data: IPIntelligenceData) => string;
}

const DEFAULT_CONFIG: IPIntelligenceConfig = {
  enabled: true,
  batchSize: 10,
  retryAttempts: 3,
  showCacheStatus: true,
  autoRefreshInterval: 0, // Disabled by default
};

export function useIPIntelligence(): UseIPIntelligenceResult {
  const { user } = useAuth();
  const [stats, setStats] = useState<IPIntelligenceStats | null>(null);
  const [config, setConfig] = useState<IPIntelligenceConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [processingIPs, setProcessingIPs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('ip-intelligence-config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      }
    } catch (error) {
      console.warn('Failed to load IP intelligence config from localStorage:', error);
    }
  }, []);

  // Save config to localStorage when it changes
  const updateConfig = useCallback((newConfig: Partial<IPIntelligenceConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    
    try {
      localStorage.setItem('ip-intelligence-config', JSON.stringify(updatedConfig));
    } catch (error) {
      console.warn('Failed to save IP intelligence config to localStorage:', error);
    }
  }, [config]);

  // Error handling helper
  const handleError = useCallback((error: Error | string, context: string) => {
    const errorObj = error instanceof Error ? error : new Error(error);
    const errorMessage = errorObj.message;
    
    setLastError(errorObj);
    setError(`${context}: ${errorMessage}`);
    
    console.error(`IP Intelligence ${context}:`, errorObj);
    
    // Show user-friendly error messages
    let userMessage = errorMessage;
    
    if (errorMessage.includes('auth') || errorMessage.includes('401')) {
      userMessage = 'Authentication required. Please refresh the page and try again.';
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      userMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      userMessage = 'Network error. Please check your connection and try again.';
    } else if (errorMessage.includes('timeout')) {
      userMessage = 'Request timed out. The service may be temporarily unavailable.';
    }
    
    toast({
      title: `IP Intelligence Error`,
      description: userMessage,
      variant: 'destructive',
    });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setLastError(null);
  }, []);

  // Get single IP intelligence
  const getIPIntelligence = useCallback(async (ip: string): Promise<IPIntelligenceData | null> => {
    if (!config.enabled || !user) return null;
    
    if (!ipIntelligenceService.isValidIP(ip)) {
      handleError(new Error(`Invalid IP address: ${ip}`), 'IP Validation');
      return null;
    }

    try {
      setProcessingIPs(true);
      clearError();
      
      const result = await ipIntelligenceService.getIPIntelligence(ip);
      
      if (config.showCacheStatus && result.cached) {
        console.log(`IP ${ip} served from cache (${result.cache_age_hours}h old)`);
      }
      
      return result;
    } catch (error) {
      handleError(error as Error, 'Single IP Lookup');
      return null;
    } finally {
      setProcessingIPs(false);
    }
  }, [config, user, handleError, clearError]);

  // Get batch IP intelligence
  const getIPIntelligenceBatch = useCallback(async (ips: string[]): Promise<IPIntelligenceBatchResponse | null> => {
    if (!config.enabled || !user) return null;
    
    if (ips.length === 0) {
      handleError(new Error('No IP addresses provided'), 'Batch Processing');
      return null;
    }

    try {
      setProcessingIPs(true);
      clearError();
      
      // Filter valid IPs
      const validIPs = ipIntelligenceService.filterValidIPs(ips);
      const invalidCount = ips.length - validIPs.length;
      
      if (invalidCount > 0) {
        console.warn(`Filtered out ${invalidCount} invalid IP address(es)`);
      }
      
      if (validIPs.length === 0) {
        throw new Error('No valid IP addresses found');
      }
      
      const result = await ipIntelligenceService.getIPIntelligenceBatch(validIPs);
      
      // Show cache performance if enabled
      if (config.showCacheStatus && result.metadata) {
        const { cache_hits, cache_misses, processing_time_ms, providers_used } = result.metadata;
        const total = cache_hits + cache_misses;
        
        if (total > 0) {
          const hitRate = ((cache_hits / total) * 100).toFixed(1);
          console.log(`Cache performance: ${cache_hits}/${total} hits (${hitRate}%) in ${processing_time_ms}ms`);
          
          if (providers_used.length > 0) {
            console.log(`Providers used: ${providers_used.join(', ')}`);
          }
        }
      }
      
      // Show success message for large batches
      if (validIPs.length > 5) {
        toast({
          title: 'IP Intelligence Complete',
          description: `Processed ${validIPs.length} IP addresses successfully${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`,
          variant: result.errors.length === 0 ? 'default' : 'destructive',
        });
      }
      
      return result;
    } catch (error) {
      handleError(error as Error, 'Batch IP Lookup');
      return null;
    } finally {
      setProcessingIPs(false);
    }
  }, [config, user, handleError, clearError]);

  // Refresh statistics
  const refreshStats = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      clearError();
      
      const newStats = await ipIntelligenceService.getIPIntelligenceStats();
      setStats(newStats);
      
      console.log('IP Intelligence Stats:', newStats);
    } catch (error) {
      handleError(error as Error, 'Stats Refresh');
    } finally {
      setLoading(false);
    }
  }, [user, handleError, clearError]);

  // Clear cache
  const clearCache = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      clearError();
      
      await ipIntelligenceService.cleanupCache();
      await refreshStats(); // Refresh stats after clearing cache
      
      toast({
        title: 'Cache Cleared',
        description: 'IP intelligence cache has been cleared successfully',
        variant: 'default',
      });
    } catch (error) {
      handleError(error as Error, 'Cache Clear');
    } finally {
      setLoading(false);
    }
  }, [user, handleError, clearError, refreshStats]);

  // Auto-refresh stats if configured
  useEffect(() => {
    if (!user || !config.enabled || config.autoRefreshInterval <= 0) return;

    const interval = setInterval(() => {
      refreshStats();
    }, config.autoRefreshInterval * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, config.enabled, config.autoRefreshInterval, refreshStats]);

  // Load initial stats
  useEffect(() => {
    if (user && config.enabled) {
      refreshStats();
    }
  }, [user, config.enabled, refreshStats]);

  return {
    // Data
    stats,
    config,
    
    // Loading states
    loading,
    processingIPs,
    
    // Error handling
    error,
    lastError,
    
    // Actions
    getIPIntelligence,
    getIPIntelligenceBatch,
    refreshStats,
    clearCache,
    updateConfig,
    clearError,
    
    // Utilities
    isValidIP: ipIntelligenceService.isValidIP,
    filterValidIPs: ipIntelligenceService.filterValidIPs,
    getThreatLevelColor: ipIntelligenceService.getThreatLevelColor,
    formatLocation: ipIntelligenceService.formatLocation,
    formatOrganization: ipIntelligenceService.formatOrganization,
  };
}