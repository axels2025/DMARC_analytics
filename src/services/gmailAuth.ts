import { GoogleAuth } from 'google-auth-library';
import { supabase } from '@/integrations/supabase/client';
import { encryptToken, decryptToken, isEncryptionSupported } from '@/utils/encryption';

// Gmail API scopes needed for reading emails
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

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
  last_sync_at: string | null;
  sync_status: string;
  auto_sync_enabled: boolean;
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
          auto_sync_enabled: true
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
      const { data, error } = await supabase
        .from('user_email_configs')
        .select('id, provider, email_address, is_active, last_sync_at, sync_status, auto_sync_enabled')
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