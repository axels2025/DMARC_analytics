import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  const [syncHistory, setSyncHistory] = useState<Array<{
    id: string;
    started_at: Date;
    completed_at: Date | null;
    status: string;
    emails_fetched: number;
    reports_processed: number;
    reports_skipped: number;
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

      const result = await emailProcessor.syncDmarcReports(
        config.id,
        user.id,
        (progress) => setSyncProgress(progress)
      );

      // Show result
      if (result.success) {
        toast({
          title: 'Sync Completed',
          description: `Processed ${result.reportsProcessed} reports, skipped ${result.reportsSkipped} duplicates.`,
          variant: 'default'
        });
      } else {
        const errorMessage = result.errors.length > 0 
          ? result.errors.join('; ')
          : 'Sync failed for unknown reasons. Please check your Gmail connection.';
        
        toast({
          title: 'Sync Failed',
          description: errorMessage,
          variant: 'destructive'
        });
      }

      // Refresh data
      await loadSyncHistory();
      onSyncComplete?.();

    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred during sync. Please try again.';
      
      toast({
        title: 'Sync Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsManualSyncing(false);
      setSyncProgress(null);
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
      case 'processing':
        const totalAttachments = progress.attachmentsFound || 1;
        const processed = progress.processed || 0;
        const percentage = (processed / totalAttachments) * 100;
        
        return {
          showPercentage: true,
          percentage: Math.min(percentage, 100),
          progressType: 'determinate',
          stageDescription: `Stage 3: Processing attachments (${processed}/${totalAttachments})`
        };
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

        {/* Sync History */}
        {showDetails && syncHistory.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Recent Syncs
            </h4>
            <div className="space-y-1">
              {syncHistory.slice(0, 3).map((sync) => (
                <div key={sync.id} className="flex items-center justify-between text-xs py-1 px-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(sync.status)}
                    <span>{format(sync.started_at, 'MMM d, h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-600">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {sync.reports_processed}
                    </span>
                    {sync.duration && (
                      <span>{formatDuration(sync.duration)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {config.sync_status === 'error' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Sync Error</p>
                <p className="text-red-700 mt-1">
                  {config.last_error_message || "There was an issue syncing your Gmail account. Try clicking 'Sync Now' to retry, or disconnect and reconnect your account if the problem persists."}
                </p>
                <p className="text-red-600 text-xs mt-2">
                  <strong>Next steps:</strong> Click 'Sync Now' to retry, or use 'Test' to check your connection.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}