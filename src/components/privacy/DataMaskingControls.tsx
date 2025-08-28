import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Eye, 
  EyeOff, 
  Clock, 
  Shield, 
  Settings, 
  Copy,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { 
  MaskingLevel,
  PrivacySettings,
  MaskingOptions,
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_MASKING_OPTIONS,
  MASKING_LEVELS,
  maskEmailAddress,
  maskSubjectLine,
  sanitizeEmailHeaders,
  redactMessageContent,
  applyPrivacySettings,
  getPrivacyLevelDescription
} from '@/utils/privacyManager';
import { logTemporaryReveal, logPrivacyChange } from '@/utils/privacyAudit';
import { useAuth } from '@/hooks/useAuth';

interface DataMaskingControlsProps {
  settings: PrivacySettings;
  maskingOptions: MaskingOptions;
  onSettingsChange: (settings: PrivacySettings) => void;
  onMaskingOptionsChange: (options: MaskingOptions) => void;
}

interface SampleData {
  emailAddress: string;
  subject: string;
  headers: string;
  messageContent: string;
}

const SAMPLE_DATA: SampleData = {
  emailAddress: 'john.doe@example.com',
  subject: 'DMARC Authentication Failed for important-notification@company.com',
  headers: `From: sender@suspicious-domain.com
To: recipient@example.com  
Date: Mon, 1 Jan 2024 12:00:00 +0000
Subject: DMARC Authentication Failed
Message-ID: <abc123@suspicious-domain.com>
Authentication-Results: example.com; dmarc=fail (p=quarantine dis=none) header.from=suspicious-domain.com
Received-SPF: fail (example.com: domain of sender@suspicious-domain.com does not designate 192.168.1.100 as permitted sender)
DKIM-Signature: v=1; a=rsa-sha256; d=suspicious-domain.com; s=selector1; h=from:to:subject`,
  messageContent: `Dear Customer,

Your account has been temporarily suspended due to suspicious activity. Please verify your identity by clicking the link below:

https://secure-verification.suspicious-domain.com/verify?token=abc123xyz789

If you have any questions, please contact support at support@company.com or call us at 555-123-4567.

Best regards,
Security Team`
};

export function DataMaskingControls({ 
  settings, 
  maskingOptions, 
  onSettingsChange, 
  onMaskingOptionsChange 
}: DataMaskingControlsProps) {
  const { user } = useAuth();
  const [previewData, setPreviewData] = useState<SampleData>(SAMPLE_DATA);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());
  const [revealTimers, setRevealTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [customKeywords, setCustomKeywords] = useState<string>(
    maskingOptions.preserveSubjectKeywords.join(', ')
  );
  const [customHeaders, setCustomHeaders] = useState<string>(
    maskingOptions.headerWhitelist.join(', ')
  );

  // Apply masking to preview data
  const maskedPreview = useMemo(() => {
    const mockForensicData = {
      envelope_from: previewData.emailAddress,
      envelope_to: 'recipient@example.com',
      header_from: previewData.emailAddress,
      subject: previewData.subject,
      original_headers: previewData.headers,
      message_body: previewData.messageContent,
    };

    return applyPrivacySettings(mockForensicData, settings, maskingOptions);
  }, [previewData, settings, maskingOptions]);

  // Handle masking level change
  const handleMaskingLevelChange = (level: MaskingLevel) => {
    const newSettings = { 
      ...settings, 
      ...MASKING_LEVELS[level] 
    };
    onSettingsChange(newSettings);

    if (user) {
      logPrivacyChange(user.id, settings, newSettings, 'masking_level');
    }
  };

  // Handle temporary reveal
  const handleTemporaryReveal = (field: string, duration: number = 10000) => {
    if (!settings.allowTemporaryReveal) return;

    // Clear existing timer for this field
    const existingTimer = revealTimers.get(field);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Add to revealed fields
    setRevealedFields(prev => new Set([...prev, field]));

    // Set timer to hide again
    const timer = setTimeout(() => {
      setRevealedFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(field);
        return newSet;
      });
      setRevealTimers(prev => {
        const newMap = new Map(prev);
        newMap.delete(field);
        return newMap;
      });
    }, duration);

    setRevealTimers(prev => new Map([...prev, [field, timer]]));

    // Log the temporary reveal
    if (user) {
      logTemporaryReveal(user.id, 'email_addresses', field, duration);
    }
  };

  // Update custom keywords
  const handleKeywordsChange = (keywords: string) => {
    setCustomKeywords(keywords);
    const keywordArray = keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    onMaskingOptionsChange({
      ...maskingOptions,
      preserveSubjectKeywords: keywordArray
    });
  };

  // Update custom headers
  const handleHeadersChange = (headers: string) => {
    setCustomHeaders(headers);
    const headerArray = headers
      .split(',')
      .map(h => h.trim())
      .filter(h => h.length > 0);
    
    onMaskingOptionsChange({
      ...maskingOptions,
      headerWhitelist: headerArray
    });
  };

  // Reset to defaults
  const resetToDefaults = () => {
    onSettingsChange(DEFAULT_PRIVACY_SETTINGS);
    onMaskingOptionsChange(DEFAULT_MASKING_OPTIONS);
    setCustomKeywords(DEFAULT_MASKING_OPTIONS.preserveSubjectKeywords.join(', '));
    setCustomHeaders(DEFAULT_MASKING_OPTIONS.headerWhitelist.join(', '));
  };

  // Copy sample data
  const copySampleData = (data: string) => {
    navigator.clipboard.writeText(data);
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      revealTimers.forEach(timer => clearTimeout(timer));
    };
  }, [revealTimers]);

  return (
    <div className="space-y-6">
      {/* Privacy Level Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy Protection Level
          </CardTitle>
          <CardDescription>
            Choose your baseline privacy protection level. You can customize individual settings below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(MASKING_LEVELS).map(([level, config]) => (
              <Card 
                key={level}
                className={`cursor-pointer transition-colors ${
                  settings.maskingLevel === level 
                    ? 'border-primary bg-primary/5' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => handleMaskingLevelChange(level as MaskingLevel)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm capitalize">{level}</CardTitle>
                  <CardDescription className="text-xs">
                    {getPrivacyLevelDescription(level as MaskingLevel)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Email Addresses:</span>
                      <Badge variant={config.showEmailAddresses ? 'destructive' : 'default'}>
                        {config.showEmailAddresses ? 'Visible' : 'Masked'}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Message Content:</span>
                      <Badge variant={config.showMessageContent ? 'destructive' : 'default'}>
                        {config.showMessageContent ? 'Visible' : 'Hidden'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="visibility" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="visibility">Visibility</TabsTrigger>
          <TabsTrigger value="masking">Masking Rules</TabsTrigger>
          <TabsTrigger value="preview">Live Preview</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Visibility Controls */}
        <TabsContent value="visibility" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Visibility Settings</CardTitle>
              <CardDescription>
                Control what information is visible in forensic reports
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Email Addresses</Label>
                    <p className="text-sm text-muted-foreground">
                      Show sender and recipient email addresses
                    </p>
                  </div>
                  <Switch
                    checked={settings.showEmailAddresses}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ ...settings, showEmailAddresses: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Subject Lines</Label>
                    <p className="text-sm text-muted-foreground">
                      Display email subject lines (with keyword preservation)
                    </p>
                  </div>
                  <Switch
                    checked={settings.showSubjects}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ ...settings, showSubjects: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Email Headers</Label>
                    <p className="text-sm text-muted-foreground">
                      Show email headers (filtered to authentication-related headers)
                    </p>
                  </div>
                  <Switch
                    checked={settings.showHeaders}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ ...settings, showHeaders: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Message Content</Label>
                    <p className="text-sm text-muted-foreground">
                      Display email message body content (redacted for privacy)
                    </p>
                  </div>
                  <Switch
                    checked={settings.showMessageContent}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ ...settings, showMessageContent: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Allow Temporary Reveal</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable temporary reveal of masked data (with audit logging)
                    </p>
                  </div>
                  <Switch
                    checked={settings.allowTemporaryReveal}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ ...settings, allowTemporaryReveal: checked })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Masking Rules */}
        <TabsContent value="masking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custom Masking Rules</CardTitle>
              <CardDescription>
                Configure how data is masked when privacy protection is enabled
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Preserve Domains in Email Addresses</Label>
                <Switch
                  checked={maskingOptions.preserveDomains}
                  onCheckedChange={(checked) =>
                    onMaskingOptionsChange({ ...maskingOptions, preserveDomains: checked })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Keep domain names visible when masking email addresses for threat analysis
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Subject Line Keywords to Preserve</Label>
                <Textarea
                  value={customKeywords}
                  onChange={(e) => handleKeywordsChange(e.target.value)}
                  placeholder="DMARC, SPF, DKIM, authentication, failed"
                  className="h-20"
                />
                <p className="text-sm text-muted-foreground">
                  Comma-separated list of keywords to keep visible in subject lines for security analysis
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Allowed Email Headers</Label>
                <Textarea
                  value={customHeaders}
                  onChange={(e) => handleHeadersChange(e.target.value)}
                  placeholder="from, to, date, subject, authentication-results"
                  className="h-24"
                />
                <p className="text-sm text-muted-foreground">
                  Comma-separated list of email headers to include (others will be filtered out)
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Maximum Content Length</Label>
                <div className="px-3 py-2">
                  <Slider
                    value={[maskingOptions.maxContentLength]}
                    onValueChange={([value]) =>
                      onMaskingOptionsChange({ ...maskingOptions, maxContentLength: value })
                    }
                    min={100}
                    max={2000}
                    step={50}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-1">
                    <span>100 chars</span>
                    <span>{maskingOptions.maxContentLength} chars</span>
                    <span>2000 chars</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Maximum length of message content to display (longer content will be truncated)
                </p>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={resetToDefaults} className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reset to Defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Live Preview */}
        <TabsContent value="preview" className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Live Privacy Preview</AlertTitle>
            <AlertDescription>
              See how your privacy settings affect the display of sensitive data. 
              {settings.allowTemporaryReveal && ' Click the eye icon to temporarily reveal masked data.'}
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            {/* Email Address Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Email Addresses
                  {settings.allowTemporaryReveal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTemporaryReveal('email', 15000)}
                      className="h-6 w-6 p-0"
                    >
                      {revealedFields.has('email') ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Original:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copySampleData(previewData.emailAddress)}
                      className="h-4 w-4 p-0 ml-2"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="bg-muted p-2 rounded">
                    {revealedFields.has('email') ? previewData.emailAddress : maskedPreview.envelope_from}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subject Line Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Subject Line
                  {settings.allowTemporaryReveal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTemporaryReveal('subject', 15000)}
                      className="h-6 w-6 p-0"
                    >
                      {revealedFields.has('subject') ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copySampleData(maskedPreview.subject)}
                      className="h-4 w-4 p-0 ml-2"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="bg-muted p-2 rounded">
                    {revealedFields.has('subject') ? previewData.subject : maskedPreview.subject}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Message Content Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Message Content
                  {settings.allowTemporaryReveal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTemporaryReveal('content', 20000)}
                      className="h-6 w-6 p-0"
                    >
                      {revealedFields.has('content') ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-sm">
                  <div className="bg-muted p-3 rounded max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">
                      {revealedFields.has('content') 
                        ? previewData.messageContent 
                        : maskedPreview.message_body || '[CONTENT HIDDEN]'}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Reveal Timer Display */}
            {revealedFields.size > 0 && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertTitle>Temporary Reveal Active</AlertTitle>
                <AlertDescription>
                  {revealedFields.size} field(s) temporarily revealed. 
                  Data will be automatically masked again shortly.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Privacy Controls</CardTitle>
              <CardDescription>
                Advanced options for privacy protection and compliance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Preserve Timestamps</Label>
                    <p className="text-sm text-muted-foreground">
                      Keep original timestamps for forensic analysis
                    </p>
                  </div>
                  <Switch
                    checked={maskingOptions.preserveTimestamps}
                    onCheckedChange={(checked) =>
                      onMaskingOptionsChange({ ...maskingOptions, preserveTimestamps: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Preserve IP Addresses</Label>
                    <p className="text-sm text-muted-foreground">
                      Show IP addresses for threat source analysis
                    </p>
                  </div>
                  <Switch
                    checked={maskingOptions.preserveIPAddresses}
                    onCheckedChange={(checked) =>
                      onMaskingOptionsChange({ ...maskingOptions, preserveIPAddresses: checked })
                    }
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Custom Sample Data</Label>
                  <p className="text-sm text-muted-foreground">
                    Test your privacy settings with custom data
                  </p>
                  <div className="grid gap-2">
                    <Input
                      placeholder="Email address"
                      value={previewData.emailAddress}
                      onChange={(e) => setPreviewData(prev => ({ ...prev, emailAddress: e.target.value }))}
                    />
                    <Input
                      placeholder="Subject line"
                      value={previewData.subject}
                      onChange={(e) => setPreviewData(prev => ({ ...prev, subject: e.target.value }))}
                    />
                    <Textarea
                      placeholder="Message content"
                      value={previewData.messageContent}
                      onChange={(e) => setPreviewData(prev => ({ ...prev, messageContent: e.target.value }))}
                      className="h-24"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setPreviewData(SAMPLE_DATA)}
                      className="w-fit"
                    >
                      Reset to Sample Data
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Privacy Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Data Masking:</span>
                  <Badge variant={settings.maskingLevel !== 'minimal' ? 'default' : 'destructive'}>
                    {settings.maskingLevel !== 'minimal' ? 'Enabled' : 'Minimal'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Audit Logging:</span>
                  <Badge variant={settings.auditDataAccess ? 'default' : 'destructive'}>
                    {settings.auditDataAccess ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Temporary Reveal:</span>
                  <Badge variant={settings.allowTemporaryReveal ? 'secondary' : 'default'}>
                    {settings.allowTemporaryReveal ? 'Permitted' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}