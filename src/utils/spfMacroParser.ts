/**
 * SPF Macro Parser - RFC 7208 Compliant
 * 
 * Provides comprehensive parsing, validation, and expansion of SPF macros.
 * Supports all standard SPF macro types with modifiers and security analysis.
 */

export interface SPFMacro {
  raw: string;
  type: MacroType;
  modifiers: MacroModifier[];
  position: number;
  length: number;
  isValid: boolean;
  errors: string[];
  securityRisk: 'low' | 'medium' | 'high';
  expansionExample?: string;
}

export interface MacroModifier {
  type: 'digits' | 'reverse' | 'delimiter';
  value: string | number;
}

export type MacroType = 's' | 'l' | 'o' | 'd' | 'i' | 'p' | 'v' | 'h' | 'c' | 'r' | 't';

export interface MacroExpansionContext {
  senderIP: string;
  senderEmail: string;
  currentDomain: string;
  heloDomain?: string;
  timestamp?: number;
  validatingDomain?: string;
}

export interface MacroAnalysisResult {
  macros: SPFMacro[];
  totalMacros: number;
  complexityScore: number;
  securityRisks: string[];
  performanceWarnings: string[];
  optimizationSuggestions: string[];
  dnsLookupsPerEmail: number;
}

/**
 * Default macro expansion context for testing
 */
export const DEFAULT_MACRO_CONTEXT: MacroExpansionContext = {
  senderIP: '192.168.1.100',
  senderEmail: 'test@example.com',
  currentDomain: 'company.com',
  heloDomain: 'mail.example.com',
  timestamp: Date.now(),
  validatingDomain: 'company.com'
};

/**
 * RFC 7208 macro character definitions
 */
const MACRO_CHARACTERS: Record<MacroType, string> = {
  's': 'sender',           // sender email address
  'l': 'local-part',       // local part of sender email
  'o': 'sender-domain',    // domain part of sender email
  'd': 'domain',           // current domain being checked
  'i': 'ip',              // sender IP address
  'p': 'validated-domain', // validated domain name of sender IP
  'v': 'ip-version',       // "in-addr" for IPv4, "ip6" for IPv6
  'h': 'helo',            // HELO/EHLO domain
  'c': 'smtp-client-ip',   // SMTP client IP in hex
  'r': 'receiving-domain', // domain portion of the recipient
  't': 'timestamp'         // current timestamp
};

/**
 * Parse SPF macros from a text string
 */
export function parseSPFMacros(text: string): MacroAnalysisResult {
  const macros: SPFMacro[] = [];
  const macroRegex = /%\{([slodipvhcrt])(\d*)([r]?)([.\-+,/_=]*)\}/gi;
  let match;
  
  while ((match = macroRegex.exec(text)) !== null) {
    const macro = parseSingleMacro(match, text);
    if (macro) {
      macros.push(macro);
    }
  }
  
  // Also check for malformed macros
  const malformedRegex = /%\{[^}]*\}/g;
  let malformedMatch;
  
  while ((malformedMatch = malformedRegex.exec(text)) !== null) {
    const existing = macros.find(m => m.position === malformedMatch.index);
    if (!existing) {
      const malformedMacro = createMalformedMacro(malformedMatch, text);
      macros.push(malformedMacro);
    }
  }
  
  return analyzeMacros(macros, text);
}

/**
 * Parse a single macro from a regex match
 */
function parseSingleMacro(match: RegExpExecArray, originalText: string): SPFMacro | null {
  const [fullMatch, macroChar, digits, reverse, delimiters] = match;
  const macroType = macroChar.toLowerCase() as MacroType;
  
  if (!MACRO_CHARACTERS[macroType]) {
    return null;
  }
  
  const modifiers: MacroModifier[] = [];
  
  // Parse digits modifier (truncation)
  if (digits && digits.length > 0) {
    const digitValue = parseInt(digits, 10);
    if (digitValue > 0 && digitValue <= 128) {
      modifiers.push({
        type: 'digits',
        value: digitValue
      });
    }
  }
  
  // Parse reverse modifier
  if (reverse === 'r') {
    modifiers.push({
      type: 'reverse',
      value: 'r'
    });
  }
  
  // Parse delimiters
  if (delimiters && delimiters.length > 0) {
    modifiers.push({
      type: 'delimiter',
      value: delimiters
    });
  }
  
  const macro: SPFMacro = {
    raw: fullMatch,
    type: macroType,
    modifiers,
    position: match.index || 0,
    length: fullMatch.length,
    isValid: validateMacroSyntax(fullMatch),
    errors: [],
    securityRisk: assessSecurityRisk(macroType, modifiers),
    expansionExample: expandMacro(macroType, modifiers, DEFAULT_MACRO_CONTEXT)
  };
  
  // Validate and add errors
  const validationErrors = validateMacro(macro);
  macro.errors = validationErrors;
  if (validationErrors.length > 0) {
    macro.isValid = false;
  }
  
  return macro;
}

/**
 * Create a malformed macro entry for tracking
 */
function createMalformedMacro(match: RegExpExecArray, originalText: string): SPFMacro {
  return {
    raw: match[0],
    type: 's', // default fallback
    modifiers: [],
    position: match.index || 0,
    length: match[0].length,
    isValid: false,
    errors: ['Malformed macro syntax'],
    securityRisk: 'medium',
    expansionExample: '[MALFORMED]'
  };
}

/**
 * Validate macro syntax according to RFC 7208
 */
function validateMacroSyntax(macroString: string): boolean {
  // RFC 7208 compliant macro syntax validation
  const validMacroPattern = /^%\{[slodipvhcrt](\d{1,3})?[r]?[.\-+,/_=]*\}$/i;
  return validMacroPattern.test(macroString);
}

/**
 * Validate individual macro for specific issues
 */
function validateMacro(macro: SPFMacro): string[] {
  const errors: string[] = [];
  
  // Check for excessive truncation
  const digitsModifier = macro.modifiers.find(m => m.type === 'digits');
  if (digitsModifier && typeof digitsModifier.value === 'number') {
    if (digitsModifier.value > 128) {
      errors.push('Digits modifier cannot exceed 128');
    }
    if (digitsModifier.value === 0) {
      errors.push('Digits modifier cannot be zero');
    }
  }
  
  // Check for dangerous delimiter combinations
  const delimiterModifier = macro.modifiers.find(m => m.type === 'delimiter');
  if (delimiterModifier && typeof delimiterModifier.value === 'string') {
    if (delimiterModifier.value.includes(' ')) {
      errors.push('Delimiters cannot contain spaces');
    }
    if (delimiterModifier.value.length > 10) {
      errors.push('Excessive delimiter length may cause issues');
    }
  }
  
  // Validate macro type specific rules
  if (macro.type === 'p' && macro.modifiers.length > 2) {
    errors.push('Complex modifiers on %{p} macro can cause DNS amplification');
  }
  
  if (macro.type === 'v' && digitsModifier) {
    errors.push('%{v} macro should not use digits modifier');
  }
  
  return errors;
}

/**
 * Assess security risk level of a macro
 */
function assessSecurityRisk(macroType: MacroType, modifiers: MacroModifier[]): 'low' | 'medium' | 'high' {
  // High risk macros
  if (macroType === 'p') {
    return 'high'; // PTR lookups can be abused for DNS amplification
  }
  
  if (macroType === 'c' || macroType === 't') {
    return 'high'; // Can leak sensitive information
  }
  
  // Medium risk conditions
  const hasComplexModifiers = modifiers.length > 2;
  const hasReverseAndDigits = modifiers.some(m => m.type === 'reverse') && 
                             modifiers.some(m => m.type === 'digits');
  
  if (hasComplexModifiers || hasReverseAndDigits) {
    return 'medium';
  }
  
  if (['i', 'h'].includes(macroType)) {
    return 'medium'; // IP and HELO can be manipulated by attackers
  }
  
  return 'low';
}

/**
 * Expand a macro with given context
 */
export function expandMacro(
  macroType: MacroType, 
  modifiers: MacroModifier[], 
  context: MacroExpansionContext
): string {
  let baseValue = '';
  
  // Get base value for macro type
  switch (macroType) {
    case 's':
      baseValue = context.senderEmail;
      break;
    case 'l':
      baseValue = context.senderEmail.split('@')[0] || '';
      break;
    case 'o':
      baseValue = context.senderEmail.split('@')[1] || '';
      break;
    case 'd':
      baseValue = context.currentDomain;
      break;
    case 'i':
      baseValue = context.senderIP;
      break;
    case 'p':
      baseValue = context.validatingDomain || 'unknown';
      break;
    case 'v':
      baseValue = context.senderIP.includes(':') ? 'ip6' : 'in-addr';
      break;
    case 'h':
      baseValue = context.heloDomain || context.senderIP;
      break;
    case 'c':
      baseValue = ipToHex(context.senderIP);
      break;
    case 'r':
      baseValue = context.currentDomain; // receiving domain
      break;
    case 't':
      baseValue = Math.floor((context.timestamp || Date.now()) / 1000).toString();
      break;
    default:
      baseValue = '';
  }
  
  // Apply modifiers
  return applyMacroModifiers(baseValue, modifiers, macroType);
}

/**
 * Apply macro modifiers to base value
 */
function applyMacroModifiers(value: string, modifiers: MacroModifier[], macroType: MacroType): string {
  let result = value;
  
  // Apply delimiters first (split domain labels)
  const delimiterModifier = modifiers.find(m => m.type === 'delimiter');
  if (delimiterModifier && typeof delimiterModifier.value === 'string' && ['d', 'o', 'h', 'p'].includes(macroType)) {
    // For domain-like values, delimiters specify how to split labels
    const delims = delimiterModifier.value || '.';
    const parts = result.split(new RegExp(`[${escapeRegex(delims)}]`));
    result = parts.join('.');
  }
  
  // Apply reverse modifier
  const reverseModifier = modifiers.find(m => m.type === 'reverse');
  if (reverseModifier) {
    const parts = result.split('.');
    result = parts.reverse().join('.');
  }
  
  // Apply digits modifier (truncation)
  const digitsModifier = modifiers.find(m => m.type === 'digits');
  if (digitsModifier && typeof digitsModifier.value === 'number') {
    const parts = result.split('.');
    const truncated = parts.slice(-digitsModifier.value);
    result = truncated.join('.');
  }
  
  return result;
}

/**
 * Convert IP address to hexadecimal representation
 */
function ipToHex(ip: string): string {
  if (ip.includes(':')) {
    // IPv6 - simplified conversion
    return ip.replace(/:/g, '');
  } else {
    // IPv4
    const parts = ip.split('.');
    return parts.map(part => {
      const hex = parseInt(part, 10).toString(16).toUpperCase();
      return hex.padStart(2, '0');
    }).join('');
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Analyze array of macros and generate insights
 */
function analyzeMacros(macros: SPFMacro[], originalText: string): MacroAnalysisResult {
  const validMacros = macros.filter(m => m.isValid);
  const invalidMacros = macros.filter(m => !m.isValid);
  
  // Calculate complexity score
  let complexityScore = 0;
  macros.forEach(macro => {
    complexityScore += 10; // Base score per macro
    complexityScore += macro.modifiers.length * 5; // Modifier complexity
    
    // High-risk macros add more complexity
    if (macro.securityRisk === 'high') complexityScore += 20;
    if (macro.securityRisk === 'medium') complexityScore += 10;
  });
  
  // Gather security risks
  const securityRisks: string[] = [];
  const highRiskMacros = macros.filter(m => m.securityRisk === 'high');
  const mediumRiskMacros = macros.filter(m => m.securityRisk === 'medium');
  
  if (highRiskMacros.length > 0) {
    securityRisks.push(`${highRiskMacros.length} high-risk macro(s) detected`);
  }
  if (mediumRiskMacros.length > 0) {
    securityRisks.push(`${mediumRiskMacros.length} medium-risk macro(s) detected`);
  }
  if (invalidMacros.length > 0) {
    securityRisks.push(`${invalidMacros.length} malformed macro(s) found`);
  }
  
  // Performance warnings
  const performanceWarnings: string[] = [];
  const pMacros = macros.filter(m => m.type === 'p');
  if (pMacros.length > 0) {
    performanceWarnings.push('PTR macros (%{p}) cause additional DNS lookups per email');
  }
  
  const complexMacros = macros.filter(m => m.modifiers.length > 2);
  if (complexMacros.length > 0) {
    performanceWarnings.push('Complex macros may slow SPF processing');
  }
  
  if (macros.length > 5) {
    performanceWarnings.push('Many macros in a single record may impact performance');
  }
  
  // Optimization suggestions
  const optimizationSuggestions: string[] = [];
  
  if (pMacros.length > 0) {
    optimizationSuggestions.push('Consider replacing %{p} macros with static IP ranges for better performance');
  }
  
  if (complexMacros.length > 0) {
    optimizationSuggestions.push('Simplify macro modifiers where possible to improve readability');
  }
  
  const sMacros = macros.filter(m => m.type === 's');
  if (sMacros.length > 2) {
    optimizationSuggestions.push('Multiple %{s} macros may be redundant - consider consolidation');
  }
  
  if (invalidMacros.length > 0) {
    optimizationSuggestions.push('Fix malformed macro syntax to ensure proper SPF evaluation');
  }
  
  // Estimate DNS lookups per email
  let dnsLookupsPerEmail = 1; // Base SPF lookup
  macros.forEach(macro => {
    if (macro.type === 'p') dnsLookupsPerEmail += 1; // PTR lookup
    if (macro.type === 'i' && macro.modifiers.some(m => m.type === 'reverse')) {
      dnsLookupsPerEmail += 0.5; // Possible additional lookup for reverse IP
    }
  });
  
  return {
    macros,
    totalMacros: macros.length,
    complexityScore,
    securityRisks,
    performanceWarnings,
    optimizationSuggestions,
    dnsLookupsPerEmail: Math.round(dnsLookupsPerEmail * 10) / 10
  };
}

/**
 * Expand all macros in a text string with given context
 */
export function expandMacrosInText(text: string, context: MacroExpansionContext): string {
  const macros = parseSPFMacros(text);
  let result = text;
  
  // Replace macros in reverse order to maintain positions
  macros.macros
    .sort((a, b) => b.position - a.position)
    .forEach(macro => {
      if (macro.isValid && macro.expansionExample) {
        result = result.substring(0, macro.position) + 
                macro.expansionExample + 
                result.substring(macro.position + macro.length);
      }
    });
  
  return result;
}

/**
 * Test macro expansion with sample data
 */
export function testMacroExpansion(macroString: string, context?: MacroExpansionContext): {
  expanded: string;
  isValid: boolean;
  errors: string[];
  securityRisk: 'low' | 'medium' | 'high';
} {
  const testContext = context || DEFAULT_MACRO_CONTEXT;
  const analysis = parseSPFMacros(macroString);
  const expanded = expandMacrosInText(macroString, testContext);
  
  const allErrors = analysis.macros.flatMap(m => m.errors);
  const isValid = analysis.macros.length > 0 && analysis.macros.every(m => m.isValid);
  const maxRisk = analysis.macros.reduce((max, macro) => {
    const risks = ['low', 'medium', 'high'];
    const currentIndex = risks.indexOf(macro.securityRisk);
    const maxIndex = risks.indexOf(max);
    return currentIndex > maxIndex ? macro.securityRisk : max;
  }, 'low' as 'low' | 'medium' | 'high');
  
  return {
    expanded,
    isValid,
    errors: allErrors,
    securityRisk: maxRisk
  };
}