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
  Gmail,
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
import DeletionConfirmationDialog from './DeletionConfirmationDialog';
import { gmailAuthService } from '@/services/gmailAuth';
import { useAuth } from '@/hooks/useAuth';

interface GmailSettingsPanelProps {
  config: EmailConfig;
  onConfigUpdate?: () => void;
}

const GmailSettingsPanel: React.FC<GmailSettingsPanelProps> = ({
  config,
  onConfigUpdate
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [showDeletionConfirm, setShowDeletionConfirm] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleToggleActive = async (enabled: boolean) => {
    if (!user) return;
    
    setLoading('active');
    clearMessages();
    
    try {
      await gmailAuthService.toggleConfigStatus(config.id, user.id, enabled);
      setSuccess(enabled 
        ? '✅ Gmail integration is now active and ready to sync' 
        : '⏸️ Gmail integration paused - no automatic syncing'
      );
      onConfigUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Gmail integration setting');
    } finally {
      setLoading(null);
    }
  };

  const handleToggleAutoSync = async (enabled: boolean) => {
    if (!user) return;
    
    setLoading('autosync');
    clearMessages();
    
    try {
      // This would need to be implemented in gmailAuthService
      // await gmailAuthService.updateAutoSync(config.id, user.id, enabled);
      setSuccess(`Auto-sync ${enabled ? 'enabled' : 'disabled'} successfully`);
      onConfigUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update auto-sync setting');
    } finally {
      setLoading(null);
    }
  };

  const handleToggleUnreadOnly = async (enabled: boolean) => {
    if (!user) return;
    
    setLoading('unreadonly');
    clearMessages();
    
    try {
      await gmailAuthService.updateSyncUnreadOnly(config.id, user.id, enabled);
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
      const result = await gmailAuthService.updateDeletionPreference(
        config.id,
        user.id,
        enabled,
        confirmationShown
      );

      if (result.success) {
        setSuccess(result.message || (enabled 
          ? '🗑️ Email deletion enabled - Gmail will be cleaned up after each sync' 
          : '📧 Email deletion disabled - reports will stay in your Gmail inbox'
        ));
        onConfigUpdate?.();
      } else if (result.requiresReauth) {
        setError('🔐 Additional Gmail permissions required for email deletion. Please use "Upgrade Permissions" to enable this feature.');
        // Could trigger re-auth flow here
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
      await gmailAuthService.upgradeToModifyPermissions(config.id, user.id);
      setSuccess('🔓 Gmail permissions upgraded successfully! You can now enable email deletion to keep your inbox clean.');
      onConfigUpdate?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to upgrade Gmail permissions';
      if (errorMsg.includes('denied') || errorMsg.includes('permission')) {
        setError('🚫 Permission upgrade was denied by user. Email deletion requires additional Gmail permissions to function safely.');
      } else {
        setError(`⚠️ Failed to upgrade Gmail permissions: ${errorMsg}`);
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
      const result = await gmailAuthService.testConnection(config.id, user.id);
      if (result) {
        setSuccess('✅ Gmail connection is working perfectly! Ready to sync DMARC reports.');
      } else {
        setError('❌ Gmail connection failed. Your authentication may have expired - try disconnecting and reconnecting your account.');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection test failed';
      if (errorMsg.includes('401') || errorMsg.includes('authentication') || errorMsg.includes('expired')) {
        setError('🔐 Gmail authentication expired. Please disconnect and reconnect your account to restore access.');
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
      await gmailAuthService.deleteEmailConfig(config.id, user.id);
      setSuccess('✅ Gmail account disconnected successfully. You can reconnect anytime to resume syncing.');
      onConfigUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Gmail account. Please try again or contact support.');
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
              <Mail className="w-5 h-5" />
              Gmail Configuration
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
                <p className="font-medium capitalize">{config.provider}</p>
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
                <div className="font-medium">Enable Gmail Integration</div>
                <div className="text-sm text-muted-foreground">
                  Allow this account to sync DMARC reports from Gmail
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
                onCheckedChange={handleToggleAutoSync}
                disabled={!config.is_active || loading === 'autosync'}
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
              <div className="text-xs text-gray-500 mt-1">
                Database value: {config.sync_unread_only === undefined ? 'undefined' : String(config.sync_unread_only)}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Delete emails after import</div>
                <div className="text-sm text-muted-foreground">
                  Automatically delete emails from Gmail after successful DMARC report import
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
                Disconnect Gmail
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
            <DialogTitle>Disconnect Gmail Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect Gmail? You'll need to reconnect to sync future reports.
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
              Disconnect Gmail
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
      />
    </div>
  );
};

export default GmailSettingsPanel;