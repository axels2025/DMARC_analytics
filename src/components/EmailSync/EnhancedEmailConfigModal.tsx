import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, 
  Mail, 
  Trash2, 
  TestTube,
  Shield,
  AlertCircle,
  CheckCircle,
  Loader,
  RefreshCw,
  Calendar,
  Activity
} from 'lucide-react';
import { EmailConfig } from '@/services/gmailAuth';
import { EmailProvider, unifiedEmailService, getProviderFromString } from '@/services/emailProviderInterface';
import EmailProviderSelection from './EmailProviderSelection';
import UnifiedEmailSettingsPanel from './UnifiedEmailSettingsPanel';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

interface EnhancedEmailConfigModalProps {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  onConfigChange?: () => void;
}

// Provider-specific icons
const ProviderIcon = ({ provider }: { provider: EmailProvider }) => {
  if (provider === EmailProvider.GMAIL) {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <path fill="#EA4335" d="M24 12.27c0-.79-.07-1.54-.2-2.28H12.24v4.32h6.65c-.29 1.54-1.16 2.84-2.48 3.61v3.01h4.01c2.35-2.16 3.7-5.34 3.7-9.11z"/>
        <path fill="#34A853" d="M12.24 24c3.35 0 6.16-1.11 8.21-3.01l-4.01-3.11c-1.11.74-2.53 1.18-4.2 1.18-3.23 0-5.97-2.18-6.94-5.11H1.17v3.21C3.24 21.1 7.42 24 12.24 24z"/>
        <path fill="#FBBC05" d="M5.3 14.95A7.26 7.26 0 0 1 5.3 9.05V5.84H1.17A12.24 12.24 0 0 0 1.17 17.16z"/>
        <path fill="#EA4335" d="M12.24 4.75c1.82 0 3.45.62 4.73 1.85l3.55-3.55C18.4 1.19 15.59 0 12.24 0 7.42 0 3.24 2.9 1.17 7.84l4.13 3.21c.97-2.93 3.71-5.11 6.94-5.11z"/>
      </svg>
    );
  } else {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <path fill="#0078D4" d="M24 12c0 6.627-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0s12 5.373 12 12z"/>
        <path fill="#FFFFFF" d="M8.5 7h7c.828 0 1.5.672 1.5 1.5v7c0 .828-.672 1.5-1.5 1.5h-7C7.672 17 7 16.328 7 15.5v-7C7 7.672 7.672 7 8.5 7zm6.5 2.5v5l-3-2.5 3-2.5z"/>
      </svg>
    );
  }
};

export function EnhancedEmailConfigModal({ 
  children, 
  defaultOpen = false,
  onConfigChange 
}: EnhancedEmailConfigModalProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingConnections, setTestingConnections] = useState<Set<string>>(new Set());
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      // Load configs from all providers
      const userConfigs = await unifiedEmailService.getUserEmailConfigs(user.id);
      setConfigs(userConfigs);
    } catch (error) {
      console.error('Error loading email configs:', error);
      toast({
        title: 'Error Loading Configurations',
        description: 'Failed to load email configurations. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && user) {
      loadConfigs();
    }
  }, [isOpen, user, loadConfigs]);

  const handleConfigAdded = (newConfig: EmailConfig) => {
    setConfigs(prev => [newConfig, ...prev.filter(c => c.id !== newConfig.id)]);
    onConfigChange?.();
  };

  const handleConfigsUpdated = (updatedConfigs: EmailConfig[]) => {
    setConfigs(updatedConfigs);
    onConfigChange?.();
  };

  const handleDeleteConfig = async (config: EmailConfig) => {
    if (!user) return;

    const provider = getProviderFromString(config.provider);
    const providerName = provider === EmailProvider.GMAIL ? 'Gmail' : 'Outlook';
    
    const confirmDelete = confirm(`Are you sure you want to disconnect ${config.email_address} from ${providerName}?`);
    if (!confirmDelete) return;

    try {
      await unifiedEmailService.deleteEmailConfig(config.id, user.id, provider);
      await loadConfigs();
      onConfigChange?.();
      
      toast({
        title: 'Configuration Deleted',
        description: `${config.email_address} has been disconnected from ${providerName}`,
        variant: 'default'
      });
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete configuration',
        variant: 'destructive'
      });
    }
  };

  const handleToggleActive = async (config: EmailConfig) => {
    if (!user) return;

    const provider = getProviderFromString(config.provider);
    const providerName = provider === EmailProvider.GMAIL ? 'Gmail' : 'Outlook';

    try {
      await unifiedEmailService.toggleConfigStatus(config.id, user.id, !config.is_active, provider);
      await loadConfigs();
      onConfigChange?.();
      
      toast({
        title: config.is_active ? 'Configuration Disabled' : 'Configuration Enabled',
        description: `${config.email_address} sync has been ${config.is_active ? 'disabled' : 'enabled'}`,
        variant: 'default'
      });
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update configuration',
        variant: 'destructive'
      });
    }
  };

  const handleTestConnection = async (config: EmailConfig) => {
    if (!user || testingConnections.has(config.id)) return;

    const provider = getProviderFromString(config.provider);

    try {
      setTestingConnections(prev => new Set([...prev, config.id]));
      
      const result = await unifiedEmailService.testConnection(config.id, user.id, provider);
      
      if (result) {
        toast({
          title: 'Connection Successful',
          description: `${config.provider} connection is working properly`,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: `${config.provider} connection test failed`,
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Connection test failed',
        variant: 'destructive'
      });
    } finally {
      setTestingConnections(prev => {
        const next = new Set(prev);
        next.delete(config.id);
        return next;
      });
    }
  };

  const handleSyncComplete = () => {
    loadConfigs();
    onConfigChange?.();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'syncing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get list of configured providers
  const configuredProviders = unifiedEmailService.getConfiguredProviders();
  const hasAnyProviderConfigured = configuredProviders.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Email Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Integration Settings
          </DialogTitle>
          <DialogDescription>
            Connect your Gmail or Outlook accounts to automatically sync DMARC reports. 
            Your authentication tokens are encrypted and stored securely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Provider Configuration Status */}
          {!hasAnyProviderConfigured && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Setup Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  No email providers are currently configured. You'll need to set up at least one provider to sync DMARC reports.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-900 mb-2">Configuration Status:</h4>
                  <div className="space-y-2">
                    {Object.values(EmailProvider).map(provider => {
                      const isConfigured = unifiedEmailService.isProviderConfigured(provider);
                      const status = unifiedEmailService.getProviderConfigurationStatus(provider);
                      const providerName = provider === EmailProvider.GMAIL ? 'Gmail' : 'Microsoft Outlook';
                      
                      return (
                        <div key={provider} className="flex items-center gap-2 text-sm">
                          <div className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="font-medium">{providerName}:</span>
                          <span className={isConfigured ? 'text-green-700' : 'text-red-700'}>
                            {status.message}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add New Connection */}
          {hasAnyProviderConfigured && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {configs.length === 0 ? 'Connect Email Account' : 'Add Email Account'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EmailProviderSelection
                  onConfigAdded={handleConfigAdded}
                  onConfigUpdated={handleConfigsUpdated}
                  existingConfigs={configs}
                  mode={configs.length === 0 ? 'select' : 'add'}
                />
              </CardContent>
            </Card>
          )}

          {/* Existing Configurations */}
          {hasAnyProviderConfigured && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="w-6 h-6 animate-spin" />
                  <span className="ml-2">Loading configurations...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Connected Accounts ({configs.length})</h3>
                  
                  {configs.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Mail className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 mb-2">No email accounts connected</p>
                        <p className="text-sm text-gray-500">
                          Connect your email account above to start syncing DMARC reports automatically.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {configs.map((config) => {
                        const provider = getProviderFromString(config.provider);
                        const isDetailView = selectedConfig === config.id;
                        
                        return (
                          <Card key={config.id}>
                            <CardHeader>
                              <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <ProviderIcon provider={provider} />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span>{config.email_address}</span>
                                      <Badge variant="outline" className="capitalize">
                                        {provider === EmailProvider.GMAIL ? 'Gmail' : 'Outlook'}
                                      </Badge>
                                    </div>
                                    {config.last_sync_at && (
                                      <p className="text-sm text-gray-500 mt-1">
                                        Last sync: {format(new Date(config.last_sync_at), 'MMM d, yyyy h:mm a')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant="outline" 
                                    className={getStatusColor(config.sync_status)}
                                  >
                                    {config.sync_status === 'syncing' && <Loader className="w-3 h-3 mr-1 animate-spin" />}
                                    {config.sync_status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                                    {config.sync_status === 'error' && <AlertCircle className="w-3 h-3 mr-1" />}
                                    <span className="capitalize">{config.sync_status}</span>
                                  </Badge>
                                  {config.auto_sync_enabled && (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                      <Activity className="w-3 h-3 mr-1" />
                                      Auto
                                    </Badge>
                                  )}
                                </div>
                              </CardTitle>
                            </CardHeader>
                            
                            <CardContent className="space-y-4">
                              {/* Quick Actions */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Switch
                                    checked={config.is_active}
                                    onCheckedChange={() => handleToggleActive(config)}
                                  />
                                  <label className="text-sm font-medium">
                                    Active
                                  </label>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => setSelectedConfig(isDetailView ? null : config.id)}
                                    size="sm"
                                    variant="outline"
                                  >
                                    <Settings className="w-4 h-4" />
                                    <span className="ml-2">{isDetailView ? 'Hide' : 'Settings'}</span>
                                  </Button>
                                  
                                  <Button
                                    onClick={() => handleTestConnection(config)}
                                    disabled={testingConnections.has(config.id) || !config.is_active}
                                    size="sm"
                                    variant="outline"
                                  >
                                    {testingConnections.has(config.id) ? (
                                      <Loader className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <TestTube className="w-4 h-4" />
                                    )}
                                    <span className="ml-2">Test</span>
                                  </Button>
                                  
                                  <Button
                                    onClick={() => handleDeleteConfig(config)}
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              {/* Sync Status */}
                              {config.is_active && (
                                <>
                                  <Separator />
                                  <SyncStatusIndicator 
                                    config={config}
                                    onSyncComplete={handleSyncComplete}
                                    showDetails={false}
                                  />
                                </>
                              )}

                              {/* Detailed Settings */}
                              {isDetailView && (
                                <>
                                  <Separator />
                                  <div className="mt-4">
                                    <UnifiedEmailSettingsPanel
                                      config={config}
                                      onConfigUpdate={loadConfigs}
                                    />
                                  </div>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Information Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security & Privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p>Authentication tokens are encrypted using AES-256 encryption before storage</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p>Only read-only access to your email account is requested by default</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p>We only access emails with DMARC report attachments</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p>You can disconnect your account at any time</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p>Supports both Gmail and Microsoft Outlook/Office 365</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}