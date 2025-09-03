import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings as SettingsIcon, 
  Mail, 
  Shield, 
  User, 
  Bell,
  Database,
  Activity,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  ExternalLink
} from "lucide-react";
import { EmailConfigModal, SyncStatusIndicator } from "@/components/EmailSync";
import { useEmailSync } from "@/hooks/useEmailSync";
import { useAuth } from "@/hooks/useAuth";
import { gmailAuthService } from "@/services/gmailAuth";
import { Link } from "react-router-dom";

const Settings = () => {
  const { user } = useAuth();
  const { configs, statusCounts, isAnySyncing, loadConfigs } = useEmailSync();
  const [refreshing, setRefreshing] = useState(false);
  const [configurationStatus, setConfigurationStatus] = useState<{
    configured: boolean;
    message: string;
    instructions?: string;
  } | null>(null);

  // Check Gmail configuration on mount
  useEffect(() => {
    const status = gmailAuthService.getConfigurationStatus();
    setConfigurationStatus(status);
  }, []);

  const handleRefreshConfigs = async () => {
    setRefreshing(true);
    await loadConfigs();
    setRefreshing(false);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'syncing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <SettingsIcon className="w-8 h-8" />
            Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Manage your account settings and email integrations
          </p>
        </div>
        <Button 
          onClick={handleRefreshConfigs}
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Gmail Connection Status */}
      {configs.length === 0 && (
        <Card className={`border-2 border-dashed ${
          configurationStatus?.configured 
            ? 'border-blue-200 bg-blue-50/50' 
            : 'border-amber-200 bg-amber-50/50'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${
              configurationStatus?.configured ? 'text-blue-700' : 'text-amber-700'
            }`}>
              <Mail className="w-6 h-6" />
              {configurationStatus?.configured ? 'Connect Your Gmail Account' : 'Gmail Integration Setup Required'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <div className="mb-4">
                <Mail className={`w-16 h-16 mx-auto ${
                  configurationStatus?.configured ? 'text-blue-400' : 'text-amber-400'
                }`} />
              </div>
              
              {configurationStatus?.configured ? (
                <>
                  <h3 className="text-xl font-semibold text-blue-900 mb-2">
                    Automatically Sync DMARC Reports
                  </h3>
                  <p className="text-blue-700 mb-6 max-w-2xl mx-auto">
                    Connect your Gmail account to automatically import DMARC reports from your email. 
                    We'll search for and process DMARC report attachments, saving you time and ensuring you never miss important data.
                  </p>
                  <EmailConfigModal onConfigChange={loadConfigs}>
                    <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                      <Mail className="w-5 h-5 mr-2" />
                      Connect Gmail Account
                    </Button>
                  </EmailConfigModal>
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-blue-600">
                    <Shield className="w-4 h-4" />
                    <span>Secure OAuth 2.0 authentication • Read-only access</span>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-semibold text-amber-900 mb-2">
                    Configuration Required
                  </h3>
                  <p className="text-amber-700 mb-6 max-w-2xl mx-auto">
                    {configurationStatus?.message}
                  </p>
                  <div className="bg-amber-100 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                    <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Setup Instructions
                    </h4>
                    <div className="text-amber-800 text-sm space-y-2">
                      <p>1. Create a Google Cloud Console project</p>
                      <p>2. Enable the Gmail API</p>
                      <p>3. Create OAuth 2.0 credentials</p>
                      <p>4. Set the <code className="bg-amber-200 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> environment variable</p>
                    </div>
                  </div>
                  <Button size="lg" variant="outline" className="border-amber-600 text-amber-700 hover:bg-amber-100">
                    <ExternalLink className="w-5 h-5 mr-2" />
                    View Setup Documentation
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Integration Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Integration Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{statusCounts.total}</div>
              <div className="text-sm text-blue-800">Total Configs</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{statusCounts.active}</div>
              <div className="text-sm text-green-800">Active</div>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <div className="text-2xl font-bold text-amber-600">{statusCounts.syncing}</div>
              <div className="text-sm text-amber-800">Syncing</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{statusCounts.errors}</div>
              <div className="text-sm text-red-800">Errors</div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isAnySyncing && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Activity className="w-3 h-3 mr-1 animate-pulse" />
                  Sync in progress
                </Badge>
              )}
              {statusCounts.errors > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {statusCounts.errors} error{statusCounts.errors > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <EmailConfigModal onConfigChange={loadConfigs}>
              <Button>
                <Mail className="w-4 h-4 mr-2" />
                Manage Email Accounts
              </Button>
            </EmailConfigModal>
          </div>
        </CardContent>
      </Card>

      {/* Email Configurations */}
      {configs.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Email Configurations</h2>
          <div className="grid gap-4">
            {configs.map((config) => (
              <SyncStatusIndicator 
                key={config.id}
                config={config}
                onSyncComplete={loadConfigs}
                showDetails={true}
              />
            ))}
          </div>
        </div>
      )}

      {configs.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Mail className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Email Accounts Connected</h3>
            <p className="text-gray-600 mb-4">
              Connect your Gmail account to automatically sync DMARC reports from your email.
            </p>
            <EmailConfigModal onConfigChange={loadConfigs}>
              <Button>
                <Mail className="w-4 h-4 mr-2" />
                Connect Gmail Account
              </Button>
            </EmailConfigModal>
          </CardContent>
        </Card>
      )}

      {/* Account Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <p className="text-sm text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">User ID</label>
              <p className="text-sm text-gray-600 font-mono">{user?.id}</p>
            </div>
          </div>
          <Separator />
          <div className="flex justify-end">
            <Link to="/account">
              <Button variant="outline">
                <SettingsIcon className="w-4 h-4 mr-2" />
                Account Settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Encryption Support:</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Available
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Email Sync:</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Mail className="w-3 h-3 mr-1" />
                  Gmail API
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Authentication:</span>
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  <Shield className="w-3 h-3 mr-1" />
                  OAuth 2.0
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-gray-700 font-medium">Security Note</p>
                  <p className="text-gray-600 text-xs">
                    All OAuth tokens are encrypted using AES-256 encryption before storage. 
                    We only request read-only access to your Gmail account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/dashboard" className="block">
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer">
                <Activity className="w-8 h-8 text-gray-400 mb-2" />
                <h3 className="font-medium text-gray-900">View Dashboard</h3>
                <p className="text-sm text-gray-600">Go to the main DMARC analytics dashboard</p>
              </div>
            </Link>
            
            <Link to="/upload" className="block">
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors cursor-pointer">
                <Database className="w-8 h-8 text-gray-400 mb-2" />
                <h3 className="font-medium text-gray-900">Upload Report</h3>
                <p className="text-sm text-gray-600">Manually upload a DMARC XML report</p>
              </div>
            </Link>
            
            <EmailConfigModal onConfigChange={loadConfigs}>
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors cursor-pointer">
                <Mail className="w-8 h-8 text-gray-400 mb-2" />
                <h3 className="font-medium text-gray-900">Email Integration</h3>
                <p className="text-sm text-gray-600">Manage Gmail sync configuration</p>
              </div>
            </EmailConfigModal>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;