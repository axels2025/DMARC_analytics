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
        toast({
          title: 'Sync Failed',
          description: result.errors.join('; '),
          variant: 'destructive'
        });
      }

      // Refresh data
      await loadSyncHistory();
      onSyncComplete?.();

    } catch (error) {
      toast({
        title: 'Sync Error',
        description: error instanceof Error ? error.message : 'Unknown error',
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

  const getSyncProgressPercentage = (progress: SyncProgress): number => {
    switch (progress.phase) {
      case 'searching':
        return 10;
      case 'downloading':
        return 30;
      case 'processing':
        return 60 + (progress.processed || 0) / Math.max(progress.attachmentsFound || 1, 1) * 30;
      case 'completed':
        return 100;
      case 'error':
        return 0;
      default:
        return 0;
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

        {/* Sync Progress */}
        {(isManualSyncing || config.sync_status === 'syncing') && syncProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Syncing...</span>
              <span className="text-sm text-gray-500">
                {getSyncProgressPercentage(syncProgress).toFixed(0)}%
              </span>
            </div>
            <Progress value={getSyncProgressPercentage(syncProgress)} className="h-2" />
            <p className="text-sm text-gray-600">{syncProgress.message}</p>
            
            {syncProgress.processed !== undefined && syncProgress.attachmentsFound && (
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Found: {syncProgress.attachmentsFound}</span>
                <span>Processed: {syncProgress.processed}</span>
                <span>Skipped: {syncProgress.skipped || 0}</span>
                {syncProgress.errors && syncProgress.errors > 0 && (
                  <span className="text-red-600">Errors: {syncProgress.errors}</span>
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
                  Check your Gmail connection or try reconnecting your account.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}