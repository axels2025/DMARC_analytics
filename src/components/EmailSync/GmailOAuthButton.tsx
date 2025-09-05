import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Loader, CheckCircle, AlertCircle, Wifi, Settings } from 'lucide-react';
import { gmailAuthService, EmailConfig } from '@/services/gmailAuth';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

interface GmailOAuthButtonProps {
  onConfigAdded?: (config: EmailConfig) => void;
  onConfigUpdated?: (configs: EmailConfig[]) => void;
  existingConfigs?: EmailConfig[];
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  showStatus?: boolean;
  mode?: 'connect' | 'add'; // New prop to determine if we're adding another account
}

export function GmailOAuthButton({
  onConfigAdded,
  onConfigUpdated,
  existingConfigs = [],
  disabled = false,
  variant = 'default',
  size = 'default',
  showStatus = true,
  mode = 'connect'
}: GmailOAuthButtonProps) {
  const { user } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
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
  
  // Check if Gmail is already connected - for 'connect' mode, find any active Gmail
  // For 'add' mode, we're always in "add new" state
  const gmailConfigs = existingConfigs.filter(config => 
    config.provider === 'gmail' && config.is_active
  );
  const isConnected = mode === 'connect' ? gmailConfigs.length > 0 : false;
  const primaryGmailConfig = gmailConfigs[0]; // Use first active config for display

  const handleConnect = async () => {
    // Check if Gmail integration is configured
    if (!configurationStatus?.configured) {
      toast({
        title: 'Gmail Integration Not Configured',
        description: configurationStatus?.instructions || 'Gmail integration requires setup.',
        variant: 'destructive'
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to connect your Gmail account.',
        variant: 'destructive'
      });
      return;
    }

    if (isConnecting) return;

    try {
      setIsConnecting(true);

      // Check if Google API is loaded
      if (typeof window === 'undefined' || !window.google?.accounts) {
        // Dynamically load Google API
        await loadGoogleAPI();
      }

      // Start OAuth flow
      const credentials = await gmailAuthService.startOAuthFlow();
      
      // Save configuration
      const configId = await gmailAuthService.saveEmailConfig(credentials, user.id);
      
      // Get updated configs
      const updatedConfigs = await gmailAuthService.getUserEmailConfigs(user.id);
      const newConfig = updatedConfigs.find(config => config.id === configId);
      
      if (newConfig) {
        onConfigAdded?.(newConfig);
        onConfigUpdated?.(updatedConfigs);
      }

      const toastTitle = mode === 'add' ? 'Gmail Account Added' : 'Gmail Connected Successfully';
      const toastDescription = mode === 'add' 
        ? `Added ${credentials.email} to your connected accounts.`
        : `Connected ${credentials.email} for automatic DMARC report syncing.`;

      toast({
        title: toastTitle,
        description: toastDescription,
        variant: 'default'
      });

    } catch (error) {
      console.error('Gmail OAuth error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      toast({
        title: 'Gmail Connection Failed',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user || !primaryGmailConfig) return;

    const confirmMessage = gmailConfigs.length > 1 
      ? `Are you sure you want to disconnect ${primaryGmailConfig.email_address}? You have ${gmailConfigs.length} Gmail accounts connected.`
      : `Are you sure you want to disconnect ${primaryGmailConfig.email_address}?`;

    if (!confirm(confirmMessage)) return;

    try {
      await gmailAuthService.deleteEmailConfig(primaryGmailConfig.id, user.id);
      
      // Get updated configs
      const updatedConfigs = await gmailAuthService.getUserEmailConfigs(user.id);
      onConfigUpdated?.(updatedConfigs);

      toast({
        title: 'Gmail Disconnected',
        description: `${primaryGmailConfig.email_address} has been disconnected.`,
        variant: 'default'
      });

    } catch (error) {
      toast({
        title: 'Disconnection Failed',
        description: error instanceof Error ? error.message : 'Failed to disconnect Gmail',
        variant: 'destructive'
      });
    }
  };

  const getButtonContent = () => {
    if (isConnecting) {
      return (
        <>
          <Loader className="w-4 h-4 mr-2 animate-spin" />
          Connecting...
        </>
      );
    }

    if (!configurationStatus?.configured) {
      return (
        <>
          <Settings className="w-4 h-4 mr-2 text-amber-600" />
          Setup Required
        </>
      );
    }

    if (isConnected && mode === 'connect') {
      const accountCount = gmailConfigs.length;
      const displayText = accountCount === 1 
        ? 'Connected to Gmail' 
        : `${accountCount} Gmail Accounts`;
      
      return (
        <>
          <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
          {displayText}
        </>
      );
    }

    const buttonText = mode === 'add' ? 'Add Another Gmail' : 'Connect Gmail';
    return (
      <>
        <Mail className="w-4 h-4 mr-2" />
        {buttonText}
      </>
    );
  };

  const getStatusBadge = () => {
    if (!showStatus || !primaryGmailConfig || mode === 'add') return null;

    const getStatusColor = () => {
      switch (primaryGmailConfig.sync_status) {
        case 'syncing':
          return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'completed':
          return 'bg-green-100 text-green-800 border-green-200';
        case 'error':
          return 'bg-red-100 text-red-800 border-red-200';
        default:
          return 'bg-gray-100 text-gray-800 border-gray-200';
      }
    };

    const getStatusIcon = () => {
      switch (primaryGmailConfig.sync_status) {
        case 'syncing':
          return <Loader className="w-3 h-3 animate-spin" />;
        case 'completed':
          return <CheckCircle className="w-3 h-3" />;
        case 'error':
          return <AlertCircle className="w-3 h-3" />;
        default:
          return <Wifi className="w-3 h-3" />;
      }
    };

    // Show summary status for multiple accounts
    const statusText = gmailConfigs.length > 1 
      ? `${gmailConfigs.filter(c => c.sync_status === 'completed').length}/${gmailConfigs.length} Active`
      : primaryGmailConfig.sync_status;

    return (
      <Badge variant="outline" className={`ml-2 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="ml-1 capitalize">{statusText}</span>
      </Badge>
    );
  };

  return (
    <div className="flex items-center">
      <Button
        onClick={isConnected ? handleDisconnect : handleConnect}
        disabled={disabled || isConnecting}
        variant={isConnected ? 'outline' : (!configurationStatus?.configured ? 'outline' : variant)}
        size={size}
        className={
          isConnected 
            ? 'border-green-200 hover:bg-green-50' 
            : !configurationStatus?.configured 
            ? 'border-amber-200 hover:bg-amber-50' 
            : ''
        }
      >
        {getButtonContent()}
      </Button>
      {getStatusBadge()}
    </div>
  );
}

// Load Google API dynamically
async function loadGoogleAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.google?.accounts) {
      resolve();
      return;
    }

    // Check if script is already added
    if (document.querySelector('script[src*="apis.google.com"]')) {
      // Script is loading, wait for it
      const checkLoaded = () => {
        if (window.google?.accounts) {
          resolve();
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      checkLoaded();
      return;
    }

    // Load the Google API script
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      // Load the accounts library
      const accountsScript = document.createElement('script');
      accountsScript.src = 'https://accounts.google.com/gsi/client';
      accountsScript.onload = () => resolve();
      accountsScript.onerror = () => reject(new Error('Failed to load Google Accounts API'));
      document.head.appendChild(accountsScript);
    };
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.head.appendChild(script);
  });
}