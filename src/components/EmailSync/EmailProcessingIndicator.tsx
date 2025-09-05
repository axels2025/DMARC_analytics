import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Mail, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Archive,
  Loader
} from 'lucide-react';

interface EmailProcessingItem {
  id: string;
  subject: string;
  attachmentCount: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  processed?: number;
  total?: number;
  error?: string;
}

interface EmailProcessingIndicatorProps {
  emails: EmailProcessingItem[];
  currentEmailIndex: number;
  onClose?: () => void;
}

export function EmailProcessingIndicator({
  emails,
  currentEmailIndex,
  onClose
}: EmailProcessingIndicatorProps) {
  const currentEmail = emails[currentEmailIndex];
  const completedCount = emails.filter(e => e.status === 'completed').length;
  const errorCount = emails.filter(e => e.status === 'error').length;
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader className="w-4 h-4 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Mail className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'bg-blue-50 border-blue-200';
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="p-6 space-y-4">
        {/* Overall Progress Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Processing Emails</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50">
              {completedCount}/{emails.length} Complete
            </Badge>
            {errorCount > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700">
                {errorCount} Errors
              </Badge>
            )}
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Overall Progress</span>
            <span>{Math.round((completedCount / emails.length) * 100)}%</span>
          </div>
          <Progress 
            value={(completedCount / emails.length) * 100} 
            className="h-2"
          />
        </div>

        {/* Current Email Progress */}
        {currentEmail && (
          <div className={`p-4 rounded-lg border ${getStatusColor(currentEmail.status)}`}>
            <div className="flex items-center gap-3 mb-3">
              {getStatusIcon(currentEmail.status)}
              <div className="flex-1">
                <p className="font-medium text-sm">
                  {currentEmail.subject || `Email ${currentEmailIndex + 1}`}
                </p>
                <p className="text-xs text-gray-600">
                  {currentEmail.attachmentCount} attachment{currentEmail.attachmentCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="text-xs text-gray-500">
                {currentEmailIndex + 1} of {emails.length}
              </div>
            </div>
            
            {/* Individual Email Progress */}
            {currentEmail.status === 'processing' && currentEmail.total && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Attachment Progress</span>
                  <span>{currentEmail.processed}/{currentEmail.total}</span>
                </div>
                <Progress 
                  value={((currentEmail.processed || 0) / currentEmail.total) * 100} 
                  className="h-1"
                />
              </div>
            )}

            {/* Error Display */}
            {currentEmail.status === 'error' && currentEmail.error && (
              <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-800">
                {currentEmail.error}
              </div>
            )}
          </div>
        )}

        {/* Email List */}
        <div className="max-h-64 overflow-y-auto space-y-2">
          {emails.map((email, index) => (
            <div
              key={email.id}
              className={`flex items-center gap-3 p-3 rounded border ${
                index === currentEmailIndex 
                  ? 'border-blue-300 bg-blue-50' 
                  : getStatusColor(email.status)
              }`}
            >
              {getStatusIcon(email.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {email.subject || `Email ${index + 1}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Archive className="w-3 h-3" />
                  <span>{email.attachmentCount} attachment{email.attachmentCount === 1 ? '' : 's'}</span>
                  {email.processed !== undefined && email.total && (
                    <>
                      <span>•</span>
                      <span>{email.processed}/{email.total} processed</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-400">
                #{index + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="flex justify-between items-center pt-4 border-t text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              {completedCount} Completed
            </span>
            <span className="flex items-center gap-1">
              <Loader className="w-4 h-4 text-blue-600" />
              {emails.filter(e => e.status === 'processing').length} Processing
            </span>
            {errorCount > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="w-4 h-4 text-red-600" />
                {errorCount} Errors
              </span>
            )}
          </div>
          {onClose && completedCount === emails.length && (
            <button
              onClick={onClose}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Close
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}