// Security utilities for the application

/**
 * Rate limiting for authentication attempts
 */
class RateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  canAttempt(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record) {
      return true;
    }

    // Reset if window has passed
    if (now - record.lastAttempt > this.windowMs) {
      this.attempts.delete(identifier);
      return true;
    }

    return record.count < this.maxAttempts;
  }

  recordAttempt(identifier: string): void {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now - record.lastAttempt > this.windowMs) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
    } else {
      record.count++;
      record.lastAttempt = now;
    }
  }

  getRemainingAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record || Date.now() - record.lastAttempt > this.windowMs) {
      return this.maxAttempts;
    }
    return Math.max(0, this.maxAttempts - record.count);
  }

  getResetTime(identifier: string): number | null {
    const record = this.attempts.get(identifier);
    if (!record) return null;
    return record.lastAttempt + this.windowMs;
  }
}

// Global rate limiter instances
export const authRateLimiter = new RateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes
export const uploadRateLimiter = new RateLimiter(10, 60 * 1000); // 10 uploads per minute

/**
 * Generate a simple CSRF token for forms
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Content Security Policy helper
 */
export function getCSPDirectives(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Note: 'unsafe-inline' needed for Vite in dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'"
  ].join('; ');
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeForDisplay(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate session integrity
 */
export function validateSessionIntegrity(session: unknown): boolean {
  if (!session || typeof session !== 'object') {
    return false;
  }

  const sessionObj = session as Record<string, unknown>;
  
  if (!sessionObj.access_token || !sessionObj.user) {
    return false;
  }

  // Check if session is expired
  const expiresAt = sessionObj.expires_at;
  if (typeof expiresAt === 'number' && Date.now() / 1000 > expiresAt) {
    return false;
  }

  return true;
}

/**
 * Secure file upload validation
 */
export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export function validateUploadedFile(file: File): FileValidationResult {
  console.log(`[validateUploadedFile] Validating file: ${file.name} (${file.size} bytes, type: ${file.type})`);
  const warnings: string[] = [];
  
  // Check file size (50MB limit)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    console.error(`[validateUploadedFile] File too large: ${file.size} bytes`);
    return { isValid: false, error: 'File size exceeds 50MB limit' };
  }

  // Check file type
  const allowedTypes = ['application/xml', 'text/xml'];
  if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.xml')) {
    console.error(`[validateUploadedFile] Invalid file type: ${file.type} and doesn't end with .xml`);
    return { isValid: false, error: 'Only XML files are allowed' };
  }

  // Check filename - only require .xml extension, allow any characters
  const filename = file.name;
  if (!filename.toLowerCase().endsWith('.xml')) {
    console.error(`[validateUploadedFile] File doesn't end with .xml: ${filename}`);
    return { isValid: false, error: 'File must have .xml extension' };
  }
  
  console.log(`[validateUploadedFile] Filename validation passed: ${filename}`);

  // Check for suspiciously long filenames
  if (filename.length > 255) {
    return { isValid: false, error: 'Filename too long' };
  }

  // Warn about very large files
  if (file.size > 10 * 1024 * 1024) {
    warnings.push('Large file detected. Processing may take longer.');
  }

  console.log(`[validateUploadedFile] File validation completed successfully for: ${filename}`);
  return { isValid: true, warnings };
}