import { useState } from 'react';
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
  MinusCircle
} from 'lucide-react';
import { ForensicRecord } from '@/hooks/useForensicData';
import { 
  maskEmailAddress, 
  sanitizeHeaders, 
  sanitizeContent,
  formatTimestamp,
  PRIVACY_LEVELS,
  PrivacyLevel
} from '@/utils/privacyProtection';

interface ForensicDetailModalProps {
  record: ForensicRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

const ForensicDetailModal = ({ record, isOpen, onClose }: ForensicDetailModalProps) => {
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel['level']>('medium');
  const [showSensitiveData, setShowSensitiveData] = useState(false);

  if (!record) return null;

  const currentPrivacySettings = PRIVACY_LEVELS[privacyLevel];

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
    console.log(`${label} copied to clipboard`);
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
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Forensic Report Details
          </DialogTitle>
          <DialogDescription>
            Detailed analysis of failed email authentication - {formatTimestamp(record.arrivalDate)}
          </DialogDescription>
        </DialogHeader>

        {/* Privacy Controls */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Privacy Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="privacy-low"
                    checked={privacyLevel === 'low'}
                    onCheckedChange={(checked) => checked && setPrivacyLevel('low')}
                  />
                  <Label htmlFor="privacy-low">Low Privacy (Show all data)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="privacy-medium"
                    checked={privacyLevel === 'medium'}
                    onCheckedChange={(checked) => checked && setPrivacyLevel('medium')}
                  />
                  <Label htmlFor="privacy-medium">Medium Privacy (Mask emails)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="privacy-high"
                    checked={privacyLevel === 'high'}
                    onCheckedChange={(checked) => checked && setPrivacyLevel('high')}
                  />
                  <Label htmlFor="privacy-high">High Privacy (Hide sensitive data)</Label>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-sensitive"
                  checked={showSensitiveData}
                  onCheckedChange={setShowSensitiveData}
                  disabled={privacyLevel === 'high'}
                />
                <Label htmlFor="show-sensitive">
                  {showSensitiveData ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  Show Raw Content
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="authentication">Authentication</TabsTrigger>
            <TabsTrigger value="content">Email Content</TabsTrigger>
            <TabsTrigger value="threat">Threat Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Email Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Metadata
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Message ID</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-sm bg-muted p-2 rounded flex-1 break-all">
                        {record.messageId || '[Not Available]'}
                      </span>
                      {record.messageId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(record.messageId!, 'Message ID')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Arrival Time</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {formatTimestamp(record.arrivalDate)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Source IP</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm">{record.sourceIp}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(record.sourceIp, 'Source IP')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Domain</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{record.domain}</span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">From Address</Label>
                    <div className="mt-1">
                      <span className="text-sm bg-muted p-2 rounded block">
                        {currentPrivacySettings.showFullEmails && privacyLevel === 'low' 
                          ? record.maskedFrom 
                          : maskEmailAddress(record.maskedFrom, privacyLevel)
                        }
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">To Address</Label>
                    <div className="mt-1">
                      <span className="text-sm bg-muted p-2 rounded block">
                        {record.maskedTo ? (
                          currentPrivacySettings.showFullEmails && privacyLevel === 'low' 
                            ? record.maskedTo 
                            : maskEmailAddress(record.maskedTo, privacyLevel)
                        ) : '[Not Available]'}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="authentication" className="space-y-4">
            {/* Authentication Results */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Authentication Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Server className="h-5 w-5" />
                      <Label className="font-medium">SPF</Label>
                    </div>
                    {getAuthResultBadge(record.spfResult)}
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Shield className="h-5 w-5" />
                      <Label className="font-medium">DKIM</Label>
                    </div>
                    {getAuthResultBadge(record.dkimResult)}
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <AlertTriangle className="h-5 w-5" />
                      <Label className="font-medium">DMARC</Label>
                    </div>
                    {getAuthResultBadge(record.dmarcResult)}
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <Label className="font-medium mb-2 block">Policy Evaluation</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Applied Policy:</span>
                    <Badge variant={record.policyEvaluated === 'reject' ? 'destructive' : 'secondary'}>
                      {record.policyEvaluated || 'none'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="space-y-4">
            {/* Email Content */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Content
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Subject</Label>
                  <div className="mt-1 p-3 bg-muted rounded">
                    <span className="text-sm">
                      {record.truncatedSubject || '[No Subject]'}
                    </span>
                  </div>
                </div>

                {(currentPrivacySettings.showHeaders || showSensitiveData) && record.rawData?.originalHeaders && (
                  <div>
                    <Label className="text-sm font-medium">Email Headers</Label>
                    <div className="mt-1">
                      <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {sanitizeHeaders(record.rawData.originalHeaders, privacyLevel)}
                      </pre>
                    </div>
                  </div>
                )}

                {(currentPrivacySettings.showContent || showSensitiveData) && record.rawData?.messageBody && (
                  <div>
                    <Label className="text-sm font-medium">Message Body</Label>
                    <div className="mt-1">
                      <div className="text-sm bg-muted p-3 rounded max-h-40 overflow-y-auto">
                        {sanitizeContent(record.rawData.messageBody, 1000, privacyLevel)}
                      </div>
                    </div>
                  </div>
                )}

                {record.rawData?.isEncrypted && (
                  <div className="p-3 border border-yellow-200 bg-yellow-50 rounded">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <Shield className="h-4 w-4" />
                      <span className="text-sm font-medium">Encrypted Content</span>
                    </div>
                    <p className="text-sm text-yellow-700 mt-1">
                      This forensic report contains encrypted content for privacy protection.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="threat" className="space-y-4">
            {/* Threat Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Threat Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`p-4 rounded-lg ${threatLevel.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">Threat Level: {threatLevel.level}</span>
                  </div>
                  <p className="text-sm">
                    Based on authentication failures and policy evaluation.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Authentication Failure Type</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {record.authFailure}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Recommended Actions</Label>
                    <ul className="list-disc list-inside text-sm text-muted-foreground mt-1 space-y-1">
                      {record.spfResult === 'fail' && (
                        <li>Review and update SPF records for the sending domain</li>
                      )}
                      {record.dkimResult === 'fail' && (
                        <li>Verify DKIM signing configuration and key validity</li>
                      )}
                      {record.policyEvaluated === 'none' && (
                        <li>Consider implementing stricter DMARC policy (quarantine or reject)</li>
                      )}
                      <li>Monitor this source IP for continued suspicious activity</li>
                      <li>Consider blocking or rate-limiting this source if pattern continues</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {/* TODO: Implement geolocation lookup */}}
            >
              <MapPin className="h-4 w-4 mr-2" />
              Lookup IP Location
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {/* TODO: Implement export functionality */}}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ForensicDetailModal;