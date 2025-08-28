export interface PrivacyLevel {
  level: 'low' | 'medium' | 'high';
  showFullEmails: boolean;
  showHeaders: boolean;
  showContent: boolean;
  showSensitiveData: boolean;
}

export const PRIVACY_LEVELS: Record<string, PrivacyLevel> = {
  low: {
    level: 'low',
    showFullEmails: true,
    showHeaders: true,
    showContent: true,
    showSensitiveData: true,
  },
  medium: {
    level: 'medium',
    showFullEmails: false,
    showHeaders: true,
    showContent: true,
    showSensitiveData: false,
  },
  high: {
    level: 'high',
    showFullEmails: false,
    showHeaders: false,
    showContent: false,
    showSensitiveData: false,
  },
};

export const maskEmailAddress = (email: string, privacyLevel: PrivacyLevel['level'] = 'medium'): string => {
  if (!email) return '';
  
  if (privacyLevel === 'low') return email;
  
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return email;
  
  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1);
  
  if (privacyLevel === 'high') {
    return `***@${domain}`;
  }
  
  // Medium privacy - show first and last character of local part
  if (localPart.length <= 2) {
    return `${localPart.charAt(0)}*@${domain}`;
  }
  
  const firstChar = localPart.charAt(0);
  const lastChar = localPart.charAt(localPart.length - 1);
  const maskLength = Math.max(1, localPart.length - 2);
  
  return `${firstChar}${'*'.repeat(maskLength)}${lastChar}@${domain}`;
};

export const truncateSubject = (subject: string, maxLength = 50, privacyLevel: PrivacyLevel['level'] = 'medium'): string => {
  if (!subject) return '';
  
  if (privacyLevel === 'high') return '[SUBJECT HIDDEN]';
  
  let cleaned = subject;
  
  // Remove potentially sensitive patterns regardless of privacy level
  cleaned = cleaned.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
  cleaned = cleaned.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN]');
  cleaned = cleaned.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  
  if (privacyLevel === 'medium') {
    cleaned = cleaned.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  }
  
  if (cleaned.length <= maxLength) return cleaned;
  
  return cleaned.substring(0, maxLength - 3) + '...';
};

export const sanitizeHeaders = (headers: string, privacyLevel: PrivacyLevel['level'] = 'medium'): string => {
  if (!headers) return '';
  
  if (privacyLevel === 'high') return '[HEADERS HIDDEN]';
  
  let cleaned = headers;
  
  // Always remove sensitive authentication headers
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-auth',
    'x-api-key',
    'x-session',
    'x-token',
    'www-authenticate',
    'proxy-authenticate',
    'proxy-authorization'
  ];
  
  for (const header of sensitiveHeaders) {
    const regex = new RegExp(`^${header}:.*$`, 'gmi');
    cleaned = cleaned.replace(regex, `${header}: [REDACTED]`);
  }
  
  // Mask email addresses in headers based on privacy level
  if (privacyLevel === 'medium') {
    cleaned = cleaned.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, (match) => {
      return maskEmailAddress(match, privacyLevel);
    });
  }
  
  // Remove long tokens/hashes
  cleaned = cleaned.replace(/\b[A-Za-z0-9+/]{32,}\b/g, '[TOKEN]');
  
  return cleaned;
};

export const sanitizeContent = (content: string, maxLength = 200, privacyLevel: PrivacyLevel['level'] = 'medium'): string => {
  if (!content) return '';
  
  if (privacyLevel === 'high') return '[CONTENT HIDDEN]';
  
  let cleaned = content;
  
  // Remove sensitive patterns
  cleaned = cleaned.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
  cleaned = cleaned.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN]');
  cleaned = cleaned.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  
  if (privacyLevel === 'medium') {
    cleaned = cleaned.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, (match) => {
      return maskEmailAddress(match, privacyLevel);
    });
  }
  
  if (cleaned.length <= maxLength) return cleaned;
  
  // Truncate at word boundary if possible
  const truncated = cleaned.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
};

export const getPrivacyLevelFromUser = (userPreferences?: any): PrivacyLevel['level'] => {
  if (!userPreferences?.privacyLevel) return 'medium';
  return userPreferences.privacyLevel;
};

export const formatTimestamp = (timestamp: number | Date, includeTime = true): string => {
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
  
  if (!includeTime) {
    return date.toLocaleDateString();
  }
  
  return date.toLocaleString();
};

export const formatIpAddress = (ip: string): string => {
  if (!ip) return '';
  
  // Basic IP validation and formatting
  if (ip.includes(':')) {
    // IPv6 - shorten if possible
    return ip.replace(/::/, '::').toLowerCase();
  }
  
  // IPv4 - return as is
  return ip;
};

export const getFailureTypeColor = (failureType: string): string => {
  const colors: Record<string, string> = {
    'dkim': 'text-red-600',
    'spf': 'text-orange-600',
    'both': 'text-red-800',
    'dmarc': 'text-purple-600',
    'quarantine': 'text-yellow-600',
    'reject': 'text-red-700',
    'none': 'text-gray-600',
  };
  
  return colors[failureType.toLowerCase()] || 'text-gray-600';
};

export const getFailureTypeLabel = (spfResult?: string, dkimResult?: string): string => {
  const spfFail = spfResult === 'fail';
  const dkimFail = dkimResult === 'fail';
  
  if (spfFail && dkimFail) return 'SPF & DKIM Fail';
  if (spfFail) return 'SPF Fail';
  if (dkimFail) return 'DKIM Fail';
  
  return 'Authentication Fail';
};

export const generateRedactedExport = (data: any[], privacyLevel: PrivacyLevel['level']): any[] => {
  return data.map(record => ({
    ...record,
    envelope_from: record.envelope_from ? maskEmailAddress(record.envelope_from, privacyLevel) : null,
    envelope_to: record.envelope_to ? maskEmailAddress(record.envelope_to, privacyLevel) : null,
    subject: record.subject ? truncateSubject(record.subject, 100, privacyLevel) : null,
    original_headers: privacyLevel === 'high' ? '[REDACTED]' : sanitizeHeaders(record.original_headers || '', privacyLevel),
    message_body: privacyLevel === 'high' ? '[REDACTED]' : sanitizeContent(record.message_body || '', 500, privacyLevel),
  }));
};