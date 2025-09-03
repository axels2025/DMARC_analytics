import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { gmailAuthService, EmailConfig } from '@/services/gmailAuth';
import { emailProcessor } from '@/services/emailProcessor';

export function useEmailSync() {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load email configurations
  const loadConfigs = async () => {
    if (!user) {
      setConfigs([]);
      setLoading(false);
      return;
    }

    // Check if Gmail is configured first
    if (!gmailAuthService.isGmailConfigured()) {
      console.warn('Gmail integration not configured, skipping config load');
      setConfigs([]);
      setLoading(false);
      setError(null); // Don't treat this as an error
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const userConfigs = await gmailAuthService.getUserEmailConfigs(user.id);
      setConfigs(userConfigs);
    } catch (err) {
      console.error('Error loading email configs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load email configurations');
    } finally {
      setLoading(false);
    }
  };

  // Initialize on user change
  useEffect(() => {
    loadConfigs();
  }, [user]);

  // Get active Gmail config
  const getActiveGmailConfig = (): EmailConfig | null => {
    return configs.find(config => 
      config.provider === 'gmail' && 
      config.is_active
    ) || null;
  };

  // Check if any config is currently syncing
  const isAnySyncing = (): boolean => {
    return configs.some(config => config.sync_status === 'syncing');
  };

  // Get count of configs by status
  const getStatusCounts = () => {
    return configs.reduce(
      (acc, config) => {
        acc.total++;
        if (config.is_active) acc.active++;
        if (config.sync_status === 'error') acc.errors++;
        if (config.sync_status === 'syncing') acc.syncing++;
        return acc;
      },
      { total: 0, active: 0, errors: 0, syncing: 0 }
    );
  };

  // Test connection for a specific config
  const testConnection = async (configId: string): Promise<{
    success: boolean;
    message: string;
    emailsFound?: number;
  }> => {
    if (!user) {
      return { success: false, message: 'User not authenticated' };
    }

    if (!gmailAuthService.isGmailConfigured()) {
      return { 
        success: false, 
        message: 'Gmail integration not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable.' 
      };
    }

    try {
      const result = await emailProcessor.testConnection(configId, user.id);
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  };

  // Trigger manual sync for a config
  const triggerSync = async (
    configId: string,
    onProgress?: (progress: any) => void
  ): Promise<boolean> => {
    if (!user) return false;

    if (!gmailAuthService.isGmailConfigured()) {
      console.error('Gmail integration not configured');
      return false;
    }

    try {
      const result = await emailProcessor.syncDmarcReports(
        configId,
        user.id,
        onProgress
      );
      
      // Reload configs after sync
      await loadConfigs();
      
      return result.success;
    } catch (error) {
      console.error('Sync failed:', error);
      return false;
    }
  };

  // Toggle config active status
  const toggleConfigStatus = async (configId: string, isActive: boolean): Promise<boolean> => {
    if (!user) return false;

    try {
      await gmailAuthService.toggleConfigStatus(configId, user.id, isActive);
      await loadConfigs();
      return true;
    } catch (error) {
      console.error('Failed to toggle config status:', error);
      return false;
    }
  };

  // Delete config
  const deleteConfig = async (configId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      await gmailAuthService.deleteEmailConfig(configId, user.id);
      await loadConfigs();
      return true;
    } catch (error) {
      console.error('Failed to delete config:', error);
      return false;
    }
  };

  // Add new config (after OAuth flow)
  const addConfig = async (credentials: any): Promise<boolean> => {
    if (!user) return false;

    try {
      await gmailAuthService.saveEmailConfig(credentials, user.id);
      await loadConfigs();
      return true;
    } catch (error) {
      console.error('Failed to add config:', error);
      return false;
    }
  };

  return {
    // State
    configs,
    loading,
    error,
    
    // Computed values
    activeGmailConfig: getActiveGmailConfig(),
    isAnySyncing: isAnySyncing(),
    statusCounts: getStatusCounts(),
    
    // Actions
    loadConfigs,
    testConnection,
    triggerSync,
    toggleConfigStatus,
    deleteConfig,
    addConfig
  };
}