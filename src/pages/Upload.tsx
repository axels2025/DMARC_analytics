
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload as UploadIcon, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "@/hooks/use-toast";
import { parseDmarcXml, validateDmarcXml } from '@/utils/dmarcParser';
import { saveDmarcReport, checkDuplicateReport } from '@/utils/dmarcDatabase';
import { supabase } from '@/integrations/supabase/client';
import { uploadRateLimiter, validateUploadedFile, validateSessionIntegrity } from '@/utils/security';
import { useAuth } from '@/hooks/useAuth';

interface UploadStatus {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  progress: number;
  message: string;
  fileName?: string;
  reportId?: string;
}

const Upload = () => {
  const { user, session } = useAuth();
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    status: "idle",
    progress: 0,
    message: ""
  });

  // Process DMARC file
  const processFile = useCallback(async (file: File) => {
    console.log(`[processFile] Starting upload process for file: ${file.name} (${file.size} bytes)`);
    
    try {
      // Enhanced authentication validation using React context
      console.log(`[processFile] Validating user authentication`);
      console.log(`[processFile] User from context:`, user ? user.id : 'null');
      console.log(`[processFile] Session from context:`, session ? 'exists' : 'null');
      
      if (!user || !session) {
        console.error(`[processFile] No user or session found in context`);
        throw new Error('User not authenticated. Please sign in to upload reports.');
      }

      // Validate session integrity
      if (!validateSessionIntegrity(session)) {
        console.error(`[processFile] Session integrity check failed`);
        throw new Error('Session expired or invalid. Please sign in again.');
      }

      console.log(`[processFile] User authenticated: ${user.id}`);
      const userId = user.id;

      // Security validation before rate limiting
      console.log(`[processFile] Validating file security`);
      const fileValidation = validateUploadedFile(file);
      if (!fileValidation.isValid) {
        console.error(`[processFile] File validation failed:`, fileValidation.error);
        throw new Error(fileValidation.error || 'File validation failed');
      }

      // Rate limiting check (after validation to prevent abuse)
      console.log(`[processFile] Checking rate limits for user: ${userId}`);
      if (!uploadRateLimiter.canAttempt(userId)) {
        const remaining = uploadRateLimiter.getRemainingAttempts(userId);
        const resetTime = uploadRateLimiter.getResetTime(userId);
        const resetDate = resetTime ? new Date(resetTime).toLocaleTimeString() : 'soon';
        console.warn(`[processFile] Rate limit exceeded for user: ${userId}`);
        throw new Error(`Upload rate limit exceeded. ${remaining} uploads remaining. Limit resets at ${resetDate}.`);
      }

      // Show warnings if any
      if (fileValidation.warnings && fileValidation.warnings.length > 0) {
        fileValidation.warnings.forEach(warning => {
          toast({
            title: "Warning",
            description: warning,
            variant: "default",
          });
        });
      }

      setUploadStatus({
        status: "uploading",
        progress: 10,
        message: "Reading and validating file content...",
        fileName: file.name
      });

      // Record upload attempt
      uploadRateLimiter.recordAttempt(userId);

      // Read file content with timeout
      console.log(`[processFile] Reading file content`);
      const fileContent = await Promise.race([
        file.text(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('File read timeout after 30 seconds')), 30000)
        )
      ]);
      
      console.log(`[processFile] File content read successfully (${fileContent.length} characters)`);
      
      setUploadStatus(prev => ({
        ...prev,
        progress: 30,
        message: "Validating DMARC XML structure and format..."
      }));

      // Validate XML with enhanced error reporting
      console.log(`[processFile] Validating XML format`);
      const xmlValidation = validateDmarcXml(fileContent);
      if (!xmlValidation.isValid) {
        console.error(`[processFile] XML validation failed:`, xmlValidation.error);
        throw new Error(`XML validation failed: ${xmlValidation.error || 'Invalid DMARC XML format'}`);
      }
      console.log(`[processFile] XML validation passed`);

      setUploadStatus(prev => ({
        ...prev,
        progress: 50,
        message: "Extracting email authentication data..."
      }));

      // Parse DMARC report with timeout
      console.log(`[processFile] Parsing DMARC XML`);
      const report = await Promise.race([
        parseDmarcXml(fileContent),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('XML parsing timeout after 60 seconds')), 60000)
        )
      ]);
      
      console.log(`[processFile] Successfully parsed report for domain: ${report.policyPublished.domain} with ${report.records.length} records`);

      setUploadStatus(prev => ({
        ...prev,
        progress: 70,
        message: "Verifying report uniqueness..."
      }));

      // User already validated above

      // Check for duplicate with enhanced logging
      console.log(`[processFile] Checking for duplicate report: ${report.reportMetadata.reportId}`);
      const isDuplicate = await Promise.race([
        checkDuplicateReport(report.reportMetadata.reportId, user.id),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Duplicate check timeout after 10 seconds')), 10000)
        )
      ]);
      
      if (isDuplicate) {
        console.warn(`[processFile] Duplicate report detected: ${report.reportMetadata.reportId}`);
        throw new Error(`This report (ID: ${report.reportMetadata.reportId}) has already been uploaded`);
      }
      console.log(`[processFile] No duplicate found, proceeding with save`);

      setUploadStatus(prev => ({
        ...prev,
        progress: 90,
        message: "Storing report data securely..."
      }));

      // Save to database with timeout
      console.log(`[processFile] Saving report to database`);
      const reportId = await Promise.race([
        saveDmarcReport(report, fileContent, user.id),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Database save timeout after 120 seconds')), 120000)
        )
      ]);
      
      console.log(`[processFile] Successfully saved report with database ID: ${reportId}`);

      setUploadStatus({
        status: "success",
        progress: 100,
        message: `Successfully processed ${report.records.length} authentication records from ${report.policyPublished.domain}`,
        fileName: file.name,
        reportId
      });

      toast({
        title: "Upload Successful",
        description: `DMARC report for ${report.policyPublished.domain} processed successfully. ${report.records.length} records imported.`,
      });

    } catch (error) {
      console.error(`[processFile] Upload failed for file ${file.name}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Upload failed due to an unknown error';
      
      // Enhanced error categorization for better user feedback
      let userFriendlyMessage = errorMessage;
      let shouldRetry = false;
      
      if (errorMessage.includes('timeout')) {
        userFriendlyMessage = 'Upload timed out. Please try again with a smaller file or check your connection.';
        shouldRetry = true;
      } else if (errorMessage.includes('rate limit')) {
        userFriendlyMessage = errorMessage; // Rate limit messages are already user-friendly
        shouldRetry = false;
      } else if (errorMessage.includes('Authentication') || errorMessage.includes('Session')) {
        userFriendlyMessage = 'Your session has expired. Please refresh the page and sign in again.';
        shouldRetry = false;
      } else if (errorMessage.includes('XML validation') || errorMessage.includes('parsing')) {
        userFriendlyMessage = `Invalid DMARC report format: ${errorMessage.replace('XML validation failed: ', '')}`;
        shouldRetry = false;
      } else if (errorMessage.includes('duplicate')) {
        userFriendlyMessage = errorMessage; // Duplicate messages are already clear
        shouldRetry = false;
      } else if (errorMessage.includes('Database') || errorMessage.includes('Transaction')) {
        userFriendlyMessage = 'Database error occurred. Please try again in a few moments.';
        shouldRetry = true;
      }
      
      setUploadStatus({
        status: "error",
        progress: 0,
        message: userFriendlyMessage,
        fileName: file.name
      });

      toast({
        title: "Upload Failed",
        description: userFriendlyMessage + (shouldRetry ? ' You can try again.' : ''),
        variant: "destructive",
      });
      
      // Log detailed error for debugging
      console.error(`[processFile] Error details:`, {
        fileName: file.name,
        fileSize: file.size,
        errorType: error.constructor.name,
        errorMessage: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }, [user, session]);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: { file: File; errors: { code: string; message: string }[] }[]) => {
    console.log(`[onDrop] Called with ${acceptedFiles.length} accepted files and ${rejectedFiles.length} rejected files`);
    
    // Handle rejected files
    rejectedFiles.forEach((fileRejection, index) => {
      const { file, errors } = fileRejection;
      console.error(`[onDrop] Rejected file ${index}: ${file.name}`, errors);
      
      const errorMessages = errors.map((error: { code: string; message: string }) => {
        switch (error.code) {
          case 'file-too-large':
            return 'File size must be less than 50MB';
          case 'file-invalid-type':
            return 'Only XML files are allowed';
          case 'invalid-file-extension':
            return 'File must have .xml extension';
          default:
            return error.message || 'File validation failed';
        }
      });
      
      toast({
        title: "File Upload Error",
        description: `${file.name}: ${errorMessages.join(', ')}`,
        variant: "destructive",
      });
    });
    
    // Process accepted files
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      console.log(`[onDrop] Processing accepted file: ${file.name} (${file.size} bytes, type: ${file.type})`);
      processFile(file);
    }
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
      'text/plain': ['.xml'] // Accept text/plain MIME type for .xml files
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB limit
    validator: (file) => {
      console.log(`[dropzone validator] Validating file: ${file.name}, type: ${file.type}, size: ${file.size}`);
      
      // Check file extension first (more reliable than MIME type)
      if (!file.name.toLowerCase().endsWith('.xml')) {
        console.log(`[dropzone validator] File rejected: not .xml extension`);
        return {
          code: 'invalid-file-extension',
          message: 'File must have .xml extension'
        };
      }
      
      // No filename pattern validation - allow any characters in filename
      // Only requirement is .xml extension which is already checked above
      
      console.log(`[dropzone validator] File validation passed: ${file.name}`);
      return null;
    },
    // Add debugging for dropzone events
    onDropAccepted: (files) => {
      console.log(`[dropzone] onDropAccepted called with ${files.length} files`);
    },
    onDropRejected: (fileRejections) => {
      console.log(`[dropzone] onDropRejected called with ${fileRejections.length} rejections`);
    },
    onFileDialogCancel: () => {
      console.log(`[dropzone] File dialog was cancelled`);
    }
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
      case "uploading":
      case "processing": return "text-blue-600";
      default: return "text-gray-600";
    }
  };

  const getStatusIcon = () => {
    switch (uploadStatus.status) {
      case "success": return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "error": return <XCircle className="w-5 h-5 text-red-600" />;
      case "uploading":
      case "processing": return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default: return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  // Debug: Log render state
  console.log(`[Upload component] Rendering with status:`, uploadStatus);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Debug Section - Remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader>
            <CardTitle className="text-sm text-yellow-800">Debug Info</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-yellow-700">
            <div>Auth User: {user ? user.id : 'null'}</div>
            <div>Auth Session: {session ? 'exists' : 'null'}</div>
            <div>Upload Status: {uploadStatus.status}</div>
            <div>Progress: {uploadStatus.progress}%</div>
            <div>Message: {uploadStatus.message}</div>
            <div>File Name: {uploadStatus.fileName || 'None'}</div>
          </CardContent>
        </Card>
      )}
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload DMARC Report</h1>
        <p className="text-gray-600 mt-1">
          Upload your DMARC XML reports for comprehensive email security analysis
        </p>
      </div>

      {/* Upload Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <span>Before You Upload</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Supported Formats</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• XML files (.xml extension)</li>
                <li>• Standard DMARC report format</li>
                <li>• Maximum file size: 50MB</li>
                <li>• Compressed reports (coming soon)</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">What We Extract</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• Authentication results (DKIM, SPF)</li>
                <li>• Source IP addresses and counts</li>
                <li>• Domain policy information</li>
                <li>• Email disposition actions</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload DMARC Report</CardTitle>
        </CardHeader>
        <CardContent>
          {uploadStatus.status === "idle" ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive 
                  ? "border-blue-500 bg-blue-50" 
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input {...getInputProps()} />
              <UploadIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              {isDragActive ? (
                <p className="text-lg text-blue-600">Drop your DMARC report here...</p>
              ) : (
                <>
                  <p className="text-lg text-gray-900 mb-2">
                    Drag & drop your DMARC XML report here
                  </p>
                  <p className="text-gray-600 mb-4">or click to browse files</p>
                  <Button variant="outline">Browse Files</Button>
                  {process.env.NODE_ENV === 'development' && (
                    <div className="mt-4 text-xs text-gray-500">
                      <div>Dropzone active: {isDragActive ? 'true' : 'false'}</div>
                      <div>Accepted types: text/xml, application/xml</div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* File Info */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon()}
                  <div>
                    <p className="font-medium text-gray-900">{uploadStatus.fileName}</p>
                    <p className={`text-sm ${getStatusColor()}`}>{uploadStatus.message}</p>
                  </div>
                </div>
                {uploadStatus.status === "success" && (
                  <div className="flex space-x-2">
                    {uploadStatus.reportId && (
                      <Button 
                        onClick={() => window.location.href = `/report/${uploadStatus.reportId}`}
                        size="sm"
                      >
                        View Report
                      </Button>
                    )}
                    <Button onClick={resetUpload} variant="outline" size="sm">
                      Upload Another
                    </Button>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {(uploadStatus.status === "uploading" || uploadStatus.status === "processing") && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Processing...</span>
                    <span className="text-gray-600">{uploadStatus.progress}%</span>
                  </div>
                  <Progress value={uploadStatus.progress} className="h-2" />
                </div>
              )}

              {/* Success Message */}
              {uploadStatus.status === "success" && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your DMARC report has been successfully processed and is now available in your dashboard. 
                    The data includes authentication results, source IPs, and policy information.
                    {uploadStatus.reportId && (
                      <Button 
                        variant="link" 
                        className="p-0 ml-2 h-auto"
                        onClick={() => window.location.href = `/report/${uploadStatus.reportId}`}
                      >
                        View Report →
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Message */}
              {uploadStatus.status === "error" && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    {uploadStatus.message}
                    <Button onClick={resetUpload} variant="outline" size="sm" className="ml-4">
                      Try Again
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sample Report Info */}
      <Card>
        <CardHeader>
          <CardTitle>Need a Sample Report?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            If you don't have a DMARC report yet, here's how to get one:
          </p>
          <div className="space-y-2 text-sm text-gray-600">
            <p>1. Set up DMARC DNS record for your domain</p>
            <p>2. Configure email providers to send reports (rua=mailto:reports@yourdomain.com)</p>
            <p>3. Wait 24-48 hours for reports to be generated</p>
            <p>4. Download XML reports from your email</p>
          </div>
          <Button variant="outline" className="mt-4">
            Learn More About DMARC Setup
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Upload;
