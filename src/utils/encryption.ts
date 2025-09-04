// Simple client-side encryption utilities for OAuth tokens
// Note: In production, you should use server-side encryption with proper key management

const ENCRYPTION_KEY_LENGTH = 32;
const IV_LENGTH = 16;

// Generate a key from a password/secret (in production, use a proper KDF like PBKDF2)
async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Get or generate encryption password (stored in localStorage for demo)
// In production, this should be handled server-side with proper key management
function getEncryptionPassword(): string {
  let password = localStorage.getItem('dmarc_encryption_key');
  if (!password) {
    // Generate a random password for this user session
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    password = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('dmarc_encryption_key', password);
  }
  return password;
}

// Encrypt sensitive data
export async function encryptToken(token: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    
    const key = await deriveKey(getEncryptionPassword());
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
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt token');
  }
}

// Decrypt sensitive data
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
    
    // Get current encryption password
    const currentPassword = getEncryptionPassword();
    console.log('[decryptToken] Current encryption key exists:', !!currentPassword);
    console.log('[decryptToken] Encryption key length:', currentPassword.length);
    
    // Decode from base64
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
    
    const key = await deriveKey(currentPassword);
    console.log('[decryptToken] Encryption key derived successfully');
    
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    
    const decoder = new TextDecoder();
    const result = decoder.decode(decryptedData);
    
    console.log('[decryptToken] Decryption successful, result length:', result.length);
    return result;
    
  } catch (error) {
    console.error('[decryptToken] Decryption failed:', error);
    console.error('[decryptToken] Error type:', error.constructor.name);
    console.error('[decryptToken] Error message:', error instanceof Error ? error.message : 'Unknown error');
    
    // Log localStorage encryption key status for debugging
    const storedKey = localStorage.getItem('dmarc_encryption_key');
    console.error('[decryptToken] Stored encryption key exists:', !!storedKey);
    
    if (error instanceof DOMException) {
      if (error.name === 'OperationError') {
        throw new Error('Token decryption failed - likely due to wrong encryption key. Please re-authenticate.');
      }
    }
    
    throw new Error('Failed to decrypt token');
  }
}

// Check if Web Crypto API is available
export function isEncryptionSupported(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined';
}

// Clear the stored encryption key (forces re-authentication)
export function clearEncryptionKey(): void {
  console.log('[clearEncryptionKey] Clearing stored encryption key');
  localStorage.removeItem('dmarc_encryption_key');
}

// Get encryption key status for debugging
export function getEncryptionKeyStatus(): {
  hasKey: boolean;
  keyLength: number;
  keyPreview: string;
} {
  const key = localStorage.getItem('dmarc_encryption_key');
  return {
    hasKey: !!key,
    keyLength: key ? key.length : 0,
    keyPreview: key ? key.substring(0, 8) + '...' : 'none'
  };
}