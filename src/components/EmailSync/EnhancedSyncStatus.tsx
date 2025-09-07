import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Mail, 
  FileText, 
  CheckCircle, 
  RotateCcw, 
  Trash2, 
  Clock,
  AlertTriangle,
  TrendingUp,
  Download
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SyncMetrics {
  lastSync: Date | null;
  emailsFound: number;
  emailsFetched: number;
  attachmentsFound: number;
  reportsImported: number;
  duplicatesSkipped: number;
  emailsDeleted: number;
  deletionEnabled: boolean;
  duration: number | null; // in seconds
  status: 'idle' | 'syncing' | 'completed' | 'error';
  errorMessage?: string;
}

interface EnhancedSyncStatusProps {
  metrics: SyncMetrics;
  configId: string;
  onRefresh?: () => void;
}

const EnhancedSyncStatus: React.FC<EnhancedSyncStatusProps> = ({ 
  metrics, 
  configId,
  onRefresh 
}) => {
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return 'Unknown';
    
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  };

  const formatLastSync = (date: Date | null): string => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'syncing': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'syncing': return <RotateCcw className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const isSuccessfulSync = metrics.status === 'completed' && metrics.lastSync;
  const hasData = metrics.emailsFound > 0 || metrics.reportsImported > 0;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              Gmail Sync Status
              {getStatusIcon(metrics.status)}
            </span>
            
            {metrics.status === 'error' && (
              <Badge variant="destructive" className="text-xs">
                Error
              </Badge>
            )}
            
            {metrics.deletionEnabled && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />
                    Auto-Delete
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Emails are automatically deleted after successful import</p>
                </TooltipContent>
              </Tooltip>
            )}
          </CardTitle>
          
          <div className="text-sm text-muted-foreground">
            <strong>Last Sync:</strong> {formatLastSync(metrics.lastSync)}
          </div>
          
          {metrics.errorMessage && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
              <AlertTriangle className="w-4 h-4 inline mr-2" />
              {metrics.errorMessage}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Main Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Tooltip>
              <TooltipTrigger>
                <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Mail className="w-5 h-5 mx-auto mb-1 text-blue-600" />
                  <div className="text-2xl font-bold text-blue-600">{metrics.emailsFound}</div>
                  <div className="text-xs text-blue-700">Emails Found</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total emails found that match DMARC report criteria</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-600" />
                  <div className="text-2xl font-bold text-green-600">{metrics.reportsImported}</div>
                  <div className="text-xs text-green-700">Reports Imported</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Number of DMARC reports successfully imported into the database</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <div className="text-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <RotateCcw className="w-5 h-5 mx-auto mb-1 text-yellow-600" />
                  <div className="text-2xl font-bold text-yellow-600">{metrics.duplicatesSkipped}</div>
                  <div className="text-xs text-yellow-700">Duplicates Skipped</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reports that were already imported (duplicates skipped automatically)</p>
              </TooltipContent>
            </Tooltip>

            {metrics.deletionEnabled && (
              <Tooltip>
                <TooltipTrigger>
                  <div className="text-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <Trash2 className="w-5 h-5 mx-auto mb-1 text-purple-600" />
                    <div className="text-2xl font-bold text-purple-600">{metrics.emailsDeleted}</div>
                    <div className="text-xs text-purple-700">Emails Deleted</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Emails automatically deleted after successful report import</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-gray-600" />
              <span className="text-muted-foreground">Attachments:</span>
              <span className="font-medium">{metrics.attachmentsFound}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-600" />
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-medium">{formatDuration(metrics.duration)}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Download className="w-4 h-4 text-gray-600" />
              <span className="text-muted-foreground">Fetched:</span>
              <span className="font-medium">{metrics.emailsFetched}</span>
            </div>
            
            {isSuccessfulSync && hasData && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-green-600 font-medium">Sync Successful</span>
              </div>
            )}
          </div>

          {/* Efficiency Indicators */}
          {isSuccessfulSync && hasData && (
            <div className="pt-2 border-t space-y-2">
              <div className="text-sm font-medium text-gray-700">Sync Efficiency</div>
              <div className="space-y-1">
                {metrics.emailsFound > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Import Rate:</span>
                    <span className="font-medium">
                      {Math.round((metrics.reportsImported / (metrics.reportsImported + metrics.duplicatesSkipped)) * 100)}%
                      <span className="text-xs text-muted-foreground ml-1">
                        ({metrics.reportsImported} new / {metrics.reportsImported + metrics.duplicatesSkipped} total)
                      </span>
                    </span>
                  </div>
                )}
                
                {metrics.deletionEnabled && metrics.emailsFound > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cleanup Rate:</span>
                    <span className="font-medium">
                      {Math.round((metrics.emailsDeleted / metrics.emailsFound) * 100)}%
                      <span className="text-xs text-muted-foreground ml-1">
                        ({metrics.emailsDeleted} deleted / {metrics.emailsFound} found)
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!hasData && isSuccessfulSync && (
            <div className="text-center py-4 text-muted-foreground">
              <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No new DMARC reports found in this sync</p>
            </div>
          )}

          {/* Never Synced State */}
          {!metrics.lastSync && metrics.status !== 'syncing' && (
            <div className="text-center py-4 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Gmail sync has not been run yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default EnhancedSyncStatus;