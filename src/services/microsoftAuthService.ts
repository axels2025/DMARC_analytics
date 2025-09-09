import { 
  PublicClientApplication, 
  InteractionRequiredAuthError,
  AuthenticationResult,
  SilentRequest,
  RedirectRequest,
  PopupRequest,
  Configuration,
  AccountInfo
} from '@azure/msal-browser';
import { supabase } from '@/integrations/supabase/client';
import { sessionEncryption } from '@/utils/sessionEncryption';

// Microsoft Graph API scopes needed for reading emails and user info
const MICROSOFT_SCOPES_READ_ONLY = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/User.Read'
];

const MICROSOFT_SCOPES_WITH_MODIFY = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/User.Read'
];

// Default scopes - can be upgraded to modify scopes if user enables deletion
const MICROSOFT_SCOPES = MICROSOFT_SCOPES_READ_ONLY;

export interface MicrosoftAuthCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: Date;
  email: string;
  account_id?: string;
}

export interface EmailConfig {
  id: string;
  provider: string;
  email_address: string;
  is_active: boolean;
  delete_after_import?: boolean;
  deletion_confirmation_shown?: boolean;
  sync_unread_only?: boolean;
  last_sync_at: string | null;
  sync_status: string;
  auto_sync_enabled: boolean;
  created_at: string;
}

class MicrosoftAuthService {
  private clientId: string | null;
  private msalInstance: PublicClientApplication | null = null;
  private isConfigured: boolean;

  constructor() {
    // Try environment variable first, then fallback to database lookup
    this.clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID || null;
    this.isConfigured = !!this.clientId;
    
    if (!this.isConfigured) {
      console.warn('Microsoft integration not configured: VITE_MICROSOFT_CLIENT_ID environment variable is missing');
      // Will attempt to load from database in initializeFromDatabase()
    }

    this.initializeMSAL();
  }

  // Initialize from database configuration (alternative to environment variables)
  async initializeFromDatabase(userId?: string): Promise<void> {
    if (this.isConfigured) return; // Already configured

    try {
      // Query for Microsoft client configuration in database
      const { data, error } = await supabase
        .from('app_configurations')
        .select('microsoft_client_id')
        .eq('key', 'oauth_settings')
        .single();

      if (error) {
        console.log('No Microsoft client ID found in database configuration');
        return;
      }

      if (data?.microsoft_client_id) {
        this.clientId = data.microsoft_client_id;
        this.isConfigured = true;
        this.initializeMSAL();
        console.log('Microsoft integration configured from database');
      }
    } catch (error) {
      console.warn('Failed to load Microsoft configuration from database:', error);
    }
  }

  // Initialize MSAL instance
  private initializeMSAL(): void {
    if (!this.clientId) return;

    const msalConfig: Configuration = {
      auth: {
        clientId: this.clientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    };

    this.msalInstance = new PublicClientApplication(msalConfig);
  }

  // Check if Microsoft integration is properly configured
  isMicrosoftConfigured(): boolean {
    return this.isConfigured;
  }

  // Get configuration status with helpful message
  getConfigurationStatus(): {
    configured: boolean;
    message: string;
    instructions?: string;
  } {
    if (this.isConfigured) {
      return {
        configured: true,
        message: 'Microsoft integration is configured and ready to use.'
      };
    }

    return {
      configured: false,
      message: 'Microsoft integration requires configuration.',
      instructions: 'Please add VITE_MICROSOFT_CLIENT_ID to your environment variables or configure it in the database.'
    };
  }

  // Start OAuth flow
  async startOAuthFlow(): Promise<MicrosoftAuthCredentials> {
    if (!this.isConfigured || !this.msalInstance) {
      throw new Error('Microsoft integration not configured. Please set VITE_MICROSOFT_CLIENT_ID environment variable.');
    }

    try {
      await this.msalInstance.initialize();

      const loginRequest: PopupRequest = {
        scopes: MICROSOFT_SCOPES,
        prompt: 'consent', // Force consent screen to get refresh token
      };

      const response: AuthenticationResult = await this.msalInstance.loginPopup(loginRequest);
      
      if (!response.account) {
        throw new Error('No account information received from Microsoft');
      }

      // Get user info to extract email
      const userInfo = await this.getUserInfo(response.accessToken);
      
      const credentials: MicrosoftAuthCredentials = {
        access_token: response.accessToken,
        email: userInfo.email,
        account_id: response.account.homeAccountId,
        expires_at: response.expiresOn || new Date(Date.now() + 3600 * 1000)
      };

      console.log('Microsoft OAuth response received:', {
        has_access_token: !!response.accessToken,
        expires_on: response.expiresOn,
        account_id: response.account.homeAccountId
      });

      return credentials;
    } catch (error) {
      console.error('Microsoft OAuth error:', error);
      throw error;
    }
  }

  // Get user info from Microsoft Graph API
  private async getUserInfo(accessToken: string): Promise<{ email: string }> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info from Microsoft Graph');
    }

    const userInfo = await response.json();
    return { email: userInfo.mail || userInfo.userPrincipalName };
  }

  // Save email configuration to database
  async saveEmailConfig(credentials: MicrosoftAuthCredentials, userId: string): Promise<string> {
    if (!sessionEncryption.isSupported()) {
      throw new Error('Session encryption not supported in this browser');
    }

    try {
      console.log('[saveEmailConfig] Saving Microsoft credentials with session-based encryption');
      
      // Encrypt tokens using session-derived keys
      const encryptedAccessToken = await sessionEncryption.encryptToken(credentials.access_token);
      const encryptedRefreshToken = credentials.refresh_token 
        ? await sessionEncryption.encryptToken(credentials.refresh_token)
        : null;

      const { data, error } = await supabase
        .from('user_email_configs')
        .upsert({
          user_id: userId,
          provider: 'microsoft',
          email_address: credentials.email,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          expires_at: credentials.expires_at?.toISOString(),
          sync_status: 'idle',
          is_active: true,
          auto_sync_enabled: true,
          delete_after_import: false,
          deletion_confirmation_shown: false,
          sync_unread_only: true,
          // Store account ID for MSAL token refresh
          provider_account_id: credentials.account_id
        }, {
          onConflict: 'user_id,provider,email_address'
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`Failed to save email config: ${error.message}`);
      }

      return data.id;
    } catch (error) {
      console.error('Error saving email config:', error);
      throw error;
    }
  }

  // Get user's email configurations
  async getUserEmailConfigs(userId: string): Promise<EmailConfig[]> {
    try {
      let selectColumns = 'id, provider, email_address, is_active, last_sync_at, sync_status, auto_sync_enabled, created_at, delete_after_import, deletion_confirmation_shown, sync_unread_only';
      
      const { data, error } = await supabase
        .from('user_email_configs')
        .select(selectColumns)
        .eq('user_id', userId)
        .eq('provider', 'microsoft')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch email configs: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching email configs:', error);
      throw error;
    }
  }

  // Refresh access token using MSAL silent token acquisition
  async refreshAccessToken(accountId: string): Promise<MicrosoftAuthCredentials> {
    if (!this.msalInstance) {
      throw new Error('Microsoft client not configured');
    }

    try {
      await this.msalInstance.initialize();
      
      const account = this.msalInstance.getAccountByHomeId(accountId);
      if (!account) {
        throw new Error('Account not found in MSAL cache');
      }

      const silentRequest: SilentRequest = {
        scopes: MICROSOFT_SCOPES,
        account: account,
      };

      const response: AuthenticationResult = await this.msalInstance.acquireTokenSilent(silentRequest);
      
      // Get user info for the refreshed token
      const userInfo = await this.getUserInfo(response.accessToken);
      
      return {
        access_token: response.accessToken,
        expires_at: response.expiresOn || new Date(Date.now() + 3600 * 1000),
        email: userInfo.email,
        account_id: response.account?.homeAccountId
      };
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Token refresh failed, user needs to re-authenticate
        throw new Error('Interactive authentication required. Please re-authenticate.');
      }
      throw error;
    }
  }

  // Update stored token with new credentials
  async updateStoredToken(configId: string, credentials: MicrosoftAuthCredentials): Promise<void> {
    try {
      const encryptedAccessToken = await sessionEncryption.encryptToken(credentials.access_token);
      const encryptedRefreshToken = credentials.refresh_token 
        ? await sessionEncryption.encryptToken(credentials.refresh_token)
        : null;

      const { error } = await supabase
        .from('user_email_configs')
        .update({
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          expires_at: credentials.expires_at?.toISOString(),
          provider_account_id: credentials.account_id
        })
        .eq('id', configId);

      if (error) {
        throw new Error(`Failed to update stored token: ${error.message}`);
      }
      
      console.log('[updateStoredToken] Microsoft token successfully updated');
    } catch (error) {
      console.error('[updateStoredToken] Error:', error);
      throw error;
    }
  }

  // Clean up corrupted credentials that can't be decrypted
  async cleanupCorruptedCredentials(configId: string, reason: string): Promise<void> {
    console.warn(`[cleanupCorruptedCredentials] Removing corrupted Microsoft config ${configId}: ${reason}`);
    
    try {
      const { error } = await supabase
        .from('user_email_configs')
        .delete()
        .eq('id', configId);
        
      if (error) {
        console.error('[cleanupCorruptedCredentials] Failed to delete corrupted config:', error);
      } else {
        console.log('[cleanupCorruptedCredentials] Successfully removed corrupted config');
      }
    } catch (error) {
      console.error('[cleanupCorruptedCredentials] Error during cleanup:', error);
    }
  }

  // Get decrypted credentials for a config with automatic token refresh and corruption handling
  async getCredentials(configId: string, userId: string): Promise<MicrosoftAuthCredentials | null> {
    try {
      console.log(`[getCredentials] Fetching Microsoft credentials for config: ${configId}`);
      
      const { data, error } = await supabase
        .from('user_email_configs')
        .select('email_address, access_token, refresh_token, expires_at, provider_account_id')
        .eq('id', configId)
        .eq('user_id', userId)
        .eq('provider', 'microsoft')
        .single();

      if (error || !data) {
        console.log('[getCredentials] No Microsoft credentials found');
        return null;
      }

      // Decrypt tokens using session-derived keys
      let access_token: string;
      let refresh_token: string | undefined;

      try {
        access_token = await sessionEncryption.decryptToken(data.access_token);
        console.log('[getCredentials] Access token decrypted successfully');
      } catch (decryptError) {
        console.error('[getCredentials] Failed to decrypt access token:', decryptError);
        
        if (decryptError instanceof Error) {
          if (decryptError.message === 'SESSION_EXPIRED') {
            throw new Error('Session expired, please re-authenticate');
          }
          if (decryptError.message === 'DECRYPTION_FAILED') {
            throw new Error('Token decryption failed, please re-authenticate');
          }
        }
        
        return null;
      }

      if (data.refresh_token) {
        try {
          refresh_token = await sessionEncryption.decryptToken(data.refresh_token);
        } catch (decryptError) {
          console.warn('[getCredentials] Failed to decrypt refresh token, continuing without it');
          refresh_token = undefined;
        }
      }

      const credentials: MicrosoftAuthCredentials = {
        email: data.email_address,
        access_token,
        expires_at: data.expires_at ? new Date(data.expires_at) : undefined,
        account_id: data.provider_account_id
      };

      if (refresh_token) {
        credentials.refresh_token = refresh_token;
      }

      // Check if token needs refresh (5 minute buffer)
      const now = new Date();
      const expiryBuffer = 5 * 60 * 1000;
      const isExpired = credentials.expires_at && 
        (credentials.expires_at.getTime() - now.getTime()) < expiryBuffer;

      if (isExpired && credentials.account_id) {
        console.log('[getCredentials] Microsoft token expired, refreshing...');
        return await this.refreshTokenForConfig(configId, userId);
      }

      return credentials;
    } catch (error) {
      console.error('[getCredentials] Error:', error);
      throw error;
    }
  }

  // Delete email configuration
  async deleteEmailConfig(configId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_email_configs')
      .delete()
      .eq('id', configId)
      .eq('user_id', userId)
      .eq('provider', 'microsoft');

    if (error) {
      throw new Error(`Failed to delete email config: ${error.message}`);
    }
  }

  // Toggle email configuration active status
  async toggleConfigStatus(configId: string, userId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('user_email_configs')
      .update({ is_active: isActive })
      .eq('id', configId)
      .eq('user_id', userId)
      .eq('provider', 'microsoft');

    if (error) {
      throw new Error(`Failed to update config status: ${error.message}`);
    }
  }

  // Update sync status
  async updateSyncStatus(
    configId: string, 
    status: 'idle' | 'syncing' | 'error' | 'completed',
    errorMessage?: string
  ): Promise<void> {
    const updates: any = { 
      sync_status: status,
      last_error_message: errorMessage || null
    };

    if (status === 'completed') {
      updates.last_sync_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('user_email_configs')
      .update(updates)
      .eq('id', configId);

    if (error) {
      throw new Error(`Failed to update sync status: ${error.message}`);
    }
  }

  // Refresh token for a specific config (used for retry logic)
  async refreshTokenForConfig(configId: string, userId: string): Promise<MicrosoftAuthCredentials | null> {
    try {
      const { data, error } = await supabase
        .from('user_email_configs')
        .select('provider_account_id')
        .eq('id', configId)
        .eq('user_id', userId)
        .eq('provider', 'microsoft')
        .single();

      if (error || !data?.provider_account_id) {
        console.log('No account ID found for Microsoft config:', configId);
        return null;
      }

      const refreshedCredentials = await this.refreshAccessToken(data.provider_account_id);
      await this.updateStoredToken(configId, refreshedCredentials);
      
      return refreshedCredentials;
    } catch (error) {
      console.error('Error refreshing Microsoft token for config:', error);
      return null;
    }
  }

  // Test connection to Microsoft Graph
  async testConnection(configId: string, userId: string): Promise<boolean> {
    try {
      const credentials = await this.getCredentials(configId, userId);
      if (!credentials) {
        return false;
      }

      // Try to make a simple API call to test the connection
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`
        }
      });

      if (response.status === 401) {
        console.log('401 error in test connection, attempting token refresh...');
        const refreshedCredentials = await this.refreshTokenForConfig(configId, userId);
        if (refreshedCredentials) {
          // Try again with refreshed token
          const retryResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
              'Authorization': `Bearer ${refreshedCredentials.access_token}`
            }
          });
          return retryResponse.ok;
        }
      }

      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  // Get encryption status for debugging
  getEncryptionStatus(): { supported: boolean; migrationNeeded: boolean } {
    const hasLegacyKeys = localStorage.getItem('dmarc_session_encryption_key') || 
                         localStorage.getItem('dmarc_encryption_key');
    
    return {
      supported: sessionEncryption.isSupported(),
      migrationNeeded: !!hasLegacyKeys
    };
  }

  // Force re-authentication by clearing credentials
  async forceReauthentication(userId: string): Promise<void> {
    try {
      console.log('[forceReauthentication] Forcing Microsoft re-authentication for user:', userId);
      
      // Delete all Microsoft email configs for this user
      const { error: deleteError } = await supabase
        .from('user_email_configs')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'microsoft');
      
      if (deleteError) {
        console.warn('[forceReauthentication] Failed to delete email configs:', deleteError);
      }
      
      // Clear MSAL cache
      if (this.msalInstance) {
        await this.msalInstance.initialize();
        await this.msalInstance.clearCache();
      }
      
      console.log('[forceReauthentication] Microsoft re-authentication forced successfully');
    } catch (error) {
      console.error('[forceReauthentication] Error during force re-authentication:', error);
      throw error;
    }
  }

  // Check if current token has email modification permissions
  async checkDeletionPermissions(credentials: MicrosoftAuthCredentials): Promise<boolean> {
    try {
      // Test if we can access the Graph API with ReadWrite permissions
      // by attempting to get mail folders (requires Mail.ReadWrite scope)
      const response = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`
        }
      });

      // If we get 403, it means we don't have sufficient permissions
      // If we get 401, the token is invalid
      // If we get 200, we have the necessary permissions
      return response.status === 200;
    } catch (error) {
      console.error('Error checking deletion permissions:', error);
      return false;
    }
  }

  // Start OAuth flow with specific scopes (for upgrading permissions)
  async startOAuthFlowWithScopes(requireModifyScope: boolean = false): Promise<MicrosoftAuthCredentials> {
    if (!this.isConfigured || !this.msalInstance) {
      throw new Error('Microsoft integration not configured. Please set VITE_MICROSOFT_CLIENT_ID environment variable.');
    }

    const scopes = requireModifyScope ? MICROSOFT_SCOPES_WITH_MODIFY : MICROSOFT_SCOPES_READ_ONLY;

    try {
      await this.msalInstance.initialize();

      const loginRequest: PopupRequest = {
        scopes: scopes,
        prompt: 'consent',
      };

      const response: AuthenticationResult = await this.msalInstance.loginPopup(loginRequest);
      
      if (!response.account) {
        throw new Error('No account information received from Microsoft');
      }

      console.log('Microsoft OAuth response received:', { 
        has_access_token: !!response.accessToken,
        scopes: response.scopes
      });

      // Get user info to get email
      const userInfo = await this.getUserInfo(response.accessToken);

      const credentials: MicrosoftAuthCredentials = {
        access_token: response.accessToken,
        email: userInfo.email,
        account_id: response.account.homeAccountId,
        expires_at: response.expiresOn || new Date(Date.now() + 3600 * 1000)
      };

      return credentials;
    } catch (error) {
      console.error('Error starting Microsoft OAuth flow:', error);
      throw error;
    }
  }

  // Upgrade existing configuration to include deletion permissions
  async upgradeToModifyPermissions(configId: string, userId: string): Promise<MicrosoftAuthCredentials> {
    try {
      console.log('[upgradeToModifyPermissions] Upgrading Microsoft permissions for config:', configId);
      
      // Start OAuth flow with modify scopes
      const credentials = await this.startOAuthFlowWithScopes(true);
      
      // Update the existing configuration with new credentials
      await this.updateStoredToken(configId, credentials);
      
      console.log('[upgradeToModifyPermissions] Microsoft permissions upgraded successfully');
      return credentials;
      
    } catch (error) {
      console.error('[upgradeToModifyPermissions] Failed to upgrade Microsoft permissions:', error);
      throw new Error(`Failed to upgrade Microsoft permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Update user's deletion preference and handle permission upgrade if needed
  async updateDeletionPreference(
    configId: string, 
    userId: string, 
    deleteAfterImport: boolean,
    confirmationShown: boolean = false
  ): Promise<{ success: boolean; requiresReauth?: boolean; message?: string }> {
    try {
      // If enabling deletion, check if we have the necessary permissions
      if (deleteAfterImport) {
        const credentials = await this.getCredentials(configId, userId);
        if (!credentials) {
          return {
            success: false,
            requiresReauth: true,
            message: 'No valid credentials found. Please reconnect your Microsoft account.'
          };
        }

        const hasPermissions = await this.checkDeletionPermissions(credentials);
        if (!hasPermissions) {
          return {
            success: false,
            requiresReauth: true,
            message: 'Additional Microsoft permissions required for email deletion. Please re-authorize your account.'
          };
        }
      }

      // Update the database
      try {
        const { error } = await supabase
          .from('user_email_configs')
          .update({
            delete_after_import: deleteAfterImport,
            deletion_confirmation_shown: confirmationShown
          })
          .eq('id', configId)
          .eq('user_id', userId)
          .eq('provider', 'microsoft');

        if (error) {
          throw error;
        }
      } catch (updateError) {
        // Handle missing columns
        if (updateError instanceof Error && 
            (updateError.message.includes('delete_after_import') || 
             updateError.message.includes('deletion_confirmation_shown'))) {
          throw new Error('This feature requires a database update. Please contact support to enable email deletion.');
        }
        throw updateError;
      }

      return {
        success: true,
        message: deleteAfterImport 
          ? 'Email deletion enabled successfully' 
          : 'Email deletion disabled successfully'
      };

    } catch (error) {
      console.error('[updateDeletionPreference] Error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // Update sync unread only preference
  async updateSyncUnreadOnly(configId: string, userId: string, syncUnreadOnly: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_email_configs')
        .update({ sync_unread_only: syncUnreadOnly })
        .eq('id', configId)
        .eq('user_id', userId)
        .eq('provider', 'microsoft');

      if (error) {
        throw new Error(`Failed to update unread-only preference: ${error.message}`);
      }
    } catch (error) {
      // Handle case where column doesn't exist yet
      if (error instanceof Error && error.message.includes('sync_unread_only')) {
        console.warn('sync_unread_only column does not exist yet. Migration needed.');
        throw new Error('This feature requires a database update. Please contact support.');
      }
      throw error;
    }
  }

  // Debug method to check and update user's sync settings
  async debugAndUpdateSyncSettings(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('user_email_configs')
        .select('id, email_address, sync_unread_only, delete_after_import, deletion_confirmation_shown')
        .eq('user_id', userId)
        .eq('provider', 'microsoft');

      if (error) {
        console.error('Error fetching Microsoft config for debug:', error);
        return;
      }

      console.log('[debugAndUpdateSyncSettings] Current Microsoft user configs:', data);

      // Update configs that don't have sync_unread_only set to true
      for (const config of data || []) {
        if (config.sync_unread_only === null || config.sync_unread_only === undefined) {
          console.log(`[debugAndUpdateSyncSettings] Updating Microsoft config ${config.id} to enable sync_unread_only`);
          
          const { error: updateError } = await supabase
            .from('user_email_configs')
            .update({
              sync_unread_only: true,
              delete_after_import: config.delete_after_import ?? false,
              deletion_confirmation_shown: config.deletion_confirmation_shown ?? false
            })
            .eq('id', config.id);

          if (updateError) {
            console.error('Error updating Microsoft config:', updateError);
          } else {
            console.log(`[debugAndUpdateSyncSettings] Successfully updated Microsoft config ${config.id}`);
          }
        }
      }
    } catch (error) {
      console.error('[debugAndUpdateSyncSettings] Error:', error);
    }
  }
}

export const microsoftAuthService = new MicrosoftAuthService();