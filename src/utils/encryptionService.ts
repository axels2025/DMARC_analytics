export interface EncryptionProvider {
  name: 'none' | 'browser-crypto' | 'pgp';
  isAvailable: boolean;
  description: string;
}

export interface EncryptedData {
  ciphertext: string;
  algorithm: string;
  keyId?: string;
  iv?: string;
  salt?: string;
  timestamp: number;
  version: number;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  keyId: string;
  algorithm: string;
  created: Date;
  expires?: Date;
}

export interface DerivedKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

/**
 * Client-side encryption using Web Crypto API
 */
export class ClientEncryption {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12;
  private static readonly SALT_LENGTH = 16;
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly VERSION = 1;

  /**
   * Check if Web Crypto API is available
   */
  static isAvailable(): boolean {
    return !!(
      typeof crypto !== 'undefined' &&
      crypto.subtle &&
      typeof crypto.subtle.encrypt === 'function' &&
      typeof crypto.subtle.decrypt === 'function' &&
      typeof crypto.subtle.generateKey === 'function'
    );
  }

  /**
   * Generate a new AES-GCM key
   */
  async generateKey(): Promise<CryptoKey> {
    try {
      const key = await crypto.subtle.generateKey(
        {
          name: ClientEncryption.ALGORITHM,
          length: ClientEncryption.KEY_LENGTH,
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
      
      return key;
    } catch (error) {
      throw new Error(`Failed to generate encryption key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKeyFromPassword(password: string, salt?: Uint8Array): Promise<DerivedKey> {
    try {
      const passwordBuffer = new TextEncoder().encode(password);
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const actualSalt = salt || crypto.getRandomValues(new Uint8Array(ClientEncryption.SALT_LENGTH));
      const iterations = ClientEncryption.PBKDF2_ITERATIONS;

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: actualSalt,
          iterations: iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        {
          name: ClientEncryption.ALGORITHM,
          length: ClientEncryption.KEY_LENGTH,
        },
        false,
        ['encrypt', 'decrypt']
      );

      return {
        key,
        salt: actualSalt,
        iterations,
      };
    } catch (error) {
      throw new Error(`Failed to derive key from password: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt data using AES-GCM
   */
  async encrypt(data: string, key: CryptoKey, keyId?: string): Promise<EncryptedData> {
    try {
      const plaintext = new TextEncoder().encode(data);
      const iv = crypto.getRandomValues(new Uint8Array(ClientEncryption.IV_LENGTH));

      const ciphertext = await crypto.subtle.encrypt(
        {
          name: ClientEncryption.ALGORITHM,
          iv: iv,
        },
        key,
        plaintext
      );

      // Convert to base64 for storage
      const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
      const ivBase64 = btoa(String.fromCharCode(...iv));

      return {
        ciphertext: ciphertextBase64,
        algorithm: ClientEncryption.ALGORITHM,
        keyId: keyId,
        iv: ivBase64,
        timestamp: Date.now(),
        version: ClientEncryption.VERSION,
      };
    } catch (error) {
      throw new Error(`Failed to encrypt data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt data using AES-GCM
   */
  async decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
    try {
      if (encryptedData.algorithm !== ClientEncryption.ALGORITHM) {
        throw new Error(`Unsupported algorithm: ${encryptedData.algorithm}`);
      }

      if (!encryptedData.iv) {
        throw new Error('Missing IV in encrypted data');
      }

      // Convert from base64
      const ciphertext = Uint8Array.from(atob(encryptedData.ciphertext), c => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));

      const decrypted = await crypto.subtle.decrypt(
        {
          name: ClientEncryption.ALGORITHM,
          iv: iv,
        },
        key,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error(`Failed to decrypt data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export key to JWK format
   */
  async exportKey(key: CryptoKey): Promise<string> {
    try {
      const exported = await crypto.subtle.exportKey('jwk', key);
      return JSON.stringify(exported);
    } catch (error) {
      throw new Error(`Failed to export key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Import key from JWK format
   */
  async importKey(keyData: string): Promise<CryptoKey> {
    try {
      const keyObject = JSON.parse(keyData);
      const key = await crypto.subtle.importKey(
        'jwk',
        keyObject,
        {
          name: ClientEncryption.ALGORITHM,
          length: ClientEncryption.KEY_LENGTH,
        },
        true,
        ['encrypt', 'decrypt']
      );
      
      return key;
    } catch (error) {
      throw new Error(`Failed to import key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate key fingerprint for identification
   */
  async generateKeyFingerprint(key: CryptoKey): Promise<string> {
    try {
      const exported = await this.exportKey(key);
      const encoder = new TextEncoder();
      const data = encoder.encode(exported);
      const hash = await crypto.subtle.digest('SHA-256', data);
      
      // Convert to hex
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    } catch (error) {
      throw new Error(`Failed to generate key fingerprint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Secure key storage manager
 */
export class KeyStorage {
  private static readonly KEY_STORAGE_PREFIX = 'dmarc_privacy_key_';
  private static readonly METADATA_STORAGE_PREFIX = 'dmarc_key_meta_';

  /**
   * Store encrypted key in localStorage
   */
  static async storeKey(keyId: string, key: CryptoKey, masterPassword: string): Promise<void> {
    try {
      const encryption = new ClientEncryption();
      const keyData = await encryption.exportKey(key);
      
      // Derive key from master password
      const { key: masterKey, salt } = await encryption.deriveKeyFromPassword(masterPassword);
      
      // Encrypt the key data
      const encryptedKeyData = await encryption.encrypt(keyData, masterKey, keyId);
      
      // Store encrypted key and metadata
      const storageKey = KeyStorage.KEY_STORAGE_PREFIX + keyId;
      const metaKey = KeyStorage.METADATA_STORAGE_PREFIX + keyId;
      
      localStorage.setItem(storageKey, JSON.stringify(encryptedKeyData));
      localStorage.setItem(metaKey, JSON.stringify({
        keyId,
        algorithm: 'AES-GCM',
        created: new Date().toISOString(),
        salt: btoa(String.fromCharCode(...salt)),
      }));
    } catch (error) {
      throw new Error(`Failed to store key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve and decrypt key from localStorage
   */
  static async retrieveKey(keyId: string, masterPassword: string): Promise<CryptoKey | null> {
    try {
      const storageKey = KeyStorage.KEY_STORAGE_PREFIX + keyId;
      const metaKey = KeyStorage.METADATA_STORAGE_PREFIX + keyId;
      
      const encryptedDataStr = localStorage.getItem(storageKey);
      const metadataStr = localStorage.getItem(metaKey);
      
      if (!encryptedDataStr || !metadataStr) {
        return null;
      }
      
      const encryptedData: EncryptedData = JSON.parse(encryptedDataStr);
      const metadata = JSON.parse(metadataStr);
      
      const encryption = new ClientEncryption();
      
      // Derive master key using stored salt
      const salt = Uint8Array.from(atob(metadata.salt), c => c.charCodeAt(0));
      const { key: masterKey } = await encryption.deriveKeyFromPassword(masterPassword, salt);
      
      // Decrypt key data
      const keyData = await encryption.decrypt(encryptedData, masterKey);
      
      // Import the key
      return await encryption.importKey(keyData);
    } catch (error) {
      console.error('Failed to retrieve key:', error);
      return null;
    }
  }

  /**
   * List all stored key IDs
   */
  static listKeys(): Array<{ keyId: string; created: string; algorithm: string }> {
    const keys: Array<{ keyId: string; created: string; algorithm: string }> = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KeyStorage.METADATA_STORAGE_PREFIX)) {
        try {
          const metadata = JSON.parse(localStorage.getItem(key) || '{}');
          keys.push({
            keyId: metadata.keyId,
            created: metadata.created,
            algorithm: metadata.algorithm,
          });
        } catch (error) {
          console.warn('Failed to parse key metadata:', error);
        }
      }
    }
    
    return keys.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  }

  /**
   * Delete a stored key
   */
  static deleteKey(keyId: string): void {
    const storageKey = KeyStorage.KEY_STORAGE_PREFIX + keyId;
    const metaKey = KeyStorage.METADATA_STORAGE_PREFIX + keyId;
    
    localStorage.removeItem(storageKey);
    localStorage.removeItem(metaKey);
  }

  /**
   * Clear all stored keys
   */
  static clearAllKeys(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(KeyStorage.KEY_STORAGE_PREFIX) || key.startsWith(KeyStorage.METADATA_STORAGE_PREFIX))) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}

/**
 * Enhanced PGP encryption using OpenPGP.js (optional)
 * This is a placeholder for enterprise users who want PGP functionality
 */
export class PGPEncryption {
  private static isOpenPGPAvailable(): boolean {
    // Check if OpenPGP.js is loaded
    return typeof (globalThis as any).openpgp !== 'undefined';
  }

  static getAvailability(): EncryptionProvider {
    return {
      name: 'pgp',
      isAvailable: PGPEncryption.isOpenPGPAvailable(),
      description: 'OpenPGP encryption (requires additional library)',
    };
  }

  /**
   * Generate PGP key pair (placeholder implementation)
   */
  async generateKeyPair(name: string, email: string, passphrase: string): Promise<KeyPair> {
    if (!PGPEncryption.isOpenPGPAvailable()) {
      throw new Error('OpenPGP.js library not available');
    }

    // Placeholder - would use actual OpenPGP.js implementation
    throw new Error('PGP encryption not yet implemented. Use ClientEncryption for now.');
  }

  /**
   * Encrypt data with PGP (placeholder)
   */
  async encrypt(data: string, publicKey: string): Promise<string> {
    if (!PGPEncryption.isOpenPGPAvailable()) {
      throw new Error('OpenPGP.js library not available');
    }

    throw new Error('PGP encryption not yet implemented');
  }

  /**
   * Decrypt data with PGP (placeholder)
   */
  async decrypt(ciphertext: string, privateKey: string, passphrase: string): Promise<string> {
    if (!PGPEncryption.isOpenPGPAvailable()) {
      throw new Error('OpenPGP.js library not available');
    }

    throw new Error('PGP decryption not yet implemented');
  }
}

/**
 * Encryption service factory
 */
export class EncryptionService {
  private clientEncryption: ClientEncryption;
  private pgpEncryption: PGPEncryption;

  constructor() {
    this.clientEncryption = new ClientEncryption();
    this.pgpEncryption = new PGPEncryption();
  }

  /**
   * Get available encryption providers
   */
  getAvailableProviders(): EncryptionProvider[] {
    return [
      {
        name: 'none',
        isAvailable: true,
        description: 'No encryption (data stored in plain text)',
      },
      {
        name: 'browser-crypto',
        isAvailable: ClientEncryption.isAvailable(),
        description: 'Browser-native AES-GCM encryption',
      },
      PGPEncryption.getAvailability(),
    ];
  }

  /**
   * Get the recommended encryption provider
   */
  getRecommendedProvider(): EncryptionProvider {
    const providers = this.getAvailableProviders();
    
    // Prefer browser crypto if available
    const browserCrypto = providers.find(p => p.name === 'browser-crypto' && p.isAvailable);
    if (browserCrypto) return browserCrypto;
    
    // Fall back to no encryption
    return providers.find(p => p.name === 'none')!;
  }

  /**
   * Get encryption instance by provider name
   */
  getEncryptionInstance(providerName: EncryptionProvider['name']): ClientEncryption | PGPEncryption | null {
    switch (providerName) {
      case 'browser-crypto':
        return ClientEncryption.isAvailable() ? this.clientEncryption : null;
      case 'pgp':
        return PGPEncryption.getAvailability().isAvailable ? this.pgpEncryption : null;
      case 'none':
      default:
        return null;
    }
  }

  /**
   * Encrypt data using the specified provider
   */
  async encryptData(data: string, providerName: EncryptionProvider['name'], key?: CryptoKey): Promise<EncryptedData | string> {
    if (providerName === 'none') {
      return data; // Return plain text
    }

    if (providerName === 'browser-crypto' && key) {
      return await this.clientEncryption.encrypt(data, key);
    }

    throw new Error(`Encryption with provider ${providerName} not supported or missing key`);
  }

  /**
   * Decrypt data using the specified provider
   */
  async decryptData(
    encryptedData: EncryptedData | string, 
    providerName: EncryptionProvider['name'], 
    key?: CryptoKey
  ): Promise<string> {
    if (providerName === 'none') {
      return encryptedData as string; // Return as-is
    }

    if (providerName === 'browser-crypto' && key && typeof encryptedData === 'object') {
      return await this.clientEncryption.decrypt(encryptedData, key);
    }

    throw new Error(`Decryption with provider ${providerName} not supported or missing key`);
  }

  /**
   * Test encryption/decryption cycle
   */
  async testEncryption(providerName: EncryptionProvider['name']): Promise<boolean> {
    try {
      const testData = 'Test encryption data: ' + Date.now();
      
      if (providerName === 'browser-crypto') {
        const key = await this.clientEncryption.generateKey();
        const encrypted = await this.clientEncryption.encrypt(testData, key);
        const decrypted = await this.clientEncryption.decrypt(encrypted, key);
        return decrypted === testData;
      }

      if (providerName === 'none') {
        return true; // No encryption test needed
      }

      return false;
    } catch (error) {
      console.error('Encryption test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();