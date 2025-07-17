
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

interface UploadStatus {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  progress: number;
  message: string;
  fileName?: string;
}

const Upload = () => {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    status: "idle",
    progress: 0,
    message: ""
  });

  // Simulate file processing
  const processFile = async (file: File) => {
    setUploadStatus({
      status: "uploading",
      progress: 10,
      message: "Uploading file...",
      fileName: file.name
    });

    // Simulate upload progress
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setUploadStatus(prev => ({
      ...prev,
      status: "processing",
      progress: 40,
      message: "Validating XML structure..."
    }));

    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setUploadStatus(prev => ({
      ...prev,
      progress: 70,
      message: "Parsing DMARC data..."
    }));

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setUploadStatus(prev => ({
      ...prev,
      progress: 90,
      message: "Storing report data..."
    }));

    await new Promise(resolve => setTimeout(resolve, 800));

    // Check if it's a valid XML file (basic check)
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setUploadStatus({
        status: "error",
        progress: 0,
        message: "Invalid file format. Please upload a valid DMARC XML report.",
        fileName: file.name
      });
      return;
    }

    setUploadStatus({
      status: "success",
      progress: 100,
      message: "DMARC report processed successfully!",
      fileName: file.name
    });

    toast({
      title: "Upload Successful",
      description: `${file.name} has been processed and added to your dashboard.`,
    });
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      processFile(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/xml': ['.xml'],
      'application/xml': ['.xml']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024 // 10MB
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
                <li>• Maximum file size: 10MB</li>
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
                  <Button onClick={resetUpload} variant="outline" size="sm">
                    Upload Another
                  </Button>
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
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Message */}
              {uploadStatus.status === "error" && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    {uploadStatus.message} Please ensure you're uploading a valid DMARC XML report.
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
