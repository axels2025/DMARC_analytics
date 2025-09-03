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
import { EmailConfig, gmailAuthService } from '@/services/gmailAuth';
import { emailProcessor } from '@/services/emailProcessor';
import { GmailOAuthButton } from './GmailOAuthButton';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

interface EmailConfigModalProps {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  onConfigChange?: () => void;
}

export function EmailConfigModal({ 
  children, 
  defaultOpen = false,
  onConfigChange 
}: EmailConfigModalProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingConnections, setTestingConnections] = useState<Set<string>>(new Set());

  const loadConfigs = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const userConfigs = await gmailAuthService.getUserEmailConfigs(user.id);
      setConfigs(userConfigs);
    } catch (error) {
      console.error('Error loading email configs:', error);
      toast({
        title: 'Error Loading Configurations',
        description: 'Failed to load email configurations',
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

    const confirmDelete = confirm(`Are you sure you want to disconnect ${config.email_address}?`);
    if (!confirmDelete) return;

    try {
      await gmailAuthService.deleteEmailConfig(config.id, user.id);
      await loadConfigs();
      onConfigChange?.();
      
      toast({
        title: 'Configuration Deleted',
        description: `${config.email_address} has been disconnected`,
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

    try {
      await gmailAuthService.toggleConfigStatus(config.id, user.id, !config.is_active);
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

    try {
      setTestingConnections(prev => new Set([...prev, config.id]));
      
      const result = await emailProcessor.testConnection(config.id, user.id);
      
      if (result.success) {
        toast({
          title: 'Connection Successful',
          description: result.message,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: result.message,
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Integration Settings
          </DialogTitle>
          <DialogDescription>
            Connect your Gmail account to automatically sync DMARC reports. 
            Your authentication tokens are encrypted and stored securely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add New Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connect New Email Account</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-4">
                    Connect your Gmail account to automatically fetch DMARC reports. 
                    We'll search for emails with DMARC report attachments and process them automatically.
                  </p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Shield className="w-4 h-4" />
                    <span>Read-only access to your Gmail account</span>
                  </div>
                </div>
                <GmailOAuthButton
                  onConfigAdded={handleConfigAdded}
                  onConfigUpdated={handleConfigsUpdated}
                  existingConfigs={configs}
                  showStatus={false}
                />
              </div>
            </CardContent>
          </Card>

          {/* Existing Configurations */}
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
                      Connect your Gmail account above to start syncing DMARC reports automatically.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {configs.map((config) => (
                    <Card key={config.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span>{config.email_address}</span>
                                <Badge variant="outline" className="capitalize">
                                  {config.provider}
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
                        {/* Configuration Controls */}
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
                              showDetails={true}
                            />
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
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
                <p>Only read-only access to your Gmail account is requested</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p>We only access emails with DMARC report attachments</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p>You can disconnect your account at any time</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}