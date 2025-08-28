import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Mail,
  Clock,
  Globe,
  Shield,
  AlertTriangle,
  Eye,
  EyeOff,
  Download,
  Copy,
  MapPin,
  Server,
  CheckCircle,
  XCircle,
  MinusCircle,
  Lock,
  Unlock,
  Timer,
  FileText,
  Zap
} from 'lucide-react';
import { ForensicRecord } from '@/hooks/useForensicData';
import { formatTimestamp } from '@/utils/privacyProtection';
import { 
  PrivacySettings,
  MaskingOptions,
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_MASKING_OPTIONS,
  applyPrivacySettings
} from '@/utils/privacyManager';
import { logDataAccess, logTemporaryReveal } from '@/utils/privacyAudit';
import { useAuth } from '@/hooks/useAuth';

interface ForensicDetailModalPrivacyProps {
  record: ForensicRecord | null;
  isOpen: boolean;
  onClose: () => void;
  privacySettings?: PrivacySettings;
  maskingOptions?: MaskingOptions;
  onPrivacySettingsChange?: (settings: PrivacySettings) => void;
}

const ForensicDetailModalPrivacy = ({ 
  record, 
  isOpen, 
  onClose, 
  privacySettings = DEFAULT_PRIVACY_SETTINGS,
  maskingOptions = DEFAULT_MASKING_OPTIONS,
  onPrivacySettingsChange
}: ForensicDetailModalPrivacyProps) => {
  const { user } = useAuth();
  const [revealedSections, setRevealedSections] = useState<Set<string>>(new Set());
  const [revealTimers, setRevealTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [activeTab, setActiveTab] = useState('overview');

  // Handle temporary reveal
  const handleTemporaryReveal = (section: string, duration: number = 30000) => {
    if (!privacySettings.allowTemporaryReveal || !record) return;

    // Clear existing timer for this section
    const existingTimer = revealTimers.get(section);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Add to revealed sections
    setRevealedSections(prev => new Set([...prev, section]));

    // Set timer to hide again
    const timer = setTimeout(() => {
      setRevealedSections(prev => {
        const newSet = new Set(prev);
        newSet.delete(section);
        return newSet;
      });
      setRevealTimers(prev => {
        const newMap = new Map(prev);
        newMap.delete(section);
        return newMap;
      });
    }, duration);

    setRevealTimers(prev => new Map(prev.set(section, timer)));

    // Log the temporary reveal
    if (user) {
      logTemporaryReveal(user.id, 'forensic_report', record.id, duration);
    }
  };

  // Apply privacy settings to record data
  const getPrivacyAwareData = () => {
    if (!record) return {};
    
    const mockForensicData = {
      envelope_from: record.maskedFrom,
      envelope_to: record.maskedTo,
      header_from: record.maskedFrom,
      subject: record.truncatedSubject,
      original_headers: record.originalHeaders || '',
      message_body: record.messageBody || '',
    };

    return applyPrivacySettings(mockForensicData, privacySettings, maskingOptions);
  };

  // Check if section is revealed
  const isSectionRevealed = (section: string): boolean => {
    return revealedSections.has(section);
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Log data access when modal opens
  useEffect(() => {
    if (isOpen && record && user && privacySettings.auditDataAccess) {
      logDataAccess(user.id, 'forensic_report', record.id, {
        action: 'view_details',
        privacyLevel: privacySettings.maskingLevel
      });
    }
  }, [isOpen, record?.id, user, privacySettings.auditDataAccess]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      revealTimers.forEach(timer => clearTimeout(timer));
    };
  }, [revealTimers]);

  // Reset revealed sections when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRevealedSections(new Set());
      revealTimers.forEach(timer => clearTimeout(timer));
      setRevealTimers(new Map());
    }
  }, [isOpen]);

  if (!record) return null;

  const privacyAwareData = getPrivacyAwareData();

  // Render field with privacy controls
  const renderPrivacyAwareField = (
    label: string,
    originalValue: string,
    maskedValue: string,
    sectionKey: string,
    icon?: React.ReactNode
  ) => {
    const isRevealed = isSectionRevealed(sectionKey);
    const shouldMask = originalValue !== maskedValue;
    const displayValue = isRevealed ? originalValue : maskedValue;

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-1">
            {icon}
            {label}
            {shouldMask && !isRevealed && (
              <Lock className="h-3 w-3 text-muted-foreground" />
            )}
          </Label>
          <div className="flex items-center gap-1">
            {privacySettings.allowTemporaryReveal && shouldMask && (
              <Button
                onClick={() => handleTemporaryReveal(sectionKey)}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
              >
                {isRevealed ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
            )}
            <Button
              onClick={() => copyToClipboard(displayValue)}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="font-mono text-sm bg-muted p-2 rounded break-all">
          {displayValue || '[Not Available]'}
        </div>
        {isRevealed && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Timer className="h-3 w-3" />
            Temporarily revealed (will hide automatically)
          </div>
        )}
      </div>
    );
  };

  const getAuthResultIcon = (result: string) => {
    switch (result?.toLowerCase()) {
      case 'pass':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <MinusCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getAuthResultBadge = (result: string) => {
    const variant = result?.toLowerCase() === 'pass' ? 'default' : 'destructive';
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {getAuthResultIcon(result)}
        {result || 'unknown'}
      </Badge>
    );
  };

  const getThreatLevel = () => {
    const spfFail = record.spfResult === 'fail';
    const dkimFail = record.dkimResult === 'fail';
    const isRejected = record.policyEvaluated === 'reject';
    
    if (spfFail && dkimFail && isRejected) return { level: 'High', color: 'text-red-600 bg-red-50' };
    if ((spfFail || dkimFail) && record.policyEvaluated === 'quarantine') return { level: 'Medium', color: 'text-orange-600 bg-orange-50' };
    return { level: 'Low', color: 'text-yellow-600 bg-yellow-50' };
  };

  const threatLevel = getThreatLevel();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Forensic Report Details
                {!privacySettings.showEmailAddresses && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Privacy Protected
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Detailed analysis of failed email authentication - {formatTimestamp(record.arrivalDate)}
                {privacySettings.auditDataAccess && (
                  <span className="text-xs text-muted-foreground ml-2">(Access logged)</span>
                )}
              </DialogDescription>
            </div>
            {revealedSections.size > 0 && (
              <Alert className="w-auto">
                <Timer className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {revealedSections.size} section(s) temporarily revealed
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogHeader>

        {/* Quick Privacy Controls */}
        {onPrivacySettingsChange && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Privacy Controls
                <Badge variant="secondary" className="text-xs">
                  {privacySettings.maskingLevel}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-emails-modal"
                    checked={privacySettings.showEmailAddresses}
                    onCheckedChange={(checked) =>
                      onPrivacySettingsChange({ ...privacySettings, showEmailAddresses: checked })
                    }
                  />
                  <Label htmlFor="show-emails-modal" className="text-sm">Show Emails</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-subjects-modal"
                    checked={privacySettings.showSubjects}
                    onCheckedChange={(checked) =>
                      onPrivacySettingsChange({ ...privacySettings, showSubjects: checked })
                    }
                  />
                  <Label htmlFor="show-subjects-modal" className="text-sm">Show Subjects</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-headers-modal"
                    checked={privacySettings.showHeaders}
                    onCheckedChange={(checked) =>
                      onPrivacySettingsChange({ ...privacySettings, showHeaders: checked })
                    }
                  />
                  <Label htmlFor="show-headers-modal" className="text-sm">Show Headers</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-content-modal"
                    checked={privacySettings.showMessageContent}
                    onCheckedChange={(checked) =>
                      onPrivacySettingsChange({ ...privacySettings, showMessageContent: checked })
                    }
                  />
                  <Label htmlFor="show-content-modal" className="text-sm">Show Content</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="auth">Authentication</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Threat Assessment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Threat Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <Badge className={`px-3 py-1 ${threatLevel.color}`}>
                    Threat Level: {threatLevel.level}
                  </Badge>
                  <Badge variant="outline">
                    Policy: {record.policyEvaluated}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">SPF Result</div>
                    {getAuthResultBadge(record.spfResult)}
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">DKIM Result</div>
                    {getAuthResultBadge(record.dkimResult)}
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">DMARC Result</div>
                    {getAuthResultBadge(record.dmarcResult)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    {renderPrivacyAwareField(
                      'From',
                      record.maskedFrom,
                      privacyAwareData.envelope_from || '',
                      'from',
                      <Mail className="h-3 w-3" />
                    )}
                  </div>
                  <div>
                    {renderPrivacyAwareField(
                      'To',
                      record.maskedTo || '',
                      privacyAwareData.envelope_to || '',
                      'to',
                      <Mail className="h-3 w-3" />
                    )}
                  </div>
                </div>
                <div>
                  {renderPrivacyAwareField(
                    'Subject',
                    record.truncatedSubject || '',
                    privacyAwareData.subject || '',
                    'subject',
                    <FileText className="h-3 w-3" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Technical Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Technical Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Source IP
                    </Label>
                    <div className="font-mono text-sm bg-muted p-2 rounded">
                      {record.sourceIp}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Domain
                    </Label>
                    <div className="font-mono text-sm bg-muted p-2 rounded">
                      {record.domain}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Arrival Time
                    </Label>
                    <div className="text-sm bg-muted p-2 rounded">
                      {record.arrivalDate.toLocaleString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="auth" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        {getAuthResultIcon(record.spfResult)}
                        SPF Authentication
                      </h4>
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Result:</span> {record.spfResult || 'unknown'}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Domain:</span> {record.domain}
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        {getAuthResultIcon(record.dkimResult)}
                        DKIM Authentication
                      </h4>
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Result:</span> {record.dkimResult || 'unknown'}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Selector:</span> {record.dkimSelector || 'N/A'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        {getAuthResultIcon(record.dmarcResult)}
                        DMARC Evaluation
                      </h4>
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Result:</span> {record.dmarcResult || 'unknown'}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Policy:</span> {record.policyEvaluated}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="headers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Headers</CardTitle>
              </CardHeader>
              <CardContent>
                {privacySettings.showHeaders ? (
                  renderPrivacyAwareField(
                    'Original Headers',
                    record.originalHeaders || 'Headers not available',
                    privacyAwareData.original_headers || '[HEADERS HIDDEN]',
                    'headers'
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Lock className="h-8 w-8 mx-auto mb-2" />
                    <p>Headers are hidden due to privacy settings</p>
                    {privacySettings.allowTemporaryReveal && (
                      <Button
                        onClick={() => handleTemporaryReveal('headers')}
                        variant="outline"
                        className="mt-2"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Temporarily Reveal
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Message Content</CardTitle>
              </CardHeader>
              <CardContent>
                {privacySettings.showMessageContent ? (
                  renderPrivacyAwareField(
                    'Message Body',
                    record.messageBody || 'Content not available',
                    privacyAwareData.message_body || '[CONTENT HIDDEN]',
                    'content'
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Lock className="h-8 w-8 mx-auto mb-2" />
                    <p>Message content is hidden due to privacy settings</p>
                    {privacySettings.allowTemporaryReveal && (
                      <Button
                        onClick={() => handleTemporaryReveal('content')}
                        variant="outline"
                        className="mt-2"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Temporarily Reveal
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <div className="flex gap-2">
            <Button
              onClick={() => copyToClipboard(JSON.stringify(record, null, 2))}
              variant="outline"
              size="sm"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Raw Data
            </Button>
          </div>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ForensicDetailModalPrivacy;