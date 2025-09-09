import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Trash2,
  AlertTriangle,
  Shield,
  CheckCircle,
  Mail,
  FileText,
  Clock
} from 'lucide-react';

interface DeletionConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailAddress: string;
  onConfirm: (confirmed: boolean, dontShowAgain: boolean) => void;
  loading?: boolean;
  provider?: string; // Add provider prop for customization
}

const DeletionConfirmationDialog: React.FC<DeletionConfirmationDialogProps> = ({
  open,
  onOpenChange,
  emailAddress,
  onConfirm,
  loading = false,
  provider = 'Gmail'
}) => {
  const [understood, setUnderstood] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleConfirm = () => {
    onConfirm(true, dontShowAgain);
    handleClose();
  };

  const handleCancel = () => {
    onConfirm(false, false);
    handleClose();
  };

  const handleClose = () => {
    setUnderstood(false);
    setDontShowAgain(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Trash2 className="w-5 h-5 text-red-600" />
            Enable Automatic Email Deletion
          </DialogTitle>
          <DialogDescription className="text-base">
            Configure automatic deletion for <strong>{emailAddress}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Warning Alert */}
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Important:</strong> This will permanently delete emails from your {provider} inbox after DMARC reports are successfully imported.
            </AlertDescription>
          </Alert>

          {/* How It Works */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              How Automatic Deletion Works
            </h3>
            
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <strong>Safe Email Detection:</strong> Only emails containing DMARC report attachments 
                  (XML, ZIP, or GZ files) will be considered for deletion.
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <FileText className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <strong>Successful Import Required:</strong> Emails are only deleted AFTER all their 
                  attachments are successfully processed and imported into your dashboard.
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <Shield className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <strong>Error Protection:</strong> If any attachment fails to process, the entire 
                  email is kept untouched to prevent data loss.
                </div>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Benefits</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Keeps your inbox clean and organized</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Prevents accumulation of processed reports</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Reduces {provider} storage usage</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Maintains complete audit trail</span>
              </div>
            </div>
          </div>

          {/* Safety Features */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              Safety Features
            </h4>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>• Complete audit trail of all deleted emails</li>
              <li>• Only DMARC report emails are eligible for deletion</li>
              <li>• Failed imports prevent email deletion</li>
              <li>• You can disable this feature at any time</li>
              <li>• Rate limiting prevents API quota issues</li>
            </ul>
          </div>

          {/* Time Sensitivity Notice */}
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <Clock className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Note:</strong> Once enabled, emails will be deleted immediately after successful 
              import. If you're unsure, you can start with this feature disabled and enable it later 
              when you're comfortable with the sync process.
            </div>
          </div>

          {/* Permission Notice */}
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              This feature requires additional {provider} permissions. You may need to re-authorize 
              your {provider} account to grant email modification permissions.
            </AlertDescription>
          </Alert>

          {/* Confirmation Checkboxes */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="understand-deletion"
                checked={understood}
                onCheckedChange={(checked) => setUnderstood(checked as boolean)}
              />
              <label
                htmlFor="understand-deletion"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I understand that emails will be permanently deleted from my {provider} inbox after 
                successful DMARC report import
              </label>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="dont-show-again"
                checked={dontShowAgain}
                onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
              />
              <label
                htmlFor="dont-show-again"
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground"
              >
                Don't show this confirmation dialog again (you can still disable deletion in settings)
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            Keep Emails
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!understood || loading}
            className="flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enabling...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Enable Deletion
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeletionConfirmationDialog;