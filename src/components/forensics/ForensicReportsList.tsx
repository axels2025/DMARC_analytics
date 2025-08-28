import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  Mail,
  Shield,
  AlertTriangle,
  Loader,
  RefreshCw,
  Settings,
  Lock
} from 'lucide-react';
import { ForensicRecord } from '@/hooks/useForensicData';
import { getFailureTypeColor, formatTimestamp } from '@/utils/privacyProtection';
import { 
  PrivacySettings,
  MaskingOptions,
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_MASKING_OPTIONS,
  applyPrivacySettings
} from '@/utils/privacyManager';
import { logDataAccess, logTemporaryReveal } from '@/utils/privacyAudit';
import { useAuth } from '@/hooks/useAuth';

interface ForensicReportsListProps {
  records: ForensicRecord[];
  loading: boolean;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onRecordClick: (record: ForensicRecord) => void;
  onRefresh: () => void;
  privacySettings?: PrivacySettings;
  maskingOptions?: MaskingOptions;
  onPrivacySettingsChange?: (settings: PrivacySettings) => void;
}

const ForensicReportsList = ({
  records,
  loading,
  totalCount,
  hasMore,
  onLoadMore,
  onRecordClick,
  onRefresh,
  privacySettings = DEFAULT_PRIVACY_SETTINGS,
  maskingOptions = DEFAULT_MASKING_OPTIONS,
  onPrivacySettingsChange,
}: ForensicReportsListProps) => {
  const { user } = useAuth();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Map<string, Set<string>>>(new Map());
  const [revealTimers, setRevealTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());

  const toggleRowExpansion = (recordId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(recordId)) {
      newExpanded.delete(recordId);
    } else {
      newExpanded.add(recordId);
      // Log data access when expanding row
      if (user) {
        logDataAccess(user.id, 'forensic_report', recordId, {
          action: 'expand_details',
          privacyLevel: privacySettings.maskingLevel
        });
      }
    }
    setExpandedRows(newExpanded);
  };

  // Handle temporary reveal
  const handleTemporaryReveal = (recordId: string, field: string, duration: number = 15000) => {
    if (!privacySettings.allowTemporaryReveal) return;

    // Clear existing timer for this record/field
    const timerKey = `${recordId}-${field}`;
    const existingTimer = revealTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Add to revealed fields
    const currentRevealed = revealedFields.get(recordId) || new Set();
    currentRevealed.add(field);
    setRevealedFields(prev => new Map(prev.set(recordId, currentRevealed)));

    // Set timer to hide again
    const timer = setTimeout(() => {
      setRevealedFields(prev => {
        const newMap = new Map(prev);
        const recordFields = newMap.get(recordId) || new Set();
        recordFields.delete(field);
        if (recordFields.size === 0) {
          newMap.delete(recordId);
        } else {
          newMap.set(recordId, recordFields);
        }
        return newMap;
      });
      setRevealTimers(prev => {
        const newMap = new Map(prev);
        newMap.delete(timerKey);
        return newMap;
      });
    }, duration);

    setRevealTimers(prev => new Map(prev.set(timerKey, timer)));

    // Log the temporary reveal
    if (user) {
      logTemporaryReveal(user.id, 'forensic_report', recordId, duration);
    }
  };

  // Apply privacy settings to a record
  const applyPrivacyToRecord = (record: ForensicRecord) => {
    const mockForensicData = {
      envelope_from: record.maskedFrom,
      envelope_to: record.maskedTo,
      header_from: record.maskedFrom,
      subject: record.truncatedSubject,
      original_headers: '', // Headers not available in list view
      message_body: '', // Content not available in list view
    };

    return applyPrivacySettings(mockForensicData, privacySettings, maskingOptions);
  };

  // Check if field is revealed for a record
  const isFieldRevealed = (recordId: string, field: string): boolean => {
    return revealedFields.get(recordId)?.has(field) || false;
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      revealTimers.forEach(timer => clearTimeout(timer));
    };
  }, [revealTimers]);

  const getFailureBadge = (record: ForensicRecord) => {
    const color = getFailureTypeColor(record.authFailure);
    return (
      <Badge variant="outline" className={`${color} border-current`}>
        {record.authFailure}
      </Badge>
    );
  };

  const getPolicyBadge = (policy: string) => {
    const colors = {
      'quarantine': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'reject': 'bg-red-100 text-red-800 border-red-200',
      'none': 'bg-gray-100 text-gray-800 border-gray-200',
    };
    
    return (
      <Badge variant="outline" className={colors[policy as keyof typeof colors] || colors.none}>
        {policy || 'none'}
      </Badge>
    );
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (records.length === 0 && !loading) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Mail className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No forensic reports found</h3>
          <p className="text-gray-500 mb-4">
            No failed email attempts match your current filters.
          </p>
          <Button onClick={onRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Failed Email Attempts
            <Badge variant="secondary">{totalCount.toLocaleString()}</Badge>
            {!privacySettings.showEmailAddresses && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Privacy Protected
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {onPrivacySettingsChange && (
              <Button
                onClick={() => setShowPrivacyControls(!showPrivacyControls)}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Privacy
              </Button>
            )}
            <Button onClick={onRefresh} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        {showPrivacyControls && onPrivacySettingsChange && (
          <div className="mt-4 p-4 border rounded-lg space-y-3">
            <h4 className="font-medium text-sm">Quick Privacy Controls</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-emails"
                  checked={privacySettings.showEmailAddresses}
                  onCheckedChange={(checked) =>
                    onPrivacySettingsChange({ ...privacySettings, showEmailAddresses: checked })
                  }
                />
                <Label htmlFor="show-emails" className="text-sm">Show Emails</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-subjects"
                  checked={privacySettings.showSubjects}
                  onCheckedChange={(checked) =>
                    onPrivacySettingsChange({ ...privacySettings, showSubjects: checked })
                  }
                />
                <Label htmlFor="show-subjects" className="text-sm">Show Subjects</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="allow-reveal"
                  checked={privacySettings.allowTemporaryReveal}
                  onCheckedChange={(checked) =>
                    onPrivacySettingsChange({ ...privacySettings, allowTemporaryReveal: checked })
                  }
                />
                <Label htmlFor="allow-reveal" className="text-sm">Temp Reveal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="audit-access"
                  checked={privacySettings.auditDataAccess}
                  onCheckedChange={(checked) =>
                    onPrivacySettingsChange({ ...privacySettings, auditDataAccess: checked })
                  }
                />
                <Label htmlFor="audit-access" className="text-sm">Audit Access</Label>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Source IP</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Failure</TableHead>
                <TableHead>Policy</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <>
                  <TableRow 
                    key={record.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRowExpansion(record.id)}
                  >
                    <TableCell>
                      {expandedRows.has(record.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-sm">
                          {formatRelativeTime(record.arrivalDate)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(record.arrivalDate)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{record.sourceIp}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div className="flex items-center gap-1">
                          <span className="text-sm truncate max-w-[180px]" title={record.maskedFrom}>
                            {isFieldRevealed(record.id, 'from') 
                              ? record.maskedFrom 
                              : applyPrivacyToRecord(record).envelope_from}
                          </span>
                          {privacySettings.allowTemporaryReveal && !privacySettings.showEmailAddresses && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTemporaryReveal(record.id, 'from');
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 opacity-50 hover:opacity-100"
                            >
                              {isFieldRevealed(record.id, 'from') ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span 
                          className="text-sm truncate max-w-[220px] block" 
                          title={record.truncatedSubject}
                        >
                          {isFieldRevealed(record.id, 'subject')
                            ? record.truncatedSubject || '[No Subject]'
                            : applyPrivacyToRecord(record).subject || '[No Subject]'}
                        </span>
                        {privacySettings.allowTemporaryReveal && !privacySettings.showSubjects && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTemporaryReveal(record.id, 'subject');
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 opacity-50 hover:opacity-100"
                          >
                            {isFieldRevealed(record.id, 'subject') ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getFailureBadge(record)}
                    </TableCell>
                    <TableCell>
                      {getPolicyBadge(record.policyEvaluated)}
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRecordClick(record);
                        }}
                        variant="ghost"
                        size="sm"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedRows.has(record.id) && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                              <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Arrival Time
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {record.arrivalDate.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                Domain
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {record.domain}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm mb-1">To</h4>
                              <div className="flex items-center gap-1">
                                <p className="text-sm text-muted-foreground">
                                  {isFieldRevealed(record.id, 'to') 
                                    ? record.maskedTo || '[Not Available]'
                                    : applyPrivacyToRecord(record).envelope_to || '[Not Available]'}
                                </p>
                                {privacySettings.allowTemporaryReveal && !privacySettings.showEmailAddresses && record.maskedTo && (
                                  <Button
                                    onClick={() => handleTemporaryReveal(record.id, 'to')}
                                    variant="ghost"
                                    size="sm"
                                    className="h-4 w-4 p-0 opacity-50 hover:opacity-100"
                                  >
                                    {isFieldRevealed(record.id, 'to') ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm mb-1">Message ID</h4>
                              <p className="text-sm text-muted-foreground font-mono text-xs">
                                {record.messageId ? 
                                  record.messageId.length > 30 ? 
                                    `${record.messageId.substring(0, 30)}...` : 
                                    record.messageId 
                                  : '[Not Available]'
                                }
                              </p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <h4 className="font-medium text-sm mb-1">SPF Result</h4>
                              <Badge 
                                variant={record.spfResult === 'pass' ? 'default' : 'destructive'}
                                className="text-xs"
                              >
                                {record.spfResult || 'unknown'}
                              </Badge>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm mb-1">DKIM Result</h4>
                              <Badge 
                                variant={record.dkimResult === 'pass' ? 'default' : 'destructive'}
                                className="text-xs"
                              >
                                {record.dkimResult || 'unknown'}
                              </Badge>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm mb-1">DMARC Result</h4>
                              <Badge 
                                variant={record.dmarcResult === 'pass' ? 'default' : 'destructive'}
                                className="text-xs"
                              >
                                {record.dmarcResult || 'unknown'}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={() => onRecordClick(record)}
                              variant="outline"
                              size="sm"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Full Details
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Loading and Load More */}
        <div className="mt-4 flex justify-center">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" />
              Loading forensic reports...
            </div>
          )}
          
          {hasMore && !loading && (
            <Button onClick={onLoadMore} variant="outline">
              Load More Reports
            </Button>
          )}
          
          {!hasMore && records.length > 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              Showing all {records.length} of {totalCount} results
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ForensicReportsList;