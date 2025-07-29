// Input validation utilities
import { z } from 'zod';

// Schema for validating user inputs
export const emailSchema = z.string().email('Invalid email format');
export const domainSchema = z.string()
  .min(1, 'Domain is required')
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, 
    'Invalid domain format');

export const ipAddressSchema = z.string()
  .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/, 
    'Invalid IP address format');

// Client-side validation functions
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  try {
    emailSchema.parse(email);
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid email format' };
  }
}

export function validateDomain(domain: string): { isValid: boolean; error?: string } {
  try {
    domainSchema.parse(domain);
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid domain format' };
  }
}

export function validateIPAddress(ip: string): { isValid: boolean; error?: string } {
  try {
    ipAddressSchema.parse(ip);
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid IP address format' };
  }
}

// Sanitize user input for display
export function sanitizeUserInput(input: string): string {
  return input
    .replace(/[<>&"']/g, (char) => {
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#x27;'
      };
      return entities[char] || char;
    })
    .trim()
    .substring(0, 1000); // Limit length
}