import { GoogleAuth } from 'google-auth-library';
import { supabase } from '@/integrations/supabase/client';
import { 
  encryptToken, 
  decryptToken, 
  isEncryptionSupported, 
  clearEncryptionKey,
  getEncryptionKeyStatus 
} from '@/utils/encryption';

// Gmail API scopes needed for reading emails and optional email deletion
const GMAIL_SCOPES_READ_ONLY = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

const GMAIL_SCOPES_WITH_MODIFY = [
  'https://www.googleapis.com/auth/gmail.modify', // Allows reading and modifying (including deleting) emails
  'https://www.googleapis.com/auth/userinfo.email'
];

// Default scopes - can be upgraded to modify scopes if user enables deletion
const GMAIL_SCOPES = GMAIL_SCOPES_READ_ONLY;

export interface GmailAuthCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: Date;
  email: string;
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

class GmailAuthService {
  private clientId: string | null;
  private auth: GoogleAuth | null = null;
  private isConfigured: boolean;

  constructor() {
    this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || null;
    this.isConfigured = !!this.clientId;
    
    if (!this.isConfigured) {
      console.warn('Gmail integration not configured: VITE_GOOGLE_CLIENT_ID environment variable is missing');
    }
  }

  // Check if Gmail integration is properly configured
  isGmailConfigured(): boolean {
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
        message: 'Gmail integration is configured and ready to use.'
      };
    }

    return {
      configured: false,
      message: 'Gmail integration requires configuration.',
      instructions: 'Please add VITE_GOOGLE_CLIENT_ID to your environment variables. See GMAIL_OAUTH_SETUP.md for setup instructions.'
    };
  }

  // Initialize Google Auth
  private initGoogleAuth() {
    if (!this.isConfigured) {
      throw new Error('Gmail integration not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable.');
    }

    if (typeof window === 'undefined' || !window.google?.accounts) {
      throw new Error('Google API not loaded. Please ensure the Google API script is loaded.');
    }
    
    return window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId!,
      scope: GMAIL_SCOPES.join(' '),
      callback: '', // Will be set dynamically
      // Request offline access to get refresh tokens
      access_type: 'offline',
      prompt: 'consent', // Force consent screen to get refresh token
    });
  }

  // Start OAuth flow
  async startOAuthFlow(): Promise<GmailAuthCredentials> {
    if (!this.isConfigured) {
      throw new Error('Gmail integration not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable.');
    }

    return new Promise((resolve, reject) => {
      try {
        const tokenClient = this.initGoogleAuth();
        
        tokenClient.callback = async (response: any) => {
          if (response.error) {
            reject(new Error(`OAuth error: ${response.error}`));
            return;
          }

          try {
            // Get user info to extract email
            const userInfo = await this.getUserInfo(response.access_token);
            
            const credentials: GmailAuthCredentials = {
              access_token: response.access_token,
              refresh_token: response.refresh_token, // This should now be included
              email: userInfo.email,
              expires_at: new Date(Date.now() + (response.expires_in * 1000))
            };

            console.log('OAuth response received:', {
              has_access_token: !!response.access_token,
              has_refresh_token: !!response.refresh_token,
              expires_in: response.expires_in
            });

            resolve(credentials);
          } catch (error) {
            reject(error);
          }
        };

        tokenClient.requestAccessToken();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get user info from Google API
  private async getUserInfo(accessToken: string): Promise<{ email: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info from Google');
    }

    const userInfo = await response.json();
    return { email: userInfo.email };
  }

  // Save email configuration to database
  async saveEmailConfig(credentials: GmailAuthCredentials, userId: string): Promise<string> {
    if (!isEncryptionSupported()) {
      throw new Error('Encryption not supported in this browser');
    }

    try {
      console.log('[saveEmailConfig] Starting to save Gmail credentials for user:', userId);
      
      // Ensure encryption key is stored in database for this user
      // The encryptToken function will handle this automatically, but we log it for verification
      console.log('[saveEmailConfig] Encryption system will ensure database key storage during token encryption');
      
      // Encrypt the access token before storing
      const encryptedAccessToken = await encryptToken(credentials.access_token);
      const encryptedRefreshToken = credentials.refresh_token 
        ? await encryptToken(credentials.refresh_token) 
        : null;

      const { data, error } = await supabase
        .from('user_email_configs')
        .upsert({
          user_id: userId,
          provider: 'gmail',
          email_address: credentials.email,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          expires_at: credentials.expires_at?.toISOString(),
          sync_status: 'idle',
          is_active: true,
          auto_sync_enabled: true,
          delete_after_import: false,
          deletion_confirmation_shown: false,
          sync_unread_only: true // Default to unread-only as recommended
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
      // Try to select new columns, fall back to old columns if they don't exist
      let selectColumns = 'id, provider, email_address, is_active, last_sync_at, sync_status, auto_sync_enabled, created_at, delete_after_import, deletion_confirmation_shown, sync_unread_only';
      
      const { data, error } = await supabase
        .from('user_email_configs')
        .select(selectColumns)
        .eq('user_id', userId)
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

  // Refresh access token using refresh token
  async refreshAccessToken(refreshToken: string): Promise<GmailAuthCredentials> {
    if (!this.clientId) {
      throw new Error('Gmail client ID not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Token refresh failed:', response.status, errorData);
      throw new Error(`Failed to refresh access token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Get user info for the refreshed token
    const userInfo = await this.getUserInfo(data.access_token);
    
    return {
      access_token: data.access_token,
      refresh_token: refreshToken, // Keep the original refresh token
      expires_at: new Date(Date.now() + (data.expires_in * 1000)),
      email: userInfo.email
    };
  }

  // Update stored token with new credentials
  async updateStoredToken(configId: string, credentials: GmailAuthCredentials): Promise<void> {
    if (!isEncryptionSupported()) {
      throw new Error('Encryption not supported in this browser');
    }

    try {
      const encryptedAccessToken = await encryptToken(credentials.access_token);
      const encryptedRefreshToken = credentials.refresh_token 
        ? await encryptToken(credentials.refresh_token) 
        : null;

      const { error } = await supabase
        .from('user_email_configs')
        .update({
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          expires_at: credentials.expires_at?.toISOString()
        })
        .eq('id', configId);

      if (error) {
        throw new Error(`Failed to update stored token: ${error.message}`);
      }
      
      console.log('Token successfully refreshed and updated in database');
    } catch (error) {
      console.error('Error updating stored token:', error);
      throw error;
    }
  }

  // Clean up corrupted credentials that can't be decrypted
  async cleanupCorruptedCredentials(configId: string, reason: string): Promise<void> {
    console.warn(`[cleanupCorruptedCredentials] Removing corrupted config ${configId}: ${reason}`);
    
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
  async getCredentials(configId: string, userId: string): Promise<GmailAuthCredentials | null> {
    try {
      console.log(`[getCredentials] Fetching credentials for config: ${configId}, user: ${userId}`);
      
      const { data, error } = await supabase
        .from('user_email_configs')
        .select('email_address, access_token, refresh_token, expires_at')
        .eq('id', configId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.log('[getCredentials] No credentials found for config:', configId);
        return null;
      }

      console.log(`[getCredentials] Found credentials for ${data.email_address}`);

      // Try to decrypt tokens with comprehensive error handling
      let access_token: string;
      let refresh_token: string | undefined;

      try {
        console.log('[getCredentials] Attempting to decrypt access token...');
        access_token = await decryptToken(data.access_token);
        console.log('[getCredentials] Access token decrypted successfully');
      } catch (decryptError) {
        console.error('[getCredentials] Failed to decrypt access token:', decryptError);
        
        // If decryption fails, the tokens are corrupted and unusable
        await this.cleanupCorruptedCredentials(
          configId, 
          `Access token decryption failed: ${decryptError instanceof Error ? decryptError.message : 'Unknown error'}`
        );
        
        return null; // This will trigger re-authentication
      }

      if (data.refresh_token) {
        try {
          console.log('[getCredentials] Attempting to decrypt refresh token...');
          refresh_token = await decryptToken(data.refresh_token);
          console.log('[getCredentials] Refresh token decrypted successfully');
        } catch (decryptError) {
          console.error('[getCredentials] Failed to decrypt refresh token:', decryptError);
          
          // If refresh token fails but access token works, we can continue with limited functionality
          console.warn('[getCredentials] Continuing without refresh token (will need re-auth when access token expires)');
          refresh_token = undefined;
        }
      }

      const credentials: GmailAuthCredentials = {
        email: data.email_address,
        access_token,
        expires_at: data.expires_at ? new Date(data.expires_at) : undefined
      };

      if (refresh_token) {
        credentials.refresh_token = refresh_token;
      }

      // Check if token is expired or will expire soon (5 minutes buffer)
      const now = new Date();
      const expiryBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
      const isExpired = credentials.expires_at && (credentials.expires_at.getTime() - now.getTime()) < expiryBuffer;

      if (isExpired && credentials.refresh_token) {
        console.log('Token expired or expiring soon, refreshing...', {
          expires_at: credentials.expires_at,
          now: now,
          time_until_expiry: credentials.expires_at ? credentials.expires_at.getTime() - now.getTime() : 'no expiry set'
        });
        
        try {
          const refreshedCredentials = await this.refreshAccessToken(credentials.refresh_token);
          await this.updateStoredToken(configId, refreshedCredentials);
          return refreshedCredentials;
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError);
          // Return null to indicate authentication failure
          return null;
        }
      } else if (isExpired && !credentials.refresh_token) {
        console.warn('Token expired but no refresh token available - user needs to re-authenticate');
        return null;
      }

      return credentials;
    } catch (error) {
      console.error('Error getting credentials:', error);
      return null;
    }
  }

  // Delete email configuration
  async deleteEmailConfig(configId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_email_configs')
      .delete()
      .eq('id', configId)
      .eq('user_id', userId);

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
      .eq('user_id', userId);

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
  async refreshTokenForConfig(configId: string, userId: string): Promise<GmailAuthCredentials | null> {
    try {
      const { data, error } = await supabase
        .from('user_email_configs')
        .select('refresh_token')
        .eq('id', configId)
        .eq('user_id', userId)
        .single();

      if (error || !data?.refresh_token) {
        console.log('No refresh token found for config:', configId);
        return null;
      }

      const refreshToken = await decryptToken(data.refresh_token);
      const refreshedCredentials = await this.refreshAccessToken(refreshToken);
      await this.updateStoredToken(configId, refreshedCredentials);
      
      return refreshedCredentials;
    } catch (error) {
      console.error('Error refreshing token for config:', error);
      return null;
    }
  }

  // Test connection to Gmail
  async testConnection(configId: string, userId: string): Promise<boolean> {
    try {
      const credentials = await this.getCredentials(configId, userId);
      if (!credentials) {
        return false;
      }

      // Try to make a simple API call to test the connection
      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`
        }
      });

      if (response.status === 401) {
        console.log('401 error in test connection, attempting token refresh...');
        const refreshedCredentials = await this.refreshTokenForConfig(configId, userId);
        if (refreshedCredentials) {
          // Try again with refreshed token
          const retryResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
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

  // Clear all encryption keys (useful for troubleshooting)
  async clearAllEncryptionKeys(): Promise<void> {
    console.log('[GmailAuth] Clearing all encryption keys - this will require users to re-authenticate');
    await clearEncryptionKey();
  }

  // Get encryption key status for debugging
  async getEncryptionStatus(): Promise<{
    hasSessionKey: boolean;
    hasLegacyKey: boolean;
    hasDatabaseKeys: boolean;
    sessionKeyPreview: string;
    databaseKeyCount: number;
    userId: string | null;
  }> {
    return await getEncryptionKeyStatus();
  }

  // Force re-authentication by clearing credentials and encryption keys
  async forceReauthentication(userId: string): Promise<void> {
    try {
      console.log('[forceReauthentication] Forcing re-authentication for user:', userId);
      
      // Delete all email configs for this user
      const { error: deleteError } = await supabase
        .from('user_email_configs')
        .delete()
        .eq('user_id', userId);
      
      if (deleteError) {
        console.warn('[forceReauthentication] Failed to delete email configs:', deleteError);
      }
      
      // Clear encryption keys
      await clearEncryptionKey();
      
      console.log('[forceReauthentication] Re-authentication forced successfully');
    } catch (error) {
      console.error('[forceReauthentication] Error during force re-authentication:', error);
      throw error;
    }
  }

  // Migrate legacy localStorage tokens to database (called automatically by decryptToken)
  async migrateLegacyTokens(userId: string): Promise<void> {
    try {
      console.log('[migrateLegacyTokens] Checking for legacy tokens to migrate for user:', userId);
      
      const legacyKey = localStorage.getItem('dmarc_encryption_key');
      if (legacyKey) {
        console.log('[migrateLegacyTokens] Found legacy key, attempting migration');
        
        // The new encryption system will handle this automatically
        // Just trigger it by calling getEncryptionPassword
        const { getEncryptionPassword } = await import('@/utils/encryption');
        await getEncryptionPassword();
        
        console.log('[migrateLegacyTokens] Legacy key migration completed');
      } else {
        console.log('[migrateLegacyTokens] No legacy keys found');
      }
    } catch (error) {
      console.warn('[migrateLegacyTokens] Migration failed:', error);
    }
  }

  // Check if current token has email modification permissions
  async checkDeletionPermissions(credentials: GmailAuthCredentials): Promise<boolean> {
    try {
      // Test if we can access the Gmail modify API by attempting to list labels
      // This is a safe operation that requires gmail.modify scope
      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/labels', {
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
  async startOAuthFlowWithScopes(requireModifyScope: boolean = false): Promise<GmailAuthCredentials> {
    if (!this.isConfigured) {
      throw new Error('Gmail integration not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable.');
    }

    const scopes = requireModifyScope ? GMAIL_SCOPES_WITH_MODIFY : GMAIL_SCOPES_READ_ONLY;

    return new Promise((resolve, reject) => {
      try {
        const client = window.google?.accounts.oauth2.initTokenClient({
          client_id: this.clientId!,
          scope: scopes.join(' '),
          callback: async (response: any) => {
            try {
              if (response.error) {
                reject(new Error(`OAuth error: ${response.error}`));
                return;
              }

              console.log('OAuth response received:', { 
                has_access_token: !!response.access_token,
                scope: response.scope 
              });

              // Get user info to get email
              const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${response.access_token}`);
              
              if (!userInfoResponse.ok) {
                throw new Error('Failed to get user info from Google API');
              }

              const userInfo = await userInfoResponse.json();
              console.log('User info obtained:', { email: userInfo.email });

              const credentials: GmailAuthCredentials = {
                access_token: response.access_token,
                email: userInfo.email,
                expires_at: new Date(Date.now() + 3600 * 1000) // 1 hour from now (default)
              };

              // Check if we have a refresh token (only provided on first consent)
              if (response.refresh_token) {
                credentials.refresh_token = response.refresh_token;
              }

              resolve(credentials);
            } catch (error) {
              console.error('Error in OAuth callback:', error);
              reject(error);
            }
          },
          access_type: 'offline',
          prompt: 'consent',
        });

        client.requestAccessToken();
      } catch (error) {
        console.error('Error starting OAuth flow:', error);
        reject(error);
      }
    });
  }

  // Upgrade existing configuration to include deletion permissions
  async upgradeToModifyPermissions(configId: string, userId: string): Promise<GmailAuthCredentials> {
    try {
      console.log('[upgradeToModifyPermissions] Upgrading permissions for config:', configId);
      
      // Start OAuth flow with modify scopes
      const credentials = await this.startOAuthFlowWithScopes(true);
      
      // Update the existing configuration with new credentials
      await this.updateStoredToken(configId, credentials);
      
      console.log('[upgradeToModifyPermissions] Permissions upgraded successfully');
      return credentials;
      
    } catch (error) {
      console.error('[upgradeToModifyPermissions] Failed to upgrade permissions:', error);
      throw new Error(`Failed to upgrade Gmail permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            message: 'No valid credentials found. Please reconnect your Gmail account.'
          };
        }

        const hasPermissions = await this.checkDeletionPermissions(credentials);
        if (!hasPermissions) {
          return {
            success: false,
            requiresReauth: true,
            message: 'Additional Gmail permissions required for email deletion. Please re-authorize your account.'
          };
        }
      }

      // Update the database (handle missing columns gracefully)
      try {
        const { error } = await supabase
          .from('user_email_configs')
          .update({
            delete_after_import: deleteAfterImport,
            deletion_confirmation_shown: confirmationShown
          })
          .eq('id', configId)
          .eq('user_id', userId);

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
        .eq('user_id', userId);

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
        .eq('provider', 'gmail');

      if (error) {
        console.error('Error fetching config for debug:', error);
        return;
      }

      console.log('[debugAndUpdateSyncSettings] Current user configs:', data);

      // Update configs that don't have sync_unread_only set to true
      for (const config of data || []) {
        if (config.sync_unread_only === null || config.sync_unread_only === undefined) {
          console.log(`[debugAndUpdateSyncSettings] Updating config ${config.id} to enable sync_unread_only`);
          
          const { error: updateError } = await supabase
            .from('user_email_configs')
            .update({
              sync_unread_only: true,
              delete_after_import: config.delete_after_import ?? false,
              deletion_confirmation_shown: config.deletion_confirmation_shown ?? false
            })
            .eq('id', config.id);

          if (updateError) {
            console.error('Error updating config:', updateError);
          } else {
            console.log(`[debugAndUpdateSyncSettings] Successfully updated config ${config.id}`);
          }
        }
      }
    } catch (error) {
      console.error('[debugAndUpdateSyncSettings] Error:', error);
    }
  }
}

export const gmailAuthService = new GmailAuthService();

// Type declaration for Google API
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => any;
        };
      };
    };
  }
}