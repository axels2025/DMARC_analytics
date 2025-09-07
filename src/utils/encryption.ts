// Enhanced client-side encryption utilities for OAuth tokens with database-backed key management
// Uses Supabase to store encrypted encryption keys for persistence across sessions

import { supabase } from '@/integrations/supabase/client';

const ENCRYPTION_KEY_LENGTH = 32;
const IV_LENGTH = 16;
const MASTER_KEY_ITERATIONS = 100000;
const APPLICATION_SECRET = 'dmarc-analytics-v1'; // This should be from env in production

interface EncryptionKeyData {
  id: string;
  user_id: string;
  key_id: string;
  encrypted_key: string;
  algorithm: string;
  salt: string;
  iterations: number;
  key_purpose: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  is_active: boolean;
}

// Generate a key from a password/secret using PBKDF2
async function deriveKey(password: string, salt?: Uint8Array, iterations: number = MASTER_KEY_ITERATIONS): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Use provided salt or generate a default one for backward compatibility
  const saltBuffer = salt || encoder.encode('default-salt-for-legacy');
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Generate deterministic master password from user ID and application secret
function generateMasterPassword(userId: string): string {
  const combined = `${APPLICATION_SECRET}:${userId}`;
  return combined;
}

// Derive master encryption key from user authentication data
async function deriveMasterKey(userId: string, salt: Uint8Array): Promise<CryptoKey> {
  const masterPassword = generateMasterPassword(userId);
  return deriveKey(masterPassword, salt, MASTER_KEY_ITERATIONS);
}

// Generate a random salt
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// Convert Uint8Array to hex string
function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Convert hex string to Uint8Array
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Store encryption key in Supabase database (encrypted with master password)
async function storeEncryptionKeyInDatabase(userId: string, encryptionKey: string): Promise<string> {
  try {
    console.log('[storeEncryptionKeyInDatabase] Storing encryption key for user:', userId);
    
    const salt = generateSalt();
    const saltHex = uint8ArrayToHex(salt);
    const keyId = `gmail-oauth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Derive master key for encrypting the encryption key
    const masterKey = await deriveMasterKey(userId, salt);
    
    // Encrypt the encryption key with master key
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const keyData = encoder.encode(encryptionKey);
    
    const encryptedKeyBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      keyData
    );
    
    // Combine IV and encrypted key data
    const combined = new Uint8Array(iv.length + encryptedKeyBuffer.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedKeyBuffer), iv.length);
    const encryptedKeyHex = uint8ArrayToHex(combined);
    
    // Store in database
    const { error } = await supabase
      .from('user_encryption_keys')
      .insert({
        user_id: userId,
        key_id: keyId,
        encrypted_key: encryptedKeyHex,
        algorithm: 'AES-GCM',
        salt: saltHex,
        iterations: MASTER_KEY_ITERATIONS,
        key_purpose: 'gmail_oauth',
        is_active: true,
        last_used_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('[storeEncryptionKeyInDatabase] Database error:', error);
      throw new Error(`Failed to store encryption key: ${error.message}`);
    }
    
    console.log('[storeEncryptionKeyInDatabase] Encryption key stored successfully with ID:', keyId);
    return keyId;
    
  } catch (error) {
    console.error('[storeEncryptionKeyInDatabase] Error:', error);
    throw new Error(`Failed to store encryption key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Retrieve and decrypt encryption key from Supabase database
async function retrieveEncryptionKeyFromDatabase(userId: string): Promise<string | null> {
  try {
    console.log('[retrieveEncryptionKeyFromDatabase] Retrieving encryption key for user:', userId);
    
    // Get active encryption keys for this user (try gmail_oauth first, then data_encryption as fallback)
    const { data: keys, error } = await supabase
      .from('user_encryption_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('key_purpose', ['gmail_oauth', 'data_encryption'])
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[retrieveEncryptionKeyFromDatabase] Database error:', error);
      throw new Error(`Failed to retrieve encryption keys: ${error.message}`);
    }
    
    if (!keys || keys.length === 0) {
      console.log('[retrieveEncryptionKeyFromDatabase] No active encryption keys found');
      return null;
    }
    
    console.log(`[retrieveEncryptionKeyFromDatabase] Found ${keys.length} active keys, trying to decrypt`);
    
    // Try to decrypt each key until one works
    for (const keyData of keys) {
      try {
        const salt = hexToUint8Array(keyData.salt);
        const masterKey = await deriveMasterKey(userId, salt);
        
        // Decrypt the encryption key
        const encryptedCombined = hexToUint8Array(keyData.encrypted_key);
        
        if (encryptedCombined.length < IV_LENGTH) {
          console.warn(`[retrieveEncryptionKeyFromDatabase] Invalid encrypted key length for key ${keyData.key_id}`);
          continue;
        }
        
        const iv = encryptedCombined.slice(0, IV_LENGTH);
        const encryptedKeyData = encryptedCombined.slice(IV_LENGTH);
        
        const decryptedKeyBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          masterKey,
          encryptedKeyData
        );
        
        const decoder = new TextDecoder();
        const decryptionKey = decoder.decode(decryptedKeyBuffer);
        
        // Update last_used_at
        await supabase
          .from('user_encryption_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', keyData.id);
        
        console.log(`[retrieveEncryptionKeyFromDatabase] Successfully decrypted key: ${keyData.key_id}`);
        return decryptionKey;
        
      } catch (decryptError) {
        console.warn(`[retrieveEncryptionKeyFromDatabase] Failed to decrypt key ${keyData.key_id}:`, decryptError);
        continue;
      }
    }
    
    console.error('[retrieveEncryptionKeyFromDatabase] Failed to decrypt any available keys');
    return null;
    
  } catch (error) {
    console.error('[retrieveEncryptionKeyFromDatabase] Error:', error);
    throw new Error(`Failed to retrieve encryption key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Rotate encryption keys (generate new key and mark old ones as inactive)
async function rotateEncryptionKey(userId: string): Promise<string> {
  try {
    console.log('[rotateEncryptionKey] Rotating encryption key for user:', userId);
    
    // Generate new encryption key
    const array = new Uint8Array(ENCRYPTION_KEY_LENGTH);
    crypto.getRandomValues(array);
    const newEncryptionKey = uint8ArrayToHex(array);
    
    // Mark existing keys as inactive
    await supabase
      .from('user_encryption_keys')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);
    
    // Store new key
    const keyId = await storeEncryptionKeyInDatabase(userId, newEncryptionKey);
    
    console.log('[rotateEncryptionKey] Key rotation completed successfully');
    return newEncryptionKey;
    
  } catch (error) {
    console.error('[rotateEncryptionKey] Error:', error);
    throw new Error(`Failed to rotate encryption key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Clean up old inactive encryption keys
async function cleanupOldKeys(userId: string, retentionDays: number = 30): Promise<void> {
  try {
    console.log('[cleanupOldKeys] Cleaning up old encryption keys for user:', userId);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const { error } = await supabase
      .from('user_encryption_keys')
      .delete()
      .eq('user_id', userId)
      .eq('is_active', false)
      .lt('created_at', cutoffDate.toISOString());
    
    if (error) {
      console.error('[cleanupOldKeys] Database error:', error);
      throw new Error(`Failed to cleanup old keys: ${error.message}`);
    }
    
    console.log('[cleanupOldKeys] Old keys cleaned up successfully');
    
  } catch (error) {
    console.error('[cleanupOldKeys] Error:', error);
    throw new Error(`Failed to cleanup old keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get current user from Supabase auth
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Enhanced encryption password function that uses database storage
async function getEncryptionPassword(): Promise<string> {
  try {
    console.log('[getEncryptionPassword] Getting encryption password');
    
    // Check if we have a session key cached in localStorage (for performance)
    let sessionKey = localStorage.getItem('dmarc_session_encryption_key');
    if (sessionKey) {
      console.log('[getEncryptionPassword] Using cached session key');
      return sessionKey;
    }
    
    // Get current user
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    console.log('[getEncryptionPassword] User authenticated, attempting to retrieve key from database');
    
    // Try to retrieve encryption key from database
    let encryptionKey = await retrieveEncryptionKeyFromDatabase(user.id);
    
    if (!encryptionKey) {
      console.log('[getEncryptionPassword] No existing key found, generating new one');
      
      // Generate new encryption key
      const array = new Uint8Array(ENCRYPTION_KEY_LENGTH);
      crypto.getRandomValues(array);
      encryptionKey = uint8ArrayToHex(array);
      
      // Store in database
      await storeEncryptionKeyInDatabase(user.id, encryptionKey);
    }
    
    // Cache in session storage for performance (not persistent)
    localStorage.setItem('dmarc_session_encryption_key', encryptionKey);
    
    console.log('[getEncryptionPassword] Encryption password retrieved successfully');
    return encryptionKey;
    
  } catch (error) {
    console.error('[getEncryptionPassword] Error:', error);
    
    // Fallback: check if we have a legacy localStorage key
    const legacyKey = localStorage.getItem('dmarc_encryption_key');
    if (legacyKey) {
      console.warn('[getEncryptionPassword] Using legacy localStorage key as fallback');
      localStorage.setItem('dmarc_session_encryption_key', legacyKey);
      return legacyKey;
    }
    
    // Last resort: generate temporary key and warn user
    console.warn('[getEncryptionPassword] Database unavailable, generating temporary key - user will need to re-authenticate');
    const array = new Uint8Array(ENCRYPTION_KEY_LENGTH);
    crypto.getRandomValues(array);
    const tempKey = uint8ArrayToHex(array);
    localStorage.setItem('dmarc_session_encryption_key', tempKey);
    return tempKey;
  }
}

// Encrypt sensitive data
export async function encryptToken(token: string): Promise<string> {
  try {
    console.log('[encryptToken] Starting token encryption');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    
    const password = await getEncryptionPassword();
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    // Convert to base64
    const result = btoa(String.fromCharCode(...combined));
    console.log('[encryptToken] Token encrypted successfully');
    return result;
  } catch (error) {
    console.error('[encryptToken] Encryption failed:', error);
    throw new Error('Failed to encrypt token');
  }
}

// Decrypt sensitive data with fallback mechanism and multi-key support
export async function decryptToken(encryptedToken: string): Promise<string> {
  try {
    console.log('[decryptToken] Starting token decryption');
    
    if (!encryptedToken) {
      throw new Error('Empty encrypted token provided');
    }
    
    // Check if encryption is supported
    if (!isEncryptionSupported()) {
      throw new Error('Web Crypto API not available');
    }
    
    // Decode from base64 once
    const combined = new Uint8Array(
      atob(encryptedToken)
        .split('')
        .map(char => char.charCodeAt(0))
    );
    
    console.log('[decryptToken] Base64 decoded successfully, length:', combined.length);
    
    if (combined.length < IV_LENGTH) {
      throw new Error(`Invalid encrypted token: too short (${combined.length} bytes, expected at least ${IV_LENGTH})`);
    }
    
    const iv = combined.slice(0, IV_LENGTH);
    const encryptedData = combined.slice(IV_LENGTH);
    
    console.log('[decryptToken] IV length:', iv.length, 'Encrypted data length:', encryptedData.length);
    
    // Strategy 1: Try current session key from localStorage
    const sessionKey = localStorage.getItem('dmarc_session_encryption_key');
    if (sessionKey) {
      console.log('[decryptToken] Attempting decryption with cached session key');
      try {
        const key = await deriveKey(sessionKey);
        const decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          encryptedData
        );
        
        const decoder = new TextDecoder();
        const result = decoder.decode(decryptedData);
        console.log('[decryptToken] Successfully decrypted with session key');
        return result;
      } catch (sessionError) {
        console.warn('[decryptToken] Session key decryption failed:', sessionError);
        // Clear invalid session key
        localStorage.removeItem('dmarc_session_encryption_key');
      }
    }
    
    // Strategy 2: Try to fetch user's encryption keys from database
    const user = await getCurrentUser();
    if (user) {
      console.log('[decryptToken] Attempting to retrieve and try all user encryption keys');
      
      try {
        // Get all active keys for this user
        const { data: keys, error } = await supabase
          .from('user_encryption_keys')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('last_used_at', { ascending: false }); // Try most recently used first
        
        if (error) {
          console.error('[decryptToken] Database error retrieving keys:', error);
        } else if (keys && keys.length > 0) {
          console.log(`[decryptToken] Found ${keys.length} encryption keys, trying each one`);
          
          // Try each key until one works
          for (const keyData of keys) {
            try {
              console.log(`[decryptToken] Trying key: ${keyData.key_id}`);
              
              const salt = hexToUint8Array(keyData.salt);
              const masterKey = await deriveMasterKey(user.id, salt);
              
              // Decrypt the encryption key
              const encryptedCombined = hexToUint8Array(keyData.encrypted_key);
              
              if (encryptedCombined.length < IV_LENGTH) {
                console.warn(`[decryptToken] Invalid encrypted key length for ${keyData.key_id}`);
                continue;
              }
              
              const keyIv = encryptedCombined.slice(0, IV_LENGTH);
              const encryptedKeyData = encryptedCombined.slice(IV_LENGTH);
              
              const decryptedKeyBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: keyIv },
                masterKey,
                encryptedKeyData
              );
              
              const decoder = new TextDecoder();
              const encryptionKey = decoder.decode(decryptedKeyBuffer);
              
              // Now try to decrypt the token with this encryption key
              const tokenKey = await deriveKey(encryptionKey);
              const decryptedTokenData = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                tokenKey,
                encryptedData
              );
              
              const result = decoder.decode(decryptedTokenData);
              
              // Success! Cache this key and update last_used_at
              localStorage.setItem('dmarc_session_encryption_key', encryptionKey);
              
              await supabase
                .from('user_encryption_keys')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', keyData.id);
              
              console.log(`[decryptToken] Successfully decrypted with database key: ${keyData.key_id}`);
              return result;
              
            } catch (keyError) {
              console.warn(`[decryptToken] Failed to decrypt with key ${keyData.key_id}:`, keyError);
              continue;
            }
          }
        }
      } catch (dbError) {
        console.error('[decryptToken] Database access error:', dbError);
      }
    }
    
    // Strategy 3: Try legacy localStorage key as fallback
    const legacyKey = localStorage.getItem('dmarc_encryption_key');
    if (legacyKey) {
      console.log('[decryptToken] Attempting decryption with legacy localStorage key');
      try {
        const key = await deriveKey(legacyKey);
        const decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          encryptedData
        );
        
        const decoder = new TextDecoder();
        const result = decoder.decode(decryptedData);
        
        console.log('[decryptToken] Successfully decrypted with legacy key');
        
        // Migrate this key to database if user is authenticated
        if (user) {
          console.log('[decryptToken] Migrating legacy key to database');
          try {
            await storeEncryptionKeyInDatabase(user.id, legacyKey);
            localStorage.setItem('dmarc_session_encryption_key', legacyKey);
            console.log('[decryptToken] Legacy key migrated successfully');
          } catch (migrationError) {
            console.warn('[decryptToken] Failed to migrate legacy key:', migrationError);
          }
        }
        
        return result;
      } catch (legacyError) {
        console.warn('[decryptToken] Legacy key decryption failed:', legacyError);
      }
    }
    
    // All strategies failed
    console.error('[decryptToken] All decryption strategies failed');
    throw new Error('Token decryption failed - unable to decrypt with any available key. Please re-authenticate.');
    
  } catch (error) {
    console.error('[decryptToken] Decryption failed:', error);
    console.error('[decryptToken] Error type:', error.constructor.name);
    console.error('[decryptToken] Error message:', error instanceof Error ? error.message : 'Unknown error');
    
    if (error instanceof Error && error.message.includes('Token decryption failed')) {
      // Re-throw our custom error
      throw error;
    }
    
    if (error instanceof DOMException) {
      if (error.name === 'OperationError') {
        throw new Error('Token decryption failed - likely due to corrupted token or wrong encryption key. Please re-authenticate.');
      }
    }
    
    throw new Error('Failed to decrypt token due to unexpected error');
  }
}

// Check if Web Crypto API is available
export function isEncryptionSupported(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined';
}

// Clear all stored encryption keys (forces re-authentication)
export async function clearEncryptionKey(): Promise<void> {
  console.log('[clearEncryptionKey] Clearing stored encryption keys');
  
  // Clear session cache
  localStorage.removeItem('dmarc_session_encryption_key');
  localStorage.removeItem('dmarc_encryption_key'); // Legacy key
  
  // Clear database keys if user is authenticated
  try {
    const user = await getCurrentUser();
    if (user) {
      console.log('[clearEncryptionKey] Marking database encryption keys as inactive');
      await supabase
        .from('user_encryption_keys')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true);
      console.log('[clearEncryptionKey] Database keys marked as inactive');
    }
  } catch (error) {
    console.warn('[clearEncryptionKey] Failed to clear database keys:', error);
  }
}

// Get encryption key status for debugging
export async function getEncryptionKeyStatus(): Promise<{
  hasSessionKey: boolean;
  hasLegacyKey: boolean;
  hasDatabaseKeys: boolean;
  sessionKeyPreview: string;
  databaseKeyCount: number;
  userId: string | null;
}> {
  const sessionKey = localStorage.getItem('dmarc_session_encryption_key');
  const legacyKey = localStorage.getItem('dmarc_encryption_key');
  
  let hasDatabaseKeys = false;
  let databaseKeyCount = 0;
  let userId: string | null = null;
  
  try {
    const user = await getCurrentUser();
    userId = user?.id || null;
    
    if (user) {
      const { data: keys, error } = await supabase
        .from('user_encryption_keys')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (!error && keys) {
        hasDatabaseKeys = keys.length > 0;
        databaseKeyCount = keys.length;
      }
    }
  } catch (error) {
    console.warn('[getEncryptionKeyStatus] Failed to check database keys:', error);
  }
  
  return {
    hasSessionKey: !!sessionKey,
    hasLegacyKey: !!legacyKey,
    hasDatabaseKeys,
    sessionKeyPreview: sessionKey ? sessionKey.substring(0, 8) + '...' : 'none',
    databaseKeyCount,
    userId
  };
}

// Export new key management functions
export {
  storeEncryptionKeyInDatabase,
  retrieveEncryptionKeyFromDatabase,
  rotateEncryptionKey,
  cleanupOldKeys,
};