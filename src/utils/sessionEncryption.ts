import { supabase } from '@/integrations/supabase/client';

const PBKDF2_ITERATIONS = 600000; // OWASP recommended minimum
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // GCM mode uses 12-byte IV
const SALT_LENGTH = 16;

interface EncryptedTokenData {
  encrypted: number[];
  iv: number[];
  salt: number[];
  iterations: number;
  algorithm: string;
  version: number;
}

interface SessionKeyMaterial {
  userId: string;
  email: string;
  sessionId: string;
}

class SessionEncryptionService {
  private static readonly APP_SECRET = import.meta.env.VITE_ENCRYPTION_SECRET || 'dmarc-analytics-fallback-secret';
  private static readonly VERSION = 1;
  
  /**
   * Derive encryption key from user session data instead of localStorage
   */
  private async deriveSessionKey(sessionMaterial: SessionKeyMaterial, salt: Uint8Array): Promise<CryptoKey> {
    // Create stable key material from session data
    const keyMaterial = `${SessionEncryptionService.APP_SECRET}:${sessionMaterial.userId}:${sessionMaterial.email}`;
    const encoder = new TextEncoder();
    
    // Import key material for PBKDF2
    const importedKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(keyMaterial),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    // Derive AES key using PBKDF2
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      importedKey,
      {
        name: 'AES-GCM',
        length: AES_KEY_LENGTH
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Get current user session for key derivation
   */
  private async getCurrentSession(): Promise<SessionKeyMaterial> {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session?.user) {
      throw new Error('No authenticated session available for encryption');
    }
    
    return {
      userId: session.user.id,
      email: session.user.email || '',
      sessionId: session.access_token.substring(0, 16) // Use part of token as session ID
    };
  }

  /**
   * Encrypt OAuth tokens using session-derived keys
   */
  async encryptToken(token: string): Promise<string> {
    try {
      const sessionMaterial = await this.getCurrentSession();
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      
      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      
      // Derive key from session
      const key = await this.deriveSessionKey(sessionMaterial, salt);
      
      // Encrypt data
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );
      
      // Package encrypted data with metadata
      const encryptedData: EncryptedTokenData = {
        encrypted: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
        salt: Array.from(salt),
        iterations: PBKDF2_ITERATIONS,
        algorithm: 'AES-GCM',
        version: SessionEncryptionService.VERSION
      };
      
      return JSON.stringify(encryptedData);
    } catch (error) {
      console.error('[SessionEncryption] Encryption failed:', error);
      throw new Error(`Token encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt OAuth tokens using session-derived keys
   */
  async decryptToken(encryptedData: string): Promise<string> {
    try {
      const sessionMaterial = await this.getCurrentSession();
      const data: EncryptedTokenData = JSON.parse(encryptedData);
      
      // Validate data format
      if (!data.encrypted || !data.iv || !data.salt) {
        throw new Error('Invalid encrypted data format');
      }
      
      // Derive key using stored salt
      const salt = new Uint8Array(data.salt);
      const key = await this.deriveSessionKey(sessionMaterial, salt);
      
      // Decrypt data
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(data.iv) },
        key,
        new Uint8Array(data.encrypted)
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('[SessionEncryption] Decryption failed:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('No authenticated session')) {
          throw new Error('SESSION_EXPIRED');
        }
        if (error.name === 'OperationError') {
          throw new Error('DECRYPTION_FAILED');
        }
      }
      
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Check if encryption is supported
   */
  isSupported(): boolean {
    return !!(
      typeof crypto !== 'undefined' &&
      crypto.subtle &&
      typeof crypto.subtle.encrypt === 'function' &&
      typeof crypto.subtle.deriveKey === 'function'
    );
  }

  /**
   * Migrate existing localStorage tokens to session-based encryption
   */
  async migrateExistingTokens(): Promise<void> {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if we should attempt migration
      const hasLegacyKeys = localStorage.getItem('dmarc_session_encryption_key') || 
                           localStorage.getItem('dmarc_encryption_key');
      
      if (!hasLegacyKeys) {
        console.log('[migrateExistingTokens] No legacy keys found, skipping migration');
        return;
      }

      console.log('[migrateExistingTokens] Starting token migration process');

      // Find configs that might need migration
      const { data: configs, error } = await supabase
        .from('user_email_configs')
        .select('id, access_token, refresh_token, email_address')
        .eq('user_id', user.id);

      if (error || !configs) {
        console.warn('[migrateExistingTokens] Could not fetch email configs:', error);
        return;
      }

      let migratedCount = 0;
      let corruptedCount = 0;

      for (const config of configs) {
        try {
          console.log(`[migrateExistingTokens] Processing config ${config.id} (${config.email_address})`);
          
          let needsUpdate = false;
          let newAccessToken = config.access_token;
          let newRefreshToken = config.refresh_token;
          let isCorrupted = false;

          // Try to migrate access token if it exists
          if (config.access_token) {
            try {
              // Dynamically import the old encryption method
              const { decryptToken: oldDecrypt } = await import('./encryption');
              const decryptedAccessToken = await oldDecrypt(config.access_token);
              
              // Re-encrypt with new session-based encryption
              newAccessToken = await this.encryptToken(decryptedAccessToken);
              needsUpdate = true;
              console.log(`[migrateExistingTokens] Successfully migrated access token for config ${config.id}`);
            } catch (decryptError) {
              console.warn(`[migrateExistingTokens] Could not decrypt access token for config ${config.id}:`, decryptError);
              // Mark tokens as corrupted - they'll need re-authentication
              newAccessToken = null;
              isCorrupted = true;
              needsUpdate = true;
            }
          }

          // Try to migrate refresh token if it exists
          if (config.refresh_token && !isCorrupted) {
            try {
              const { decryptToken: oldDecrypt } = await import('./encryption');
              const decryptedRefreshToken = await oldDecrypt(config.refresh_token);
              
              // Re-encrypt with new session-based encryption
              newRefreshToken = await this.encryptToken(decryptedRefreshToken);
              needsUpdate = true;
              console.log(`[migrateExistingTokens] Successfully migrated refresh token for config ${config.id}`);
            } catch (decryptError) {
              console.warn(`[migrateExistingTokens] Could not decrypt refresh token for config ${config.id}:`, decryptError);
              // Clear corrupted refresh token
              newRefreshToken = null;
              needsUpdate = true;
            }
          } else if (isCorrupted) {
            // Clear refresh token if access token is corrupted
            newRefreshToken = null;
          }

          // Update database with migrated or cleared tokens
          if (needsUpdate) {
            await supabase
              .from('user_email_configs')
              .update({
                access_token: newAccessToken,
                refresh_token: newRefreshToken,
                // Mark as inactive if tokens are corrupted
                is_active: !isCorrupted
              })
              .eq('id', config.id);
            
            if (isCorrupted) {
              console.log(`[migrateExistingTokens] Marked config ${config.id} as corrupted - user will need to re-authenticate`);
              corruptedCount++;
            } else {
              console.log(`[migrateExistingTokens] Successfully migrated config ${config.id}`);
              migratedCount++;
            }
          }
        } catch (error) {
          console.warn(`[migrateExistingTokens] Failed to process config ${config.id}:`, error);
          corruptedCount++;
        }
      }

      // Clear old localStorage keys after processing all configs
      localStorage.removeItem('dmarc_session_encryption_key');
      localStorage.removeItem('dmarc_encryption_key');
      
      console.log(`[migrateExistingTokens] Migration completed: ${migratedCount} migrated, ${corruptedCount} corrupted`);
      
      if (corruptedCount > 0) {
        console.warn(`[migrateExistingTokens] ${corruptedCount} email configurations have corrupted tokens and will require re-authentication`);
      }
      
    } catch (error) {
      console.error('[migrateExistingTokens] Token migration failed:', error);
      // Clear localStorage keys even if migration failed to prevent infinite retry
      localStorage.removeItem('dmarc_session_encryption_key');
      localStorage.removeItem('dmarc_encryption_key');
    }
  }
}

// Export singleton instance
export const sessionEncryption = new SessionEncryptionService();