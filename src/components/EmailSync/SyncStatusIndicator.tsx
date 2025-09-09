import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Mail, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  Calendar,
  FileText,
  Activity
} from 'lucide-react';
import { EmailConfig } from '@/services/gmailAuth';
import { emailProcessor, SyncProgress } from '@/services/emailProcessor';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

interface SyncStatusIndicatorProps {
  config: EmailConfig;
  onSyncComplete?: () => void;
  showDetails?: boolean;
}

export function SyncStatusIndicator({
  config,
  onSyncComplete,
  showDetails = true
}: SyncStatusIndicatorProps) {
  const { user } = useAuth();
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [deleteAfterImport, setDeleteAfterImport] = useState(config.delete_after_import ?? false);
  const [syncHistory, setSyncHistory] = useState<Array<{
    id: string;
    started_at: Date;
    completed_at: Date | null;
    status: string;
    emails_found: number;
    emails_fetched: number;
    attachments_found: number;
    reports_processed: number;
    reports_skipped: number;
    emails_deleted: number;
    deletion_enabled: boolean;
    errors_count: number;
    error_message: string | null;
    duration: number | null;
  }>>([]);

  const loadSyncHistory = useCallback(async () => {
    try {
      const history = await emailProcessor.getSyncHistory(config.id, 5);
      setSyncHistory(history);
    } catch (error) {
      console.error('Error loading sync history:', error);
    }
  }, [config.id]);

  useEffect(() => {
    loadSyncHistory();
  }, [loadSyncHistory]);

  const handleManualSync = async () => {
    if (!user || isManualSyncing) return;

    try {
      setIsManualSyncing(true);
      setSyncProgress({ phase: 'searching', message: 'Starting sync...' });

      const { processGmailEmails } = await import('@/services/emailProcessor');
      const result = await processGmailEmails(
        config.id,
        user.id,
        (progress) => setSyncProgress(progress)
      );

      // Show user-friendly result
      if (result.success) {
        let title = '✅ Sync Completed Successfully';
        let description = '';
        
        if (result.reportsProcessed > 0 && result.emailsDeleted > 0) {
          description = `Synced ${result.reportsProcessed} new reports and deleted ${result.emailsDeleted} emails from Gmail`;
        } else if (result.reportsProcessed > 0) {
          description = `Synced ${result.reportsProcessed} new reports (left emails in Gmail)`;
        } else if (result.reportsSkipped > 0 && result.emailsDeleted > 0) {
          description = `Found ${result.reportsSkipped} duplicate reports and cleaned up ${result.emailsDeleted} emails from Gmail`;
        } else if (result.reportsSkipped > 0) {
          description = `Found ${result.reportsSkipped} duplicate reports - your data is up to date`;
        } else {
          description = `No new DMARC reports found - your inbox is up to date`;
        }
        
        toast({
          title,
          description,
          variant: 'default'
        });
      } else {
        let errorTitle = '⚠️ Gmail Sync Failed';
        let errorDescription = '';
        
        const firstError = result.errors[0] || '';
        
        if (firstError.includes('Gmail authentication required') || firstError.includes('authentication expired')) {
          errorTitle = '🔐 Authentication Required';
          errorDescription = 'Your Gmail connection needs to be refreshed. Please reconnect your account.';
        } else if (firstError.includes('connection')) {
          errorTitle = '📡 Connection Issue';
          errorDescription = 'Unable to connect to Gmail. Please check your internet connection and try again.';
        } else {
          errorDescription = firstError || 'An unexpected error occurred. Please try again or contact support if the issue persists.';
        }
        
        toast({
          title: errorTitle,
          description: errorDescription,
          variant: 'destructive'
        });
      }

      // Refresh data
      await loadSyncHistory();
      onSyncComplete?.();

    } catch (error) {
      let errorTitle = '❌ Sync Error';
      let errorMessage = '';
      
      if (error instanceof Error) {
        if (error.message.includes('authentication') || error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorTitle = '🔐 Authentication Issue';
          errorMessage = 'Your Gmail access has expired. Please reconnect your Gmail account to continue syncing.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorTitle = '📡 Network Error';
          errorMessage = 'Unable to connect to Gmail. Please check your internet connection and try again.';
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = 'An unexpected error occurred during sync. Please try again or contact support if the issue persists.';
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsManualSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleDeleteToggle = async (checked: boolean) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('user_email_configs')
        .update({ delete_after_import: checked })
        .eq('id', config.id);

      if (error) {
        console.error('Failed to update deletion setting:', error);
        toast({
          title: 'Settings Update Failed',
          description: 'Could not update email deletion setting. Please try again.',
          variant: 'destructive'
        });
        return;
      }

      setDeleteAfterImport(checked);
      toast({
        title: checked ? 'Email Deletion Enabled' : 'Email Deletion Disabled',
        description: checked 
          ? 'Emails will be deleted after successful DMARC report processing.'
          : 'Emails will be kept after DMARC report processing.',
        variant: 'default'
      });
    } catch (error) {
      console.error('Error updating deletion setting:', error);
      toast({
        title: 'Settings Update Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    }
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'syncing':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getSyncProgressInfo = (progress: SyncProgress): {
    showPercentage: boolean;
    percentage: number;
    progressType: 'determinate' | 'indeterminate';
    stageDescription: string;
  } => {
    switch (progress.phase) {
      case 'searching':
        return {
          showPercentage: false,
          percentage: 0,
          progressType: 'indeterminate',
          stageDescription: 'Stage 1: Searching for emails with DMARC attachments'
        };
      case 'downloading':
        return {
          showPercentage: false,
          percentage: 0,
          progressType: 'indeterminate',
          stageDescription: 'Stage 2: Downloading email attachments'
        };
      case 'processing': {
        const totalAttachments = progress.attachmentsFound || 1;
        const processed = progress.processed || 0;
        const percentage = (processed / totalAttachments) * 100;
        
        return {
          showPercentage: true,
          percentage: Math.min(percentage, 100),
          progressType: 'determinate',
          stageDescription: `Stage 3: Processing attachments (${processed}/${totalAttachments})`
        };
      }
      case 'completed':
        return {
          showPercentage: true,
          percentage: 100,
          progressType: 'determinate',
          stageDescription: 'Stage 4: Sync completed successfully'
        };
      case 'error':
        return {
          showPercentage: false,
          percentage: 0,
          progressType: 'determinate',
          stageDescription: 'Sync encountered an error'
        };
      case 'deleting': {
        const totalToDelete = progress.processed || 1;
        const deleted = progress.deleted || 0;
        const percentage = (deleted / totalToDelete) * 100;
        
        return {
          showPercentage: true,
          percentage: Math.min(percentage, 100),
          progressType: 'determinate',
          stageDescription: `Stage 4: Deleting processed emails (${deleted}/${totalToDelete})`
        };
      }
      default:
        return {
          showPercentage: false,
          percentage: 0,
          progressType: 'indeterminate',
          stageDescription: 'Preparing sync...'
        };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            <span>Gmail Sync Status</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(config.sync_status)}>
              {getStatusIcon(config.sync_status)}
              <span className="ml-1 capitalize">{config.sync_status}</span>
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
        {/* Email Address */}
        <div className="text-sm text-gray-600">
          <strong>Account:</strong> {config.email_address}
        </div>

        {/* Last Sync */}
        {config.last_sync_at && (
          <div className="text-sm text-gray-600">
            <strong>Last sync:</strong> {format(new Date(config.last_sync_at), 'MMM d, yyyy h:mm a')}
          </div>
        )}

        {/* Enhanced Sync Progress */}
        {(isManualSyncing || config.sync_status === 'syncing') && syncProgress && (
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">Gmail Sync in Progress</span>
              {getSyncProgressInfo(syncProgress).showPercentage && (
                <span className="text-sm text-blue-700 font-mono">
                  {getSyncProgressInfo(syncProgress).percentage.toFixed(0)}%
                </span>
              )}
            </div>
            
            {/* Stage Description */}
            <div className="text-sm text-blue-800">
              {getSyncProgressInfo(syncProgress).stageDescription}
            </div>
            
            {/* Progress Bar */}
            <div className="space-y-2">
              {getSyncProgressInfo(syncProgress).progressType === 'indeterminate' ? (
                <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3"></div>
                </div>
              ) : (
                <Progress 
                  value={getSyncProgressInfo(syncProgress).percentage} 
                  className="h-2 bg-blue-200"
                />
              )}
              
              {/* Current Message */}
              <p className="text-sm text-blue-700">{syncProgress.message}</p>
            </div>
            
            {/* Statistics */}
            {(syncProgress.attachmentsFound || syncProgress.processed !== undefined) && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {syncProgress.attachmentsFound && (
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold text-blue-600">
                      {syncProgress.attachmentsFound}
                    </div>
                    <div className="text-blue-800 text-xs">Attachments Found</div>
                  </div>
                )}
                {syncProgress.processed !== undefined && (
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold text-green-600">
                      {syncProgress.processed}
                    </div>
                    <div className="text-green-800 text-xs">Processed</div>
                  </div>
                )}
                {(syncProgress.skipped !== undefined && syncProgress.skipped > 0) && (
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold text-yellow-600">
                      {syncProgress.skipped}
                    </div>
                    <div className="text-yellow-800 text-xs">Skipped</div>
                  </div>
                )}
                {(syncProgress.errors !== undefined && syncProgress.errors > 0) && (
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold text-red-600">
                      {syncProgress.errors}
                    </div>
                    <div className="text-red-800 text-xs">Errors</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual Sync Button */}
        <div className="flex gap-2">
          <Button
            onClick={handleManualSync}
            disabled={isManualSyncing || config.sync_status === 'syncing' || !config.is_active}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isManualSyncing ? 'animate-spin' : ''}`} />
            {isManualSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>

        {/* Email Deletion Setting */}
        <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
          <Checkbox
            id={`delete-toggle-${config.id}`}
            checked={deleteAfterImport}
            onCheckedChange={handleDeleteToggle}
            disabled={isManualSyncing || config.sync_status === 'syncing' || !config.is_active}
          />
          <Label
            htmlFor={`delete-toggle-${config.id}`}
            className="text-sm text-gray-700 cursor-pointer"
          >
            Delete emails after importing DMARC reports
          </Label>
          {deleteAfterImport && (
            <Badge variant="outline" className="text-xs border-orange-200 text-orange-700">
              Destructive
            </Badge>
          )}
        </div>

        {/* Enhanced Sync History with Detailed Statistics */}
        {showDetails && syncHistory.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Recent Syncs
            </h4>
            <div className="space-y-2">
              {syncHistory.slice(0, 3).map((sync) => (
                <div key={sync.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {/* Sync Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(sync.status)}
                      <span className="text-xs font-medium text-gray-700">
                        {format(sync.started_at, 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    {sync.duration && (
                      <span className="text-xs text-gray-500 font-mono">
                        {formatDuration(sync.duration)}
                      </span>
                    )}
                  </div>

                  {/* Enhanced Statistics Grid */}
                  {sync.status === 'completed' && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div className="bg-white rounded p-2 text-center border">
                        <div className="text-sm font-bold text-blue-600">
                          {sync.emails_found || sync.emails_fetched || 0}
                        </div>
                        <div className="text-gray-600 text-xs">Emails Found</div>
                      </div>
                      
                      <div className="bg-white rounded p-2 text-center border">
                        <div className="text-sm font-bold text-green-600">
                          {sync.reports_processed || 0}
                        </div>
                        <div className="text-gray-600 text-xs">Reports Imported</div>
                      </div>
                      
                      {(sync.reports_skipped || 0) > 0 && (
                        <div className="bg-white rounded p-2 text-center border">
                          <div className="text-sm font-bold text-yellow-600">
                            {sync.reports_skipped}
                          </div>
                          <div className="text-gray-600 text-xs">Duplicates Skipped</div>
                        </div>
                      )}
                      
                      {(sync.emails_deleted || 0) > 0 && (
                        <div className="bg-white rounded p-2 text-center border">
                          <div className="text-sm font-bold text-red-600">
                            {sync.emails_deleted}
                          </div>
                          <div className="text-gray-600 text-xs">Emails Deleted</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Message */}
                  {sync.status === 'failed' && sync.error_message && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                      {sync.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User-Friendly Error Message */}
        {config.sync_status === 'error' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">
                  {(config.last_error_message || '').includes('authentication') || 
                   (config.last_error_message || '').includes('401') || 
                   (config.last_error_message || '').includes('expired')
                    ? '🔐 Gmail Connection Issue'
                    : '⚠️ Sync Error'}
                </p>
                <p className="text-red-700 mt-1">
                  {(() => {
                    const error = config.last_error_message || '';
                    if (error.includes('authentication') || error.includes('401') || error.includes('expired')) {
                      return "Your Gmail connection has expired and needs to be refreshed. Please disconnect and reconnect your Gmail account to continue syncing.";
                    } else if (error.includes('network') || error.includes('connection')) {
                      return "Unable to connect to Gmail. Please check your internet connection and try again.";
                    } else if (error.includes('permission') || error.includes('scope')) {
                      return "Gmail permissions may have changed. Try reconnecting your account with the required permissions.";
                    } else {
                      return error || "There was an issue syncing your Gmail account. Try clicking 'Sync Now' to retry, or disconnect and reconnect your account if the problem persists.";
                    }
                  })()}
                </p>
                <p className="text-red-600 text-xs mt-2">
                  <strong>Quick fix:</strong> 
                  {(config.last_error_message || '').includes('authentication') || 
                   (config.last_error_message || '').includes('401') || 
                   (config.last_error_message || '').includes('expired')
                    ? " Use 'Disconnect Gmail' button and reconnect your account."
                    : " Click 'Sync Now' to retry, or use 'Test Connection' to check your Gmail access."}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}