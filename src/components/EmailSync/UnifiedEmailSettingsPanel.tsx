import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Settings,
  Shield,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Mail,
  Unlink
} from 'lucide-react';
import { EmailConfig } from '@/hooks/useEmailSync';
import { EmailProvider, unifiedEmailService, getProviderFromString } from '@/services/emailProviderInterface';
import DeletionConfirmationDialog from './DeletionConfirmationDialog';
import { useAuth } from '@/hooks/useAuth';

// Provider-specific icons
const ProviderIcon = ({ provider }: { provider: EmailProvider }) => {
  if (provider === EmailProvider.GMAIL) {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path fill="#EA4335" d="M24 12.27c0-.79-.07-1.54-.2-2.28H12.24v4.32h6.65c-.29 1.54-1.16 2.84-2.48 3.61v3.01h4.01c2.35-2.16 3.7-5.34 3.7-9.11z"/>
        <path fill="#34A853" d="M12.24 24c3.35 0 6.16-1.11 8.21-3.01l-4.01-3.11c-1.11.74-2.53 1.18-4.2 1.18-3.23 0-5.97-2.18-6.94-5.11H1.17v3.21C3.24 21.1 7.42 24 12.24 24z"/>
        <path fill="#FBBC05" d="M5.3 14.95A7.26 7.26 0 0 1 5.3 9.05V5.84H1.17A12.24 12.24 0 0 0 1.17 17.16z"/>
        <path fill="#EA4335" d="M12.24 4.75c1.82 0 3.45.62 4.73 1.85l3.55-3.55C18.4 1.19 15.59 0 12.24 0 7.42 0 3.24 2.9 1.17 7.84l4.13 3.21c.97-2.93 3.71-5.11 6.94-5.11z"/>
      </svg>
    );
  } else {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path fill="#0078D4" d="M24 12c0 6.627-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0s12 5.373 12 12z"/>
        <path fill="#FFFFFF" d="M8.5 7h7c.828 0 1.5.672 1.5 1.5v7c0 .828-.672 1.5-1.5 1.5h-7C7.672 17 7 16.328 7 15.5v-7C7 7.672 7.672 7 8.5 7zm6.5 2.5v5l-3-2.5 3-2.5z"/>
      </svg>
    );
  }
};

interface UnifiedEmailSettingsPanelProps {
  config: EmailConfig;
  onConfigUpdate?: () => void;
}

const UnifiedEmailSettingsPanel: React.FC<UnifiedEmailSettingsPanelProps> = ({
  config,
  onConfigUpdate
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [showDeletionConfirm, setShowDeletionConfirm] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Determine provider from config
  const provider = getProviderFromString(config.provider);
  const providerName = provider === EmailProvider.GMAIL ? 'Gmail' : 'Outlook';
  const authService = unifiedEmailService['getAuthService'](provider);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleToggleActive = async (enabled: boolean) => {
    if (!user) return;
    
    setLoading('active');
    clearMessages();
    
    try {
      await unifiedEmailService.toggleConfigStatus(config.id, user.id, enabled, provider);
      setSuccess(enabled 
        ? `✅ ${providerName} integration is now active and ready to sync` 
        : `⏸️ ${providerName} integration paused - no automatic syncing`
      );
      onConfigUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update ${providerName} integration setting`);
    } finally {
      setLoading(null);
    }
  };

  const handleToggleUnreadOnly = async (enabled: boolean) => {
    if (!user) return;
    
    setLoading('unreadonly');
    clearMessages();
    
    try {
      const authService = unifiedEmailService['getAuthService'](provider);
      await authService.updateSyncUnreadOnly(config.id, user.id, enabled);
      setSuccess(enabled 
        ? '📬 Now syncing unread emails only (recommended for cleaner inbox management)' 
        : '📧 Now syncing all emails (may include previously processed reports)'
      );
      onConfigUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update email filtering preference');
    } finally {
      setLoading(null);
    }
  };

  const handleDeletionToggle = async (enabled: boolean) => {
    if (!user) return;

    if (enabled && !config.deletion_confirmation_shown) {
      // Show confirmation dialog for first-time enablement
      setShowDeletionConfirm(true);
      return;
    }

    // Direct toggle for users who have already confirmed
    await updateDeletionPreference(enabled, config.deletion_confirmation_shown);
  };

  const updateDeletionPreference = async (enabled: boolean, confirmationShown: boolean) => {
    if (!user) return;
    
    setLoading('deletion');
    clearMessages();
    
    try {
      const authService = unifiedEmailService['getAuthService'](provider);
      const result = await authService.updateDeletionPreference(
        config.id,
        user.id,
        enabled,
        confirmationShown
      );

      if (result.success) {
        setSuccess(result.message || (enabled 
          ? `🗑️ Email deletion enabled - ${providerName} will be cleaned up after each sync` 
          : `📧 Email deletion disabled - reports will stay in your ${providerName} inbox`
        ));
        onConfigUpdate?.();
      } else if (result.requiresReauth) {
        setError(`🔐 Additional ${providerName} permissions required for email deletion. Please use "Upgrade Permissions" to enable this feature.`);
      } else {
        setError(result.message || 'Failed to update email cleanup preferences');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update deletion preference');
    } finally {
      setLoading(null);
    }
  };

  const handleDeletionConfirmation = (confirmed: boolean, dontShowAgain: boolean) => {
    if (confirmed) {
      updateDeletionPreference(true, dontShowAgain);
    }
  };

  const handleUpgradePermissions = async () => {
    if (!user) return;
    
    setLoading('permissions');
    clearMessages();
    
    try {
      const authService = unifiedEmailService['getAuthService'](provider);
      await authService.upgradeToModifyPermissions(config.id, user.id);
      setSuccess(`🔓 ${providerName} permissions upgraded successfully! You can now enable email deletion to keep your inbox clean.`);
      onConfigUpdate?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `Failed to upgrade ${providerName} permissions`;
      if (errorMsg.includes('denied') || errorMsg.includes('permission')) {
        setError(`🚫 Permission upgrade was denied by user. Email deletion requires additional ${providerName} permissions to function safely.`);
      } else {
        setError(`⚠️ Failed to upgrade ${providerName} permissions: ${errorMsg}`);
      }
    } finally {
      setLoading(null);
    }
  };

  const handleTestConnection = async () => {
    if (!user) return;
    
    setLoading('test');
    clearMessages();
    
    try {
      const result = await unifiedEmailService.testConnection(config.id, user.id, provider);
      if (result) {
        setSuccess(`✅ ${providerName} connection is working perfectly! Ready to sync DMARC reports.`);
      } else {
        setError(`❌ ${providerName} connection failed. Your authentication may have expired - try disconnecting and reconnecting your account.`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection test failed';
      if (errorMsg.includes('401') || errorMsg.includes('authentication') || errorMsg.includes('expired')) {
        setError(`🔐 ${providerName} authentication expired. Please disconnect and reconnect your account to restore access.`);
      } else {
        setError(`📡 Connection test failed: ${errorMsg}`);
      }
    } finally {
      setLoading(null);
    }
  };

  const handleDisconnect = () => {
    setShowDisconnectConfirm(true);
  };

  const handleConfirmDisconnect = async () => {
    if (!user) return;
    
    setLoading('disconnect');
    clearMessages();
    setShowDisconnectConfirm(false);
    
    try {
      await unifiedEmailService.deleteEmailConfig(config.id, user.id, provider);
      setSuccess(`✅ ${providerName} account disconnected successfully. You can reconnect anytime to resume syncing.`);
      onConfigUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to disconnect ${providerName} account. Please try again or contact support.`);
    } finally {
      setLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Synced</Badge>;
      case 'syncing':
        return <Badge variant="default" className="bg-blue-500">Syncing</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Idle</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ProviderIcon provider={provider} />
              {providerName} Configuration
            </span>
            {getStatusBadge(config.sync_status)}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Account Information */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Email Address:</span>
                <p className="font-medium">{config.email_address}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Provider:</span>
                <div className="flex items-center gap-2">
                  <ProviderIcon provider={provider} />
                  <p className="font-medium capitalize">{providerName}</p>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>
                <p className="font-medium">{new Date(config.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Last Sync:</span>
                <p className="font-medium">
                  {config.last_sync_at 
                    ? new Date(config.last_sync_at).toLocaleString()
                    : 'Never'
                  }
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Basic Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Basic Settings</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Enable {providerName} Integration</div>
                <div className="text-sm text-muted-foreground">
                  Allow this account to sync DMARC reports from {providerName}
                </div>
              </div>
              <Switch
                checked={config.is_active}
                onCheckedChange={handleToggleActive}
                disabled={loading === 'active'}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Auto-Sync</div>
                <div className="text-sm text-muted-foreground">
                  Automatically sync new DMARC reports periodically
                </div>
              </div>
              <Switch
                checked={config.auto_sync_enabled}
                onCheckedChange={() => {}} // TODO: Implement auto-sync toggle
                disabled={!config.is_active || true} // Disabled until implemented
              />
            </div>
          </div>

          <Separator />

          {/* Email Import Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Email Import Options</h3>
              {(config.sync_unread_only === undefined || config.delete_after_import === undefined) && (
                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                  Requires Update
                </Badge>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Only sync unread emails</div>
                <div className="text-sm text-muted-foreground">
                  Only import DMARC reports from unread emails (recommended for cleaner syncing)
                </div>
              </div>
              <Switch
                checked={config.sync_unread_only ?? true}
                onCheckedChange={handleToggleUnreadOnly}
                disabled={!config.is_active || loading === 'unreadonly'}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Delete emails after import</div>
                <div className="text-sm text-muted-foreground">
                  Automatically delete emails from {providerName} after successful DMARC report import
                </div>
              </div>
              <Switch
                checked={config.delete_after_import ?? false}
                onCheckedChange={handleDeletionToggle}
                disabled={!config.is_active || loading === 'deletion'}
              />
            </div>

            {(config.delete_after_import ?? false) && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">Email Deletion Enabled</span>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Emails containing DMARC reports will be deleted after successful import.
                  All deletions are logged for audit purposes.
                </p>
              </div>
            )}

            {(config.sync_unread_only === undefined || config.delete_after_import === undefined) && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Some email import options require a database update. These settings will be available after the next system update.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Actions</h3>
            
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={loading === 'test'}
                className="flex items-center gap-2"
              >
                {loading === 'test' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Test Connection
              </Button>

              <Button
                variant="outline"
                onClick={handleUpgradePermissions}
                disabled={loading === 'permissions'}
                className="flex items-center gap-2"
              >
                {loading === 'permissions' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4" />
                )}
                Upgrade Permissions
              </Button>

              <Button
                variant="destructive"
                onClick={handleDisconnect}
                disabled={loading === 'disconnect'}
                className="flex items-center gap-2"
              >
                {loading === 'disconnect' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlink className="w-4 h-4" />
                )}
                Disconnect {providerName}
              </Button>
            </div>
          </div>

          {/* Error Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Messages */}
          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Last Error */}
          {config.last_error_message && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Last Error:</strong> {config.last_error_message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {providerName} Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect {providerName}? You'll need to reconnect to sync future reports.
              <br /><br />
              This will disconnect <strong>{config.email_address}</strong> and remove all saved authentication data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDisconnectConfirm(false)}
              disabled={loading === 'disconnect'}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDisconnect}
              disabled={loading === 'disconnect'}
              className="flex items-center gap-2"
            >
              {loading === 'disconnect' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Unlink className="w-4 h-4" />
              )}
              Disconnect {providerName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deletion Confirmation Dialog */}
      <DeletionConfirmationDialog
        open={showDeletionConfirm}
        onOpenChange={setShowDeletionConfirm}
        emailAddress={config.email_address}
        onConfirm={handleDeletionConfirmation}
        loading={loading === 'deletion'}
        provider={providerName}
      />
    </div>
  );
};

export default UnifiedEmailSettingsPanel;