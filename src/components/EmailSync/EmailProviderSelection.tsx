import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Mail,
  Settings,
  Shield,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader
} from 'lucide-react';
import { EmailProvider, unifiedEmailService } from '@/services/emailProviderInterface';
import { EmailConfig } from '@/hooks/useEmailSync';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

// Provider icons and branding
const ProviderIcon = ({ provider }: { provider: EmailProvider }) => {
  if (provider === EmailProvider.GMAIL) {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path fill="#EA4335" d="M24 12.27c0-.79-.07-1.54-.2-2.28H12.24v4.32h6.65c-.29 1.54-1.16 2.84-2.48 3.61v3.01h4.01c2.35-2.16 3.7-5.34 3.7-9.11z"/>
        <path fill="#34A853" d="M12.24 24c3.35 0 6.16-1.11 8.21-3.01l-4.01-3.11c-1.11.74-2.53 1.18-4.2 1.18-3.23 0-5.97-2.18-6.94-5.11H1.17v3.21C3.24 21.1 7.42 24 12.24 24z"/>
        <path fill="#FBBC05" d="M5.3 14.95A7.26 7.26 0 0 1 5.3 9.05V5.84H1.17A12.24 12.24 0 0 0 1.17 17.16z"/>
        <path fill="#EA4335" d="M12.24 4.75c1.82 0 3.45.62 4.73 1.85l3.55-3.55C18.4 1.19 15.59 0 12.24 0 7.42 0 3.24 2.9 1.17 7.84l4.13 3.21c.97-2.93 3.71-5.11 6.94-5.11z"/>
      </svg>
    );
  } else {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path fill="#0078D4" d="M24 12c0 6.627-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0s12 5.373 12 12z"/>
        <path fill="#FFFFFF" d="M8.5 7h7c.828 0 1.5.672 1.5 1.5v7c0 .828-.672 1.5-1.5 1.5h-7C7.672 17 7 16.328 7 15.5v-7C7 7.672 7.672 7 8.5 7zm6.5 2.5v5l-3-2.5 3-2.5z"/>
      </svg>
    );
  }
};

const ProviderCard = ({
  provider,
  selected,
  onSelect,
  configured,
  configStatus
}: {
  provider: EmailProvider;
  selected: boolean;
  onSelect: (provider: EmailProvider) => void;
  configured: boolean;
  configStatus?: { configured: boolean; message: string; instructions?: string };
}) => {
  const providerInfo = {
    [EmailProvider.GMAIL]: {
      name: 'Gmail',
      displayName: 'Google Gmail',
      description: 'Connect your Gmail account to sync DMARC reports from Google Workspace or personal Gmail.',
      features: [
        'Full Gmail API integration',
        'Automatic attachment processing',
        'Real-time synchronization',
        'Email deletion after import (optional)'
      ]
    },
    [EmailProvider.MICROSOFT]: {
      name: 'Outlook',
      displayName: 'Microsoft Outlook',
      description: 'Connect your Outlook/Office 365 account to sync DMARC reports from Microsoft services.',
      features: [
        'Microsoft Graph API integration',
        'Office 365 and Outlook.com support',
        'Enterprise-grade security',
        'Email cleanup after processing'
      ]
    }
  };

  const info = providerInfo[provider];

  return (
    <div 
      className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
        selected 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-200 hover:border-gray-300'
      } ${!configured ? 'opacity-60' : ''}`}
      onClick={() => configured && onSelect(provider)}
    >
      {!configured && (
        <div className="absolute inset-0 bg-white bg-opacity-50 rounded-lg flex items-center justify-center">
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
            Setup Required
          </Badge>
        </div>
      )}
      
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          <ProviderIcon provider={provider} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900">{info.displayName}</h3>
            {configured && (
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                <CheckCircle className="w-3 h-3 mr-1" />
                Ready
              </Badge>
            )}
          </div>
          
          <p className="text-sm text-gray-600 mb-3">
            {info.description}
          </p>
          
          <div className="space-y-1">
            {info.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
          
          {!configured && configStatus && (
            <Alert className="mt-3">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {configStatus.message}
                {configStatus.instructions && (
                  <div className="mt-1 font-mono text-xs bg-gray-100 p-1 rounded">
                    {configStatus.instructions}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
        
        <div className="flex-shrink-0">
          <div 
            className={`w-4 h-4 rounded-full border-2 ${
              selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
            } ${!configured ? 'opacity-50' : ''} flex items-center justify-center`}
          >
            {selected && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        </div>
      </div>
    </div>
  );
};

interface OAuthButtonProps {
  provider: EmailProvider;
  onSuccess: (config: EmailConfig) => void;
  disabled?: boolean;
  variant?: 'default' | 'outline';
}

const OAuthButton = ({ provider, onSuccess, disabled, variant = 'default' }: OAuthButtonProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { user } = useAuth();

  const providerLabels = {
    [EmailProvider.GMAIL]: 'Connect Gmail',
    [EmailProvider.MICROSOFT]: 'Connect Outlook'
  };

  const handleConnect = async () => {
    if (!user || isConnecting) return;

    try {
      setIsConnecting(true);

      // Start OAuth flow using unified service
      const credentials = await unifiedEmailService.startOAuthFlow(provider);
      
      // Save configuration
      const configId = await unifiedEmailService.saveEmailConfig(credentials, user.id);
      
      // Get updated configs
      const updatedConfigs = await unifiedEmailService.getUserEmailConfigs(user.id, provider);
      const newConfig = updatedConfigs.find(config => config.id === configId);
      
      if (newConfig) {
        onSuccess(newConfig);
      }

      toast({
        title: `${providerLabels[provider]} Successful`,
        description: `Connected ${credentials.email} successfully!`,
        variant: 'default'
      });

    } catch (error) {
      console.error(`${provider} OAuth error:`, error);
      toast({
        title: `Connection Failed`,
        description: error instanceof Error ? error.message : `Failed to connect ${provider}`,
        variant: 'destructive'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={disabled || isConnecting}
      variant={variant}
      className="w-full"
    >
      {isConnecting ? (
        <>
          <Loader className="w-4 h-4 mr-2 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <Mail className="w-4 h-4 mr-2" />
          {providerLabels[provider]}
        </>
      )}
    </Button>
  );
};

interface EmailProviderSelectionProps {
  onConfigAdded?: (config: EmailConfig) => void;
  onConfigUpdated?: (configs: EmailConfig[]) => void;
  existingConfigs?: EmailConfig[];
  mode?: 'select' | 'add';
}

const EmailProviderSelection: React.FC<EmailProviderSelectionProps> = ({
  onConfigAdded,
  onConfigUpdated,
  existingConfigs = [],
  mode = 'select'
}) => {
  const [selectedProvider, setSelectedProvider] = useState<EmailProvider>(EmailProvider.GMAIL);
  const [providerStatuses, setProviderStatuses] = useState<Record<EmailProvider, { configured: boolean; message: string; instructions?: string } | null>>({
    [EmailProvider.GMAIL]: null,
    [EmailProvider.MICROSOFT]: null
  });
  const [loading, setLoading] = useState(true);

  // Load provider configuration statuses
  useEffect(() => {
    const loadProviderStatuses = async () => {
      setLoading(true);
      
      const statuses: Record<EmailProvider, { configured: boolean; message: string; instructions?: string } | null> = {
        [EmailProvider.GMAIL]: null,
        [EmailProvider.MICROSOFT]: null
      };

      // Check each provider's configuration status
      for (const provider of Object.values(EmailProvider)) {
        try {
          const isConfigured = unifiedEmailService.isProviderConfigured(provider);
          const status = await unifiedEmailService.getProviderConfigurationStatus(provider);
          statuses[provider] = { ...status, configured: isConfigured };
        } catch (error) {
          console.error(`Error checking ${provider} status:`, error);
          statuses[provider] = {
            configured: false,
            message: `Failed to check ${provider} configuration`,
            instructions: 'Please check your environment configuration'
          };
        }
      }

      setProviderStatuses(statuses);
      setLoading(false);
    };

    loadProviderStatuses();
  }, []);

  // Auto-select first configured provider
  useEffect(() => {
    const configuredProviders = Object.entries(providerStatuses)
      .filter(([, status]) => status?.configured)
      .map(([provider]) => provider as EmailProvider);

    if (configuredProviders.length > 0 && !providerStatuses[selectedProvider]?.configured) {
      setSelectedProvider(configuredProviders[0]);
    }
  }, [providerStatuses, selectedProvider]);

  const handleConfigAdded = (newConfig: EmailConfig) => {
    onConfigAdded?.(newConfig);
    if (onConfigUpdated) {
      // Refresh configs
      unifiedEmailService.getUserEmailConfigs(newConfig.user_id)
        .then(configs => onConfigUpdated(configs))
        .catch(console.error);
    }
  };

  const configuredProviders = Object.entries(providerStatuses)
    .filter(([, status]) => status?.configured)
    .map(([provider]) => provider as EmailProvider);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader className="w-6 h-6 animate-spin mr-2" />
          <span>Checking email provider configurations...</span>
        </CardContent>
      </Card>
    );
  }

  if (configuredProviders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Email Provider Setup Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            No email providers are currently configured. At least one provider must be set up to sync DMARC reports.
          </p>
          
          <div className="grid gap-4">
            {Object.values(EmailProvider).map(provider => (
              <div key={provider} className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <ProviderIcon provider={provider} />
                  <h3 className="font-semibold text-amber-900">
                    {provider === EmailProvider.GMAIL ? 'Gmail Setup' : 'Microsoft Outlook Setup'}
                  </h3>
                </div>
                <p className="text-amber-800 text-sm mb-3">
                  {providerStatuses[provider]?.message}
                </p>
                {providerStatuses[provider]?.instructions && (
                  <div className="bg-amber-100 border border-amber-300 rounded p-2 text-sm text-amber-900 font-mono">
                    {providerStatuses[provider].instructions}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {mode === 'add' ? 'Add Email Provider' : 'Select Email Provider'}
          </CardTitle>
          <p className="text-sm text-gray-600">
            {mode === 'add' 
              ? 'Choose an additional email provider to sync DMARC reports from.'
              : 'Choose your email provider to sync DMARC reports automatically.'
            }
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.values(EmailProvider).map(provider => (
              <div 
                key={provider} 
                className="cursor-pointer"
                onClick={() => {
                  if (providerStatuses[provider]?.configured) {
                    setSelectedProvider(provider);
                  }
                }}
              >
                <ProviderCard
                  provider={provider}
                  selected={selectedProvider === provider}
                  onSelect={setSelectedProvider}
                  configured={providerStatuses[provider]?.configured || false}
                  configStatus={providerStatuses[provider]}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Connection Button */}
      {selectedProvider && providerStatuses[selectedProvider]?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Connect {selectedProvider === EmailProvider.GMAIL ? 'Gmail' : 'Outlook'}
            </CardTitle>
            <p className="text-sm text-gray-600">
              Click the button below to authenticate with your {selectedProvider === EmailProvider.GMAIL ? 'Gmail' : 'Outlook'} account.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <Shield className="w-4 h-4" />
              <span>Secure OAuth 2.0 authentication with encrypted token storage</span>
            </div>
            
            <OAuthButton
              provider={selectedProvider}
              onSuccess={handleConfigAdded}
              variant={mode === 'add' ? 'outline' : 'default'}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmailProviderSelection;