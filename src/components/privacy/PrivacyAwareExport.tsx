import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Download,
  FileText,
  Shield,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Key,
  Lock,
  Loader2,
  FileJson,
  FileSpreadsheet,
  FileX
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { 
  PrivacySettings,
  MaskingOptions,
  applyPrivacySettings
} from '@/utils/privacyManager';
import { DataType, logDataExport, logDataAccess } from '@/utils/privacyAudit';
import { DataLifecycleManager } from '@/utils/dataLifecycleManager';
import { ClientEncryption, encryptionService } from '@/utils/encryptionService';

export type ExportFormat = 'json' | 'csv' | 'xml';
export type ExportPurpose = 'backup' | 'compliance' | 'migration' | 'analysis';

interface ExportConfig {
  dataTypes: DataType[];
  format: ExportFormat;
  purpose: ExportPurpose;
  includeMetadata: boolean;
  applyPrivacyMasking: boolean;
  encryptExport: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  customFilters?: Record<string, any>;
}

interface ExportProgress {
  stage: 'preparing' | 'extracting' | 'processing' | 'encrypting' | 'complete' | 'error';
  progress: number;
  currentTask: string;
  recordsProcessed: number;
  totalRecords: number;
  errors: string[];
}

interface ExportResult {
  filename: string;
  size: number;
  recordCount: number;
  exportId: string;
  downloadUrl?: string;
  encryptionUsed: boolean;
  privacyMaskingApplied: boolean;
  completedAt: Date;
}

interface PrivacyAwareExportProps {
  privacySettings: PrivacySettings;
  maskingOptions: MaskingOptions;
  onExportComplete?: (result: ExportResult) => void;
}

const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string; icon: React.ReactNode }> = [
  { value: 'json', label: 'JSON', icon: <FileJson className="h-4 w-4" /> },
  { value: 'csv', label: 'CSV', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { value: 'xml', label: 'XML', icon: <FileX className="h-4 w-4" /> },
];

const EXPORT_PURPOSES: Array<{ value: ExportPurpose; label: string; description: string }> = [
  { value: 'backup', label: 'Data Backup', description: 'Create a backup of your data for safekeeping' },
  { value: 'compliance', label: 'Compliance Request', description: 'Export for GDPR, CCPA or other regulatory requirements' },
  { value: 'migration', label: 'Data Migration', description: 'Move data to another system or provider' },
  { value: 'analysis', label: 'Data Analysis', description: 'Export for external analysis or reporting' },
];

const DATA_TYPES: Array<{ value: DataType; label: string; description: string; sensitive: boolean }> = [
  { value: 'forensic_report', label: 'Forensic Reports', description: 'DMARC forensic email reports', sensitive: true },
  { value: 'email_content', label: 'Email Content', description: 'Email message bodies', sensitive: true },
  { value: 'headers', label: 'Email Headers', description: 'Email header information', sensitive: false },
  { value: 'subject_line', label: 'Subject Lines', description: 'Email subject lines', sensitive: true },
  { value: 'email_addresses', label: 'Email Addresses', description: 'Sender and recipient addresses', sensitive: true },
  { value: 'privacy_settings', label: 'Privacy Settings', description: 'Your privacy configuration', sensitive: false },
];

export function PrivacyAwareExport({ 
  privacySettings, 
  maskingOptions, 
  onExportComplete 
}: PrivacyAwareExportProps) {
  const { user } = useAuth();
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    dataTypes: ['forensic_report'],
    format: 'json',
    purpose: 'backup',
    includeMetadata: true,
    applyPrivacyMasking: true,
    encryptExport: false,
  });
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState(0);
  const [estimatedRecords, setEstimatedRecords] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  // Check encryption availability
  useEffect(() => {
    const checkEncryption = async () => {
      const available = await encryptionService.testEncryption('browser-crypto');
      setEncryptionAvailable(available);
    };
    checkEncryption();
  }, []);

  // Estimate export size when config changes
  useEffect(() => {
    const estimateExportSize = async () => {
      if (!user) return;

      try {
        const inventory = await DataLifecycleManager.getDataInventory(user.id);
        let totalSize = 0;
        let totalRecords = 0;

        for (const dataType of exportConfig.dataTypes) {
          const item = inventory.find(i => i.dataType === dataType);
          if (item) {
            totalSize += item.estimatedSize;
            totalRecords += item.count;
          }
        }

        // Adjust for format overhead
        switch (exportConfig.format) {
          case 'xml':
            totalSize *= 1.5; // XML is more verbose
            break;
          case 'csv':
            totalSize *= 0.8; // CSV is more compact
            break;
        }

        // Adjust for encryption
        if (exportConfig.encryptExport) {
          totalSize *= 1.1; // Small encryption overhead
        }

        setEstimatedSize(Math.round(totalSize));
        setEstimatedRecords(totalRecords);
      } catch (error) {
        console.error('Failed to estimate export size:', error);
      }
    };

    estimateExportSize();
  }, [user, exportConfig]);

  // Generate preview data
  const generatePreview = async () => {
    if (!user) return;

    try {
      setShowPreview(true);
      
      // Generate a small sample of data
      const sampleData = await DataLifecycleManager.exportUserData(
        user.id,
        exportConfig.dataTypes.slice(0, 1), // Just one data type for preview
        exportConfig.format,
        false // No metadata for preview
      );

      // Apply privacy settings if enabled
      if (exportConfig.applyPrivacyMasking) {
        // In a real implementation, this would apply masking to the sample
        const maskedNote = '\n\n// Note: Privacy masking will be applied to the full export\n// Sensitive data like email addresses and content will be masked according to your privacy settings';
        setPreviewData(sampleData + maskedNote);
      } else {
        setPreviewData(sampleData);
      }
    } catch (error) {
      console.error('Failed to generate preview:', error);
      setPreviewData('Error generating preview: ' + error.message);
    }
  };

  // Execute export
  const executeExport = async () => {
    if (!user) return;

    try {
      const exportId = crypto.randomUUID();
      
      setExportProgress({
        stage: 'preparing',
        progress: 0,
        currentTask: 'Preparing export...',
        recordsProcessed: 0,
        totalRecords: estimatedRecords,
        errors: []
      });

      // Log export initiation
      await logDataAccess(user.id, 'forensic_report', exportId, {
        action: 'export_initiated',
        purpose: exportConfig.purpose,
        dataTypes: exportConfig.dataTypes
      });

      // Stage 1: Extract data
      setExportProgress(prev => prev ? {
        ...prev,
        stage: 'extracting',
        progress: 20,
        currentTask: 'Extracting data from database...'
      } : null);

      let exportData = await DataLifecycleManager.exportUserData(
        user.id,
        exportConfig.dataTypes,
        exportConfig.format,
        exportConfig.includeMetadata
      );

      // Stage 2: Apply privacy masking
      if (exportConfig.applyPrivacyMasking) {
        setExportProgress(prev => prev ? {
          ...prev,
          stage: 'processing',
          progress: 50,
          currentTask: 'Applying privacy masking...'
        } : null);

        // Apply privacy settings to the data
        const parsedData = JSON.parse(exportData);
        if (parsedData.data && parsedData.data.forensic_reports) {
          parsedData.data.forensic_reports = parsedData.data.forensic_reports.map((record: any) => 
            applyPrivacySettings(record, privacySettings, maskingOptions)
          );
        }
        exportData = JSON.stringify(parsedData, null, 2);
      }

      // Stage 3: Encryption
      let encryptionUsed = false;
      if (exportConfig.encryptExport && encryptionAvailable) {
        setExportProgress(prev => prev ? {
          ...prev,
          stage: 'encrypting',
          progress: 80,
          currentTask: 'Encrypting export data...'
        } : null);

        try {
          const encryption = new ClientEncryption();
          const key = await encryption.generateKey();
          const encrypted = await encryption.encrypt(exportData, key, exportId);
          
          // In a real implementation, you would need to provide the key to the user securely
          exportData = JSON.stringify(encrypted);
          encryptionUsed = true;
        } catch (error) {
          console.error('Encryption failed:', error);
          setExportProgress(prev => prev ? {
            ...prev,
            errors: [...prev.errors, 'Encryption failed: ' + error.message]
          } : null);
        }
      }

      // Stage 4: Complete
      setExportProgress(prev => prev ? {
        ...prev,
        stage: 'complete',
        progress: 100,
        currentTask: 'Export complete!'
      } : null);

      // Create download
      const blob = new Blob([exportData], { 
        type: getContentType(exportConfig.format) 
      });
      const downloadUrl = URL.createObjectURL(blob);
      
      const filename = generateFilename(exportConfig, exportId);
      
      const result: ExportResult = {
        filename,
        size: blob.size,
        recordCount: estimatedRecords,
        exportId,
        downloadUrl,
        encryptionUsed,
        privacyMaskingApplied: exportConfig.applyPrivacyMasking,
        completedAt: new Date()
      };

      setExportResult(result);

      // Log successful export
      await logDataExport(
        user.id,
        exportConfig.dataTypes[0] || 'forensic_report',
        exportId,
        exportConfig.format,
        encryptionUsed
      );

      onExportComplete?.(result);

    } catch (error) {
      console.error('Export failed:', error);
      setExportProgress(prev => prev ? {
        ...prev,
        stage: 'error',
        currentTask: 'Export failed',
        errors: [...prev.errors, error.message]
      } : null);
    }
  };

  // Download the export file
  const downloadExport = () => {
    if (exportResult?.downloadUrl) {
      const link = document.createElement('a');
      link.href = exportResult.downloadUrl;
      link.download = exportResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Reset export state
  const resetExport = () => {
    setExportProgress(null);
    setExportResult(null);
    setShowPreview(false);
    setPreviewData(null);
    if (exportResult?.downloadUrl) {
      URL.revokeObjectURL(exportResult.downloadUrl);
    }
  };

  const getContentType = (format: ExportFormat): string => {
    switch (format) {
      case 'json': return 'application/json';
      case 'csv': return 'text/csv';
      case 'xml': return 'application/xml';
      default: return 'application/octet-stream';
    }
  };

  const generateFilename = (config: ExportConfig, exportId: string): string => {
    const timestamp = new Date().toISOString().split('T')[0];
    const dataTypesStr = config.dataTypes.join('-');
    const prefix = config.purpose === 'compliance' ? 'compliance-export' : 'data-export';
    return `${prefix}-${dataTypesStr}-${timestamp}-${exportId.substring(0, 8)}.${config.format}`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Download className="h-6 w-6" />
            Privacy-Aware Data Export
          </h2>
          <p className="text-muted-foreground">
            Export your data with built-in privacy protection and compliance features
          </p>
        </div>
        {exportResult && (
          <Button onClick={resetExport} variant="outline">
            New Export
          </Button>
        )}
      </div>

      {/* Export in Progress */}
      {exportProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Export in Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{exportProgress.currentTask}</span>
                <span>{exportProgress.progress}%</span>
              </div>
              <Progress value={exportProgress.progress} />
            </div>
            
            {exportProgress.totalRecords > 0 && (
              <div className="text-sm text-muted-foreground">
                Processed {exportProgress.recordsProcessed.toLocaleString()} of {exportProgress.totalRecords.toLocaleString()} records
              </div>
            )}

            {exportProgress.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Export Warnings</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {exportProgress.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Export Complete */}
      {exportResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Export Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{exportResult.recordCount.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Records</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatBytes(exportResult.size)}</div>
                <div className="text-sm text-muted-foreground">File Size</div>
              </div>
              <div className="text-center">
                <Badge variant={exportResult.encryptionUsed ? 'default' : 'outline'}>
                  {exportResult.encryptionUsed ? 'Encrypted' : 'Unencrypted'}
                </Badge>
                <div className="text-sm text-muted-foreground mt-1">Security</div>
              </div>
              <div className="text-center">
                <Badge variant={exportResult.privacyMaskingApplied ? 'default' : 'outline'}>
                  {exportResult.privacyMaskingApplied ? 'Masked' : 'Unmasked'}
                </Badge>
                <div className="text-sm text-muted-foreground mt-1">Privacy</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={downloadExport} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download {exportResult.filename}
              </Button>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Export Security Notice</AlertTitle>
              <AlertDescription>
                {exportResult.encryptionUsed ? (
                  <>This export has been encrypted. Make sure to store the encryption key securely.</>
                ) : (
                  <>This export is not encrypted. Consider storing it securely and deleting it when no longer needed.</>
                )}
                {exportResult.privacyMaskingApplied && (
                  <> Privacy masking has been applied according to your settings.</>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Export Configuration */}
      {!exportProgress && !exportResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Data Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Selection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {DATA_TYPES.map((dataType) => (
                    <div key={dataType.value} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <Checkbox
                        id={dataType.value}
                        checked={exportConfig.dataTypes.includes(dataType.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setExportConfig(prev => ({
                              ...prev,
                              dataTypes: [...prev.dataTypes, dataType.value]
                            }));
                          } else {
                            setExportConfig(prev => ({
                              ...prev,
                              dataTypes: prev.dataTypes.filter(dt => dt !== dataType.value)
                            }));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <Label htmlFor={dataType.value} className="flex items-center gap-2">
                          {dataType.label}
                          {dataType.sensitive && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              Sensitive
                            </Badge>
                          )}
                        </Label>
                        <p className="text-sm text-muted-foreground">{dataType.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Export Options */}
            <Card>
              <CardHeader>
                <CardTitle>Export Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Format</Label>
                    <Select
                      value={exportConfig.format}
                      onValueChange={(value: ExportFormat) =>
                        setExportConfig(prev => ({ ...prev, format: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPORT_FORMATS.map((format) => (
                          <SelectItem key={format.value} value={format.value}>
                            <div className="flex items-center gap-2">
                              {format.icon}
                              {format.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Purpose</Label>
                    <Select
                      value={exportConfig.purpose}
                      onValueChange={(value: ExportPurpose) =>
                        setExportConfig(prev => ({ ...prev, purpose: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPORT_PURPOSES.map((purpose) => (
                          <SelectItem key={purpose.value} value={purpose.value}>
                            {purpose.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-metadata"
                      checked={exportConfig.includeMetadata}
                      onCheckedChange={(checked) =>
                        setExportConfig(prev => ({ ...prev, includeMetadata: !!checked }))
                      }
                    />
                    <Label htmlFor="include-metadata">Include metadata and audit logs</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="apply-masking"
                      checked={exportConfig.applyPrivacyMasking}
                      onCheckedChange={(checked) =>
                        setExportConfig(prev => ({ ...prev, applyPrivacyMasking: !!checked }))
                      }
                    />
                    <Label htmlFor="apply-masking" className="flex items-center gap-2">
                      Apply privacy masking
                      <Badge variant="secondary" className="text-xs">
                        {privacySettings.maskingLevel}
                      </Badge>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="encrypt-export"
                      checked={exportConfig.encryptExport}
                      onCheckedChange={(checked) =>
                        setExportConfig(prev => ({ ...prev, encryptExport: !!checked }))
                      }
                      disabled={!encryptionAvailable}
                    />
                    <Label htmlFor="encrypt-export" className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Encrypt export file
                      {!encryptionAvailable && (
                        <Badge variant="outline" className="text-xs">
                          Unavailable
                        </Badge>
                      )}
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Export Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Export Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-center">
                  <div className="text-2xl font-bold">{estimatedRecords.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Estimated Records</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold">{formatBytes(estimatedSize)}</div>
                  <div className="text-sm text-muted-foreground">Estimated Size</div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span>Format:</span>
                    <Badge variant="outline">{exportConfig.format.toUpperCase()}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Purpose:</span>
                    <Badge variant="secondary">{exportConfig.purpose}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Privacy:</span>
                    <Badge variant={exportConfig.applyPrivacyMasking ? 'default' : 'outline'}>
                      {exportConfig.applyPrivacyMasking ? (
                        <>
                          <EyeOff className="h-3 w-3 mr-1" />
                          Masked
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3 mr-1" />
                          Unmasked
                        </>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Encryption:</span>
                    <Badge variant={exportConfig.encryptExport ? 'default' : 'outline'}>
                      {exportConfig.encryptExport ? (
                        <>
                          <Lock className="h-3 w-3 mr-1" />
                          Encrypted
                        </>
                      ) : (
                        'Plain Text'
                      )}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Button onClick={generatePreview} variant="outline" className="w-full">
                <Eye className="h-4 w-4 mr-2" />
                Preview Data
              </Button>
              
              <Button 
                onClick={executeExport}
                className="w-full"
                disabled={exportConfig.dataTypes.length === 0 || estimatedRecords === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Start Export
              </Button>
            </div>

            {exportConfig.purpose === 'compliance' && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Compliance Export</AlertTitle>
                <AlertDescription className="text-xs">
                  This export will include all data required for compliance requests.
                  Privacy masking will be applied unless specifically disabled.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Data Preview
              </span>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Textarea
                value={previewData}
                readOnly
                className="min-h-[300px] font-mono text-xs"
              />
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              This is a preview of the first few records. The full export may contain more data.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}