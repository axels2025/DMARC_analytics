import { useState } from "react";
import { X, Download, FileText, Table, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'csv' | 'pdf' | 'xml') => Promise<void>;
  isIndividualReport?: boolean;
}

const ExportModal = ({ isOpen, onClose, onExport, isIndividualReport = false }: ExportModalProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf' | 'xml' | null>(null);

  if (!isOpen) return null;

  const handleExport = async (format: 'csv' | 'pdf' | 'xml') => {
    setIsExporting(true);
    setExportFormat(format);
    
    try {
      await onExport(format);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
      setExportFormat(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Export DMARC Report</h2>
            <button
              onClick={onClose}
              disabled={isExporting}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-gray-600 mb-6">
            Choose your preferred export format for the {isIndividualReport ? 'DMARC report' : 'comprehensive DMARC analytics report'}.
          </p>

          <div className="space-y-4">
            {isIndividualReport && (
              <Card 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isExporting && exportFormat === 'xml' ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => !isExporting && handleExport('xml')}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Download className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">XML Format</CardTitle>
                      <CardDescription>Original DMARC report format</CardDescription>
                    </div>
                    {isExporting && exportFormat === 'xml' && (
                      <Loader className="w-4 h-4 animate-spin ml-auto" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Exact original XML file as imported</li>
                    <li>• Can be re-uploaded to other tools</li>
                    <li>• Complete raw DMARC data</li>
                  </ul>
                </CardContent>
              </Card>
            )}
            
            <Card 
              className={`cursor-pointer transition-all hover:shadow-md ${
                isExporting && exportFormat === 'csv' ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => !isExporting && handleExport('csv')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Table className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">CSV Format</CardTitle>
                    <CardDescription>Best for spreadsheet analysis</CardDescription>
                  </div>
                  {isExporting && exportFormat === 'csv' && (
                    <Loader className="w-4 h-4 animate-spin ml-auto" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Import into Excel, Google Sheets, or other tools</li>
                  <li>• Detailed data analysis and pivot tables</li>
                  <li>• Raw data with full precision</li>
                </ul>
              </CardContent>
            </Card>

            <Card 
              className={`cursor-pointer transition-all hover:shadow-md ${
                isExporting && exportFormat === 'pdf' ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => !isExporting && handleExport('pdf')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <FileText className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">PDF Format</CardTitle>
                    <CardDescription>Professional report format</CardDescription>
                  </div>
                  {isExporting && exportFormat === 'pdf' && (
                    <Loader className="w-4 h-4 animate-spin ml-auto" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Ready for presentations and sharing</li>
                  <li>• Professional formatting and charts</li>
                  <li>• Easy to print and archive</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 flex justify-end">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={isExporting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;