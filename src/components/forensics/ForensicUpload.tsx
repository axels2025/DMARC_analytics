import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload as UploadIcon, 
  Mail, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  FileText,
  Inbox
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface ForensicUploadStatus {
  status: "idle" | "processing" | "success" | "error";
  progress: number;
  message: string;
  processedCount?: number;
  skippedCount?: number;
}

interface ParsedForensicReport {
  reportId: string;
  arrivalDate: number;
  sourceIp: string;
  envelopeFrom: string;
  envelopeTo: string;
  subject: string;
  authFailure: string;
  spfResult: string;
  dkimResult: string;
  dmarcResult: string;
  policyEvaluated: string;
  messageId?: string;
  originalHeaders?: string;
  messageBody?: string;
  domain: string;
}

interface ForensicUploadProps {
  onUploadSuccess?: () => void;
}

const ForensicUpload = ({ onUploadSuccess }: ForensicUploadProps) => {
  const { user } = useAuth();
  const [uploadStatus, setUploadStatus] = useState<ForensicUploadStatus>({
    status: "idle",
    progress: 0,
    message: ""
  });

  // Parse email format forensic report
  const parseEmailForensicReport = (emailContent: string): ParsedForensicReport | null => {
    try {
      // Extract headers and body
      const emailParts = emailContent.split('\n\n');
      let headers = '';
      let body = '';
      
      if (emailParts.length >= 2) {
        headers = emailParts[0];
        body = emailParts.slice(1).join('\n\n');
      } else {
        headers = emailContent;
      }

      // Parse headers into key-value pairs
      const headerLines = headers.split('\n');
      const headerMap: Record<string, string> = {};
      
      let currentHeader = '';
      for (const line of headerLines) {
        if (line.match(/^\s+/) && currentHeader) {
          // Continuation of previous header
          headerMap[currentHeader] += ' ' + line.trim();
        } else {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            currentHeader = line.substring(0, colonIndex).toLowerCase().trim();
            headerMap[currentHeader] = line.substring(colonIndex + 1).trim();
          }
        }
      }

      // Extract required fields
      const fromHeader = headerMap['from'] || headerMap['envelope-from'] || '';
      const toHeader = headerMap['to'] || headerMap['envelope-to'] || '';
      const subject = headerMap['subject'] || '[No Subject]';
      const messageId = headerMap['message-id'];
      const receivedHeaders = Object.keys(headerMap)
        .filter(key => key.startsWith('received'))
        .map(key => headerMap[key]);

      // Extract source IP from Received headers (best effort)
      let sourceIp = '0.0.0.0';
      for (const received of receivedHeaders) {
        const ipMatch = received.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
        if (ipMatch) {
          sourceIp = ipMatch[1];
          break;
        }
      }

      // Extract domain from envelope-to or to header
      const emailMatch = toHeader.match(/@([^>\s]+)/);
      const domain = emailMatch ? emailMatch[1].toLowerCase() : 'unknown.domain';

      // Generate report ID if not present
      const reportId = messageId?.replace(/[<>]/g, '') || 
                      `forensic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Determine failure types based on content
      let authFailure = 'Unknown Failure';
      let spfResult = 'unknown';
      let dkimResult = 'unknown';
      let dmarcResult = 'fail';
      let policyEvaluated = 'none';

      // Look for authentication failure indicators in headers or body
      const contentLower = emailContent.toLowerCase();
      if (contentLower.includes('spf') && contentLower.includes('fail')) {
        spfResult = 'fail';
        authFailure = 'SPF Failure';
      }
      if (contentLower.includes('dkim') && contentLower.includes('fail')) {
        dkimResult = 'fail';
        if (authFailure === 'SPF Failure') {
          authFailure = 'SPF/DKIM Failure';
        } else {
          authFailure = 'DKIM Failure';
        }
      }
      if (contentLower.includes('dmarc') && contentLower.includes('fail')) {
        dmarcResult = 'fail';
      }

      // Look for policy evaluation
      if (contentLower.includes('quarantine')) {
        policyEvaluated = 'quarantine';
      } else if (contentLower.includes('reject')) {
        policyEvaluated = 'reject';
      }

      return {
        reportId,
        arrivalDate: Math.floor(Date.now() / 1000),
        sourceIp,
        envelopeFrom: fromHeader,
        envelopeTo: toHeader,
        subject,
        authFailure,
        spfResult,
        dkimResult,
        dmarcResult,
        policyEvaluated,
        messageId,
        originalHeaders: headers,
        messageBody: body,
        domain
      };
    } catch (error) {
      console.error('Error parsing forensic report:', error);
      return null;
    }
  };

  // Save forensic report to database
  const saveForensicReport = async (report: ParsedForensicReport): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('dmarc_forensic_reports')
        .insert({
          user_id: user!.id,
          domain: report.domain,
          report_id: report.reportId,
          arrival_date: report.arrivalDate,
          source_ip: report.sourceIp,
          auth_failure: report.authFailure,
          envelope_from: report.envelopeFrom,
          envelope_to: report.envelopeTo,
          subject: report.subject,
          spf_result: report.spfResult,
          dkim_result: report.dkimResult,
          dmarc_result: report.dmarcResult,
          policy_evaluated: report.policyEvaluated,
          message_id: report.messageId,
          original_headers: report.originalHeaders,
          message_body: report.messageBody,
          privacy_level: 'standard',
          data_classification: 'internal'
        });

      if (error) {
        console.error('Error saving forensic report:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in saveForensicReport:', error);
      return false;
    }
  };

  // Process single forensic report
  const processSingleReport = async (content: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    setUploadStatus({
      status: "processing",
      progress: 20,
      message: "Parsing forensic report..."
    });

    const report = parseEmailForensicReport(content);
    if (!report) {
      throw new Error('Failed to parse forensic report format');
    }

    setUploadStatus({
      status: "processing",
      progress: 60,
      message: "Saving to database..."
    });

    const saved = await saveForensicReport(report);
    if (!saved) {
      throw new Error('Failed to save forensic report to database');
    }

    setUploadStatus({
      status: "success",
      progress: 100,
      message: `Successfully processed forensic report for ${report.domain}`,
      processedCount: 1
    });

    // Call success callback to refresh parent data
    onUploadSuccess?.();
  };

  // Process multiple forensic reports (batch)
  const processMultipleReports = async (content: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Split content by email boundaries (common separators)
    const emailSeparators = [
      /^From \S+.*$/gm,  // Unix mbox format
      /^-----Original Message-----$/gm,
      /^>From:/gm,
      /^\n\n--- Forwarded message ---$/gm
    ];

    let emails = [content];
    
    // Try to split by each separator
    for (const separator of emailSeparators) {
      const parts = content.split(separator);
      if (parts.length > 1) {
        emails = parts.filter(part => part.trim().length > 100); // Filter out small fragments
        break;
      }
    }

    let processedCount = 0;
    let skippedCount = 0;
    const totalEmails = emails.length;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i].trim();
      if (!email) continue;

      setUploadStatus({
        status: "processing",
        progress: Math.floor((i / totalEmails) * 90),
        message: `Processing report ${i + 1} of ${totalEmails}...`
      });

      try {
        const report = parseEmailForensicReport(email);
        if (report) {
          const saved = await saveForensicReport(report);
          if (saved) {
            processedCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`Error processing email ${i + 1}:`, error);
        skippedCount++;
      }
    }

    setUploadStatus({
      status: "success",
      progress: 100,
      message: `Processing complete: ${processedCount} reports saved, ${skippedCount} skipped`,
      processedCount,
      skippedCount
    });

    // Call success callback to refresh parent data
    if (processedCount > 0) {
      onUploadSuccess?.();
    }
  };

  // Handle file drop
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    
    try {
      setUploadStatus({
        status: "processing",
        progress: 10,
        message: "Reading file..."
      });

      const content = await file.text();
      
      if (content.includes('From ') || content.includes('-----Original Message-----')) {
        await processMultipleReports(content);
      } else {
        await processSingleReport(content);
      }

      toast({
        title: "Upload Successful",
        description: `Forensic report(s) processed successfully`,
      });

    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      setUploadStatus({
        status: "error",
        progress: 0,
        message: errorMessage
      });

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [user]);

  // Handle manual text input
  const handleManualUpload = async (content: string) => {
    if (!content.trim()) {
      toast({
        title: "Empty Content",
        description: "Please provide forensic report content",
        variant: "destructive",
      });
      return;
    }

    try {
      await processSingleReport(content);
      toast({
        title: "Upload Successful",
        description: "Forensic report processed successfully",
      });
    } catch (error) {
      console.error('Manual upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      setUploadStatus({
        status: "error",
        progress: 0,
        message: errorMessage
      });

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt', '.eml'],
      'message/rfc822': ['.eml'],
      'application/octet-stream': ['.eml']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB limit
  });

  const resetUpload = () => {
    setUploadStatus({
      status: "idle",
      progress: 0,
      message: ""
    });
  };

  const getStatusColor = () => {
    switch (uploadStatus.status) {
      case "success": return "text-green-600";
      case "error": return "text-red-600";
      case "processing": return "text-blue-600";
      default: return "text-gray-600";
    }
  };

  const getStatusIcon = () => {
    switch (uploadStatus.status) {
      case "success": return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "error": return <XCircle className="w-5 h-5 text-red-600" />;
      case "processing": return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default: return <Mail className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Upload Forensic Reports</h2>
        <p className="text-gray-600 mt-1">
          Import individual DMARC failure reports (RUF) for detailed analysis
        </p>
      </div>

      {/* Upload Methods */}
      <Tabs defaultValue="file" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="file" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            File Upload
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Manual Entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UploadIcon className="h-5 w-5" />
                File Upload
              </CardTitle>
            </CardHeader>
            <CardContent>
              {uploadStatus.status === "idle" ? (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive 
                      ? "border-blue-500 bg-blue-50" 
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input {...getInputProps()} />
                  <Inbox className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  {isDragActive ? (
                    <p className="text-blue-600">Drop your forensic report here...</p>
                  ) : (
                    <>
                      <p className="text-gray-900 mb-1">
                        Drag & drop forensic report file here
                      </p>
                      <p className="text-gray-600 text-sm mb-3">
                        or click to browse (.eml, .txt files)
                      </p>
                      <Button variant="outline" size="sm">Browse Files</Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon()}
                      <div>
                        <p className="text-sm font-medium text-gray-900">Forensic Report</p>
                        <p className={`text-sm ${getStatusColor()}`}>{uploadStatus.message}</p>
                      </div>
                    </div>
                    {uploadStatus.status === "success" && (
                      <Button onClick={resetUpload} variant="outline" size="sm">
                        Upload Another
                      </Button>
                    )}
                  </div>

                  {uploadStatus.status === "processing" && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Processing...</span>
                        <span className="text-gray-600">{uploadStatus.progress}%</span>
                      </div>
                      <Progress value={uploadStatus.progress} className="h-2" />
                    </div>
                  )}

                  {uploadStatus.status === "success" && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Successfully processed {uploadStatus.processedCount || 0} forensic report(s).
                        {uploadStatus.skippedCount ? ` ${uploadStatus.skippedCount} reports were skipped due to parsing errors.` : ''}
                      </AlertDescription>
                    </Alert>
                  )}

                  {uploadStatus.status === "error" && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        {uploadStatus.message}
                        <Button onClick={resetUpload} variant="outline" size="sm" className="ml-3">
                          Try Again
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <ManualForensicUpload onUpload={handleManualUpload} />
        </TabsContent>
      </Tabs>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            Forensic Report Format
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-gray-600 text-sm">
            Forensic reports (RUF) are individual email failure reports sent when DMARC authentication fails. 
            They contain detailed information about specific email messages.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-gray-900 mb-1">Supported Formats:</h4>
              <ul className="text-gray-600 space-y-1">
                <li>• Email message files (.eml)</li>
                <li>• Plain text files (.txt)</li>
                <li>• Raw email content</li>
                <li>• Mbox format (multiple reports)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-1">What We Extract:</h4>
              <ul className="text-gray-600 space-y-1">
                <li>• Email headers and metadata</li>
                <li>• Authentication failure details</li>
                <li>• Source IP addresses</li>
                <li>• Policy evaluation results</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Manual upload component for paste/type functionality  
const ManualForensicUpload = ({ onUpload }: { onUpload: (content: string) => void }) => {
  const [content, setContent] = useState('');
  const [domain, setDomain] = useState('');

  const handleSubmit = () => {
    if (!content.trim()) {
      toast({
        title: "Empty Content",
        description: "Please provide forensic report content",
        variant: "destructive",
      });
      return;
    }

    // If domain is provided, add it to the content for better parsing
    let processedContent = content;
    if (domain) {
      processedContent = `To: user@${domain}\n${content}`;
    }

    onUpload(processedContent);
    setContent('');
    setDomain('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Manual Entry
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="domain">Domain (Optional)</Label>
          <Input
            id="domain"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            Specify the domain if it's not clear from the email content
          </p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="content">Forensic Report Content</Label>
          <Textarea
            id="content"
            placeholder="Paste your forensic report content here (email headers, message body, etc.)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className="font-mono text-sm"
          />
        </div>
        
        <Button 
          onClick={handleSubmit} 
          disabled={!content.trim()}
          className="w-full"
        >
          Process Forensic Report
        </Button>
        
        <div className="text-xs text-gray-500 space-y-1">
          <p>Example content format:</p>
          <pre className="bg-gray-50 p-2 rounded text-xs overflow-x-auto">
From: sender@suspicious-domain.com
To: user@your-domain.com  
Subject: Test Email
Message-ID: &lt;abc123@suspicious-domain.com&gt;
Received: from suspicious-domain.com (1.2.3.4)
Authentication-Results: spf=fail dkim=fail dmarc=fail

Email body content...
          </pre>
        </div>
      </CardContent>
    </Card>
  );
};

export default ForensicUpload;