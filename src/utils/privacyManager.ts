export type MaskingLevel = 'minimal' | 'standard' | 'maximum';

export interface PrivacySettings {
  maskingLevel: MaskingLevel;
  showEmailAddresses: boolean;
  showSubjects: boolean;
  showHeaders: boolean;
  showMessageContent: boolean;
  encryptSensitiveData: boolean;
  retentionPeriodDays: number;
  auditDataAccess: boolean;
  allowTemporaryReveal: boolean;
  requireMasterPassword: boolean;
}

export interface MaskingOptions {
  preserveDomains: boolean;
  preserveSubjectKeywords: string[];
  headerWhitelist: string[];
  maxContentLength: number;
  preserveTimestamps: boolean;
  preserveIPAddresses: boolean;
}

export interface DataClassification {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  tags: string[];
  retentionRequired: boolean;
  encryptionRequired: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  maskingLevel: 'standard',
  showEmailAddresses: false,
  showSubjects: true,
  showHeaders: true,
  showMessageContent: false,
  encryptSensitiveData: false,
  retentionPeriodDays: 90,
  auditDataAccess: true,
  allowTemporaryReveal: true,
  requireMasterPassword: false,
};

export const DEFAULT_MASKING_OPTIONS: MaskingOptions = {
  preserveDomains: true,
  preserveSubjectKeywords: ['DMARC', 'SPF', 'DKIM', 'authentication', 'failed'],
  headerWhitelist: [
    'from',
    'to',
    'date',
    'subject',
    'message-id',
    'authentication-results',
    'received-spf',
    'dkim-signature',
    'arc-authentication-results'
  ],
  maxContentLength: 500,
  preserveTimestamps: true,
  preserveIPAddresses: true,
};

export const MASKING_LEVELS: Record<MaskingLevel, Partial<PrivacySettings & MaskingOptions>> = {
  minimal: {
    maskingLevel: 'minimal',
    showEmailAddresses: true,
    showSubjects: true,
    showHeaders: true,
    showMessageContent: true,
    maxContentLength: 1000,
    preserveDomains: true,
  },
  standard: {
    maskingLevel: 'standard',
    showEmailAddresses: false,
    showSubjects: true,
    showHeaders: true,
    showMessageContent: false,
    maxContentLength: 500,
    preserveDomains: true,
  },
  maximum: {
    maskingLevel: 'maximum',
    showEmailAddresses: false,
    showSubjects: false,
    showHeaders: false,
    showMessageContent: false,
    maxContentLength: 100,
    preserveDomains: false,
  },
};

/**
 * Advanced email address masking with domain preservation options
 */
export const maskEmailAddress = (
  email: string, 
  level: MaskingLevel = 'standard',
  preserveDomain: boolean = true
): string => {
  if (!email || typeof email !== 'string') return '';
  
  const trimmed = email.trim();
  if (!trimmed.includes('@')) return trimmed;
  
  const [localPart, domain] = trimmed.split('@');
  
  switch (level) {
    case 'minimal':
      // Show first 3 and last 1 character of local part
      if (localPart.length <= 4) return `${localPart.charAt(0)}***@${domain}`;
      return `${localPart.substring(0, 3)}***${localPart.slice(-1)}@${domain}`;
      
    case 'standard':
      // Show first and last character of local part
      if (localPart.length <= 2) return `${localPart.charAt(0)}*@${domain}`;
      return `${localPart.charAt(0)}${'*'.repeat(Math.min(localPart.length - 2, 6))}${localPart.slice(-1)}@${preserveDomain ? domain : '*****.com'}`;
      
    case 'maximum':
      // Heavy masking
      return `***@${preserveDomain ? domain : '*****.***'}`;
      
    default:
      return trimmed;
  }
};

/**
 * Intelligent subject line masking that preserves authentication keywords
 */
export const maskSubjectLine = (
  subject: string,
  options: MaskingOptions = DEFAULT_MASKING_OPTIONS
): string => {
  if (!subject || typeof subject !== 'string') return '';
  
  let masked = subject.trim();
  
  // Remove potentially sensitive patterns
  masked = masked.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
  masked = masked.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN]');
  masked = masked.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  
  // Replace email addresses
  masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  
  // Preserve important keywords
  const preserveKeywords = options.preserveSubjectKeywords.map(k => k.toLowerCase());
  const words = masked.split(/\s+/);
  
  const maskedWords = words.map(word => {
    const lowerWord = word.toLowerCase().replace(/[^\w]/g, '');
    if (preserveKeywords.some(keyword => lowerWord.includes(keyword))) {
      return word; // Keep authentication-related words
    }
    
    // Mask other words based on length
    if (word.length <= 3) return word;
    if (word.length <= 6) return word.charAt(0) + '*'.repeat(word.length - 2) + word.slice(-1);
    return word.substring(0, 2) + '*'.repeat(word.length - 4) + word.slice(-2);
  });
  
  return maskedWords.join(' ').substring(0, Math.min(masked.length, options.maxContentLength));
};

/**
 * Sanitize email headers while preserving authentication-related headers
 */
export const sanitizeEmailHeaders = (
  headers: string,
  whitelist: string[] = DEFAULT_MASKING_OPTIONS.headerWhitelist
): string => {
  if (!headers || typeof headers !== 'string') return '';
  
  const lines = headers.split('\n');
  const whitelistLower = whitelist.map(h => h.toLowerCase());
  
  const filteredLines = lines.filter(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return false;
    
    const headerName = line.substring(0, colonIndex).trim().toLowerCase();
    return whitelistLower.includes(headerName) || headerName.startsWith('x-');
  });
  
  // Mask email addresses in remaining headers
  const maskedLines = filteredLines.map(line => {
    let maskedLine = line;
    
    // Mask email addresses
    maskedLine = maskedLine.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      (match) => maskEmailAddress(match, 'standard')
    );
    
    // Remove potential tokens
    maskedLine = maskedLine.replace(/\b[A-Za-z0-9+/]{32,}\b/g, '[TOKEN]');
    
    return maskedLine;
  });
  
  return maskedLines.join('\n');
};

/**
 * Redact message content while preserving structure
 */
export const redactMessageContent = (
  content: string,
  maxLength: number = 500
): string => {
  if (!content || typeof content !== 'string') return '';
  
  let redacted = content.trim();
  
  // Remove sensitive patterns
  redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD-REDACTED]');
  redacted = redacted.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN-REDACTED]');
  redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE-REDACTED]');
  
  // Replace email addresses
  redacted = redacted.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL-REDACTED]'
  );
  
  // Replace URLs
  redacted = redacted.replace(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g, '[URL-REDACTED]');
  
  // Truncate content
  if (redacted.length > maxLength) {
    const truncated = redacted.substring(0, maxLength - 20);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      redacted = truncated.substring(0, lastSpace) + ' [...TRUNCATED]';
    } else {
      redacted = truncated + ' [...TRUNCATED]';
    }
  }
  
  return redacted;
};

/**
 * Generate SHA-256 hash for data integrity verification
 */
export const generateDataHash = async (data: string): Promise<string> => {
  if (!data) return '';
  
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Failed to generate data hash:', error);
    return '';
  }
};

/**
 * Classify data based on content sensitivity
 */
export const classifyData = (content: {
  emailAddresses?: string[];
  subject?: string;
  headers?: string;
  messageContent?: string;
}): DataClassification => {
  let level: DataClassification['level'] = 'internal';
  const tags: string[] = [];
  
  // Check for PII indicators
  const hasPII = [
    content.subject?.match(/\b\d{3}-?\d{2}-?\d{4}\b/), // SSN
    content.subject?.match(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/), // Credit card
    content.messageContent?.includes('confidential'),
    content.messageContent?.includes('personal'),
  ].some(Boolean);
  
  if (hasPII) {
    level = 'restricted';
    tags.push('PII');
  }
  
  // Check for authentication-related content
  const isAuthRelated = [
    content.subject?.toLowerCase().includes('dmarc'),
    content.subject?.toLowerCase().includes('spf'),
    content.subject?.toLowerCase().includes('dkim'),
    content.headers?.includes('authentication-results'),
  ].some(Boolean);
  
  if (isAuthRelated) {
    tags.push('authentication');
  }
  
  // Check for email addresses
  if (content.emailAddresses && content.emailAddresses.length > 0) {
    tags.push('email-addresses');
    if (level === 'internal') level = 'confidential';
  }
  
  return {
    level,
    tags,
    retentionRequired: level === 'restricted' || tags.includes('PII'),
    encryptionRequired: level === 'restricted',
  };
};

/**
 * Apply privacy settings to forensic data
 */
export const applyPrivacySettings = (
  data: any,
  settings: PrivacySettings,
  options: MaskingOptions = DEFAULT_MASKING_OPTIONS
): any => {
  const result = { ...data };
  
  // Apply email address masking
  if (!settings.showEmailAddresses && result.envelope_from) {
    result.envelope_from = maskEmailAddress(result.envelope_from, settings.maskingLevel, options.preserveDomains);
  }
  if (!settings.showEmailAddresses && result.envelope_to) {
    result.envelope_to = maskEmailAddress(result.envelope_to, settings.maskingLevel, options.preserveDomains);
  }
  if (!settings.showEmailAddresses && result.header_from) {
    result.header_from = maskEmailAddress(result.header_from, settings.maskingLevel, options.preserveDomains);
  }
  
  // Apply subject masking
  if (!settings.showSubjects && result.subject) {
    if (settings.maskingLevel === 'maximum') {
      result.subject = '[SUBJECT HIDDEN]';
    } else {
      result.subject = maskSubjectLine(result.subject, options);
    }
  }
  
  // Apply header filtering
  if (!settings.showHeaders && result.original_headers) {
    if (settings.maskingLevel === 'maximum') {
      result.original_headers = '[HEADERS HIDDEN]';
    } else {
      result.original_headers = sanitizeEmailHeaders(result.original_headers, options.headerWhitelist);
    }
  }
  
  // Apply message content redaction
  if (!settings.showMessageContent && result.message_body) {
    if (settings.maskingLevel === 'maximum') {
      result.message_body = '[CONTENT HIDDEN]';
    } else {
      result.message_body = redactMessageContent(result.message_body, options.maxContentLength);
    }
  }
  
  return result;
};

/**
 * Validate privacy settings for compliance
 */
export const validatePrivacySettings = (settings: PrivacySettings): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (settings.retentionPeriodDays < 1) {
    errors.push('Retention period must be at least 1 day');
  }
  
  if (settings.retentionPeriodDays > 2555) { // ~7 years max
    errors.push('Retention period cannot exceed 7 years');
  }
  
  if (settings.encryptSensitiveData && !settings.requireMasterPassword) {
    errors.push('Master password is required when encryption is enabled');
  }
  
  if (settings.maskingLevel === 'maximum' && settings.allowTemporaryReveal) {
    errors.push('Temporary reveal is not compatible with maximum masking level');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Get privacy level description for UI
 */
export const getPrivacyLevelDescription = (level: MaskingLevel): string => {
  switch (level) {
    case 'minimal':
      return 'Basic masking with full data visibility for analysis';
    case 'standard':
      return 'Balanced privacy with essential data protected';
    case 'maximum':
      return 'Maximum privacy protection with minimal data exposure';
    default:
      return 'Unknown privacy level';
  }
};

/**
 * Calculate privacy compliance score
 */
export const calculateComplianceScore = (settings: PrivacySettings): {
  score: number;
  factors: Array<{ factor: string; weight: number; met: boolean }>;
} => {
  const factors = [
    { factor: 'Data masking enabled', weight: 20, met: settings.maskingLevel !== 'minimal' },
    { factor: 'Sensitive data encryption', weight: 25, met: settings.encryptSensitiveData },
    { factor: 'Access auditing enabled', weight: 15, met: settings.auditDataAccess },
    { factor: 'Appropriate retention period', weight: 20, met: settings.retentionPeriodDays <= 365 },
    { factor: 'Restricted email visibility', weight: 10, met: !settings.showEmailAddresses },
    { factor: 'Master password protection', weight: 10, met: settings.requireMasterPassword },
  ];
  
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const scoredWeight = factors.reduce((sum, f) => sum + (f.met ? f.weight : 0), 0);
  
  return {
    score: Math.round((scoredWeight / totalWeight) * 100),
    factors,
  };
};