export interface DmarcReport {
  reportMetadata: {
    orgName: string;
    email: string;
    reportId: string;
    dateRange: {
      begin: number;
      end: number;
    };
  };
  policyPublished: {
    domain: string;
    dkim: string;
    spf: string;
    p: string;
    sp?: string;
    pct?: number;
  };
  records: DmarcRecord[];
}

export interface DmarcRecord {
  row: {
    sourceIp: string;
    count: number;
    policyEvaluated: {
      disposition: string;
      dkim: string;
      spf: string;
    };
  };
  identifiers: {
    headerFrom: string;
    envelopeTo?: string;
  };
  authResults: {
    dkim?: Array<{
      domain: string;
      selector?: string;
      result: string;
    }>;
    spf?: Array<{
      domain: string;
      result: string;
    }>;
  };
}

// Input validation and sanitization functions
function sanitizeText(text: string, maxLength: number = 1000): string {
  if (!text) return '';
  
  // Remove any HTML/script tags for XSS prevention
  const cleanText = text.replace(/<[^>]*>/g, '');
  
  // Limit length to prevent DoS attacks
  const truncated = cleanText.slice(0, maxLength);
  
  // Remove null bytes and control characters except newlines/tabs
  // eslint-disable-next-line no-control-regex
  return truncated.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function validateDomain(domain: string): string {
  const sanitized = sanitizeText(domain, 253); // Max domain length
  
  // Basic domain validation - only allow valid domain characters
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(sanitized)) {
    throw new Error(`Invalid domain format: ${sanitized}`);
  }
  
  return sanitized;
}

function validateEmail(email: string): string {
  const sanitized = sanitizeText(email, 254); // Max email length
  
  // Basic email validation
  if (sanitized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) {
    throw new Error(`Invalid email format: ${sanitized}`);
  }
  
  return sanitized;
}

function validateIpAddress(ip: string): string {
  const sanitized = sanitizeText(ip, 45); // Max IPv6 length
  
  console.log(`[validateIpAddress] Validating IP: "${sanitized}"`);
  
  if (!sanitized) {
    throw new Error('IP address cannot be empty');
  }
  
  // IPv4 validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(sanitized)) {
    // Additional IPv4 range validation
    const parts = sanitized.split('.');
    if (parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255)) {
      console.log(`[validateIpAddress] IP "${sanitized}" validated as IPv4`);
      return sanitized;
    }
  }
  
  // Comprehensive IPv6 validation
  const ipv6Patterns = [
    // Full form: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
    /^[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){7}$/,
    
    // Compressed form with :: (most common)
    // Examples: 2607:f8b0:4864:20::82c, ::1, fe80::1, 2001:db8::1
    /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4})*::([0-9a-fA-F]{0,4}(:[0-9a-fA-F]{1,4})*)?$/,
    
    // Leading zeros compressed: ::ffff:192.0.2.1 (IPv4-mapped IPv6)
    /^::ffff:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/,
    
    // Other special cases
    /^::$/,          // All zeros
    /^::1$/,         // Loopback
    /^::[0-9a-fA-F]{1,4}$/,  // Starting with ::
    /^[0-9a-fA-F]{1,4}::$/   // Ending with ::
  ];
  
  // Check against IPv6 patterns
  for (let i = 0; i < ipv6Patterns.length; i++) {
    if (ipv6Patterns[i].test(sanitized)) {
      console.log(`[validateIpAddress] IP "${sanitized}" matched IPv6 pattern ${i}`);
      return sanitized;
    }
  }
  
  // If none of the patterns match, it's invalid
  console.error(`[validateIpAddress] IP "${sanitized}" failed all validation patterns`);
  throw new Error(`Invalid IP address format: ${sanitized}`);
}

function validateNumeric(value: string, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
  const sanitized = sanitizeText(value, 20);
  const parsed = parseInt(sanitized) || 0;
  
  if (parsed < min || parsed > max) {
    throw new Error(`Numeric value out of range: ${parsed}`);
  }
  
  return parsed;
}

// Helper function to get text content from XML element with validation
function getTextContent(element: Element | null): string {
  const content = element?.textContent?.trim() || '';
  return sanitizeText(content);
}

// Helper function to get all child elements with a specific tag name
function getChildElements(parent: Element, tagName: string): Element[] {
  return Array.from(parent.getElementsByTagName(tagName));
}

// Helper function to get first child element with a specific tag name
function getFirstChildElement(parent: Element, tagName: string): Element | null {
  const elements = parent.getElementsByTagName(tagName);
  return elements.length > 0 ? elements[0] : null;
}

// Sanitize XML content to prevent XXE and other attacks
function sanitizeXmlContent(xmlContent: string): string {
  console.log(`[sanitizeXmlContent] Sanitizing XML content`);
  
  // Remove XML external entity declarations
  let sanitized = xmlContent.replace(/<!ENTITY[^>]*>/gi, '');
  
  // Remove DOCTYPE declarations with external references
  sanitized = sanitized.replace(/<!DOCTYPE[^>]*\[[\s\S]*?\]>/gi, '');
  sanitized = sanitized.replace(/<!DOCTYPE[^>]*>/gi, '');
  
  // Remove XML processing instructions except the basic XML declaration
  sanitized = sanitized.replace(/<\?(?!xml)[^>]*\?>/gi, '');
  
  // Remove potentially malicious comments
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
  
  // Ensure proper encoding and remove null bytes
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/\u0000/g, '');
  
  console.log(`[sanitizeXmlContent] XML sanitization completed`);
  return sanitized;
}

// Validate XML document structure
function validateXmlStructure(doc: Document): void {
  console.log(`[validateXmlStructure] Validating document structure`);
  
  const feedback = doc.getElementsByTagName('feedback')[0];
  if (!feedback) {
    throw new Error('Missing required feedback element');
  }
  
  // Check for required top-level elements
  const requiredElements = ['report_metadata', 'policy_published'];
  for (const elementName of requiredElements) {
    const elements = feedback.getElementsByTagName(elementName);
    if (elements.length === 0) {
      throw new Error(`Missing required element: ${elementName}`);
    }
    if (elements.length > 1) {
      console.warn(`[validateXmlStructure] Multiple ${elementName} elements found, using first one`);
    }
  }
  
  // Check for at least one record
  const records = feedback.getElementsByTagName('record');
  if (records.length === 0) {
    throw new Error('DMARC report contains no records');
  }
  
  // Validate each record has required structure
  for (let i = 0; i < Math.min(records.length, 10); i++) { // Sample first 10 records for performance
    const record = records[i];
    const requiredRecordElements = ['row', 'identifiers', 'auth_results'];
    
    for (const elementName of requiredRecordElements) {
      const elements = record.getElementsByTagName(elementName);
      if (elements.length === 0) {
        throw new Error(`Record ${i + 1} missing required element: ${elementName}`);
      }
    }
  }
  
  console.log(`[validateXmlStructure] Structure validation completed for ${records.length} records`);
}

export async function parseDmarcXml(xmlContent: string): Promise<DmarcReport> {
  console.log(`[parseDmarcXml] Starting XML parsing (${xmlContent.length} characters)`);
  
  try {
    // Sanitize XML content to prevent XXE attacks
    const sanitizedXml = sanitizeXmlContent(xmlContent);
    console.log(`[parseDmarcXml] XML sanitized successfully`);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitizedXml, 'application/xml');
    
    // Check for XML parsing errors
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) {
      console.error(`[parseDmarcXml] XML parser error:`, parserError.textContent);
      throw new Error(`XML parsing failed: ${parserError.textContent}`);
    }

    const feedback = doc.getElementsByTagName('feedback')[0];
    if (!feedback) {
      console.error(`[parseDmarcXml] Missing feedback element in XML structure`);
      throw new Error('Invalid DMARC report: Missing feedback element');
    }
    
    console.log(`[parseDmarcXml] Found feedback element, extracting components`);

    // Validate document structure before parsing
    validateXmlStructure(doc);
    console.log(`[parseDmarcXml] XML structure validation passed`);

    // Extract report metadata
    const reportMetadata = getFirstChildElement(feedback, 'report_metadata');
    if (!reportMetadata) {
      throw new Error('Invalid DMARC report: Missing report_metadata');
    }

    // Extract policy published
    const policyPublished = getFirstChildElement(feedback, 'policy_published');
    if (!policyPublished) {
      throw new Error('Invalid DMARC report: Missing policy_published');
    }

    // Extract records
    const recordElements = getChildElements(feedback, 'record');
    if (recordElements.length === 0) {
      throw new Error('Invalid DMARC report: Missing record data');
    }

    // Parse date range with validation
    const dateRange = getFirstChildElement(reportMetadata, 'date_range');
    if (!dateRange) {
      throw new Error('Missing date_range in report metadata');
    }
    
    const dateRangeBeginElement = getFirstChildElement(dateRange, 'begin');
    const dateRangeEndElement = getFirstChildElement(dateRange, 'end');
    
    if (!dateRangeBeginElement || !dateRangeEndElement) {
      throw new Error('Missing begin or end date in date_range');
    }
    
    const dateRangeBegin = validateNumeric(getTextContent(dateRangeBeginElement), 0, Date.now() / 1000 + 86400);
    const dateRangeEnd = validateNumeric(getTextContent(dateRangeEndElement), 0, Date.now() / 1000 + 86400);
    
    if (dateRangeBegin >= dateRangeEnd) {
      throw new Error('Invalid date range: begin date must be before end date');
    }
    
    console.log(`[parseDmarcXml] Date range: ${new Date(dateRangeBegin * 1000).toISOString()} to ${new Date(dateRangeEnd * 1000).toISOString()}`);

    const parsedReport: DmarcReport = {
      reportMetadata: {
        orgName: sanitizeText(getTextContent(getFirstChildElement(reportMetadata, 'org_name')), 200),
        email: validateEmail(getTextContent(getFirstChildElement(reportMetadata, 'email'))),
        reportId: sanitizeText(getTextContent(getFirstChildElement(reportMetadata, 'report_id')), 100),
        dateRange: {
          begin: dateRangeBegin,
          end: dateRangeEnd,
        },
      },
      policyPublished: {
        domain: validateDomain(getTextContent(getFirstChildElement(policyPublished, 'domain'))),
        dkim: sanitizeText(getTextContent(getFirstChildElement(policyPublished, 'adkim')), 10) || 'r',
        spf: sanitizeText(getTextContent(getFirstChildElement(policyPublished, 'aspf')), 10) || 'r',
        p: sanitizeText(getTextContent(getFirstChildElement(policyPublished, 'p')), 20) || 'none',
        sp: sanitizeText(getTextContent(getFirstChildElement(policyPublished, 'sp')), 20) || undefined,
        pct: validateNumeric(getTextContent(getFirstChildElement(policyPublished, 'pct')), 0, 100) || 100,
      },
      records: recordElements.map((recordElement: Element, index: number) => {
        console.log(`[parseDmarcXml] Processing record ${index + 1}/${recordElements.length}`);
        
        const row = getFirstChildElement(recordElement, 'row');
        const identifiers = getFirstChildElement(recordElement, 'identifiers');
        const authResults = getFirstChildElement(recordElement, 'auth_results');
        
        if (!row || !identifiers || !authResults) {
          throw new Error(`Record ${index + 1} missing required elements (row, identifiers, or auth_results)`);
        }
        
        const policyEvaluated = getFirstChildElement(row, 'policy_evaluated');
        if (!policyEvaluated) {
          throw new Error(`Record ${index + 1} missing policy_evaluated element`);
        }

        // Validate source IP exists and is valid
        const sourceIpElement = getFirstChildElement(row, 'source_ip');
        if (!sourceIpElement) {
          throw new Error(`Record ${index + 1} missing source_ip`);
        }
        const sourceIp = validateIpAddress(getTextContent(sourceIpElement));
        if (!sourceIp) {
          throw new Error(`Record ${index + 1} has invalid or empty source_ip`);
        }

        // Validate count exists and is reasonable
        const countElement = getFirstChildElement(row, 'count');
        if (!countElement) {
          throw new Error(`Record ${index + 1} missing count`);
        }
        const count = validateNumeric(getTextContent(countElement), 1, 1000000);

        // Validate identifiers
        const headerFromElement = getFirstChildElement(identifiers, 'header_from');
        if (!headerFromElement) {
          throw new Error(`Record ${index + 1} missing header_from`);
        }
        const headerFrom = validateDomain(getTextContent(headerFromElement));
        if (!headerFrom) {
          throw new Error(`Record ${index + 1} has invalid or empty header_from domain`);
        }

        // Extract envelope_to (recipient domain) - this is optional in DMARC reports
        const envelopeToElement = getFirstChildElement(identifiers, 'envelope_to');
        let envelopeTo: string | undefined;
        if (envelopeToElement) {
          try {
            const envelopeToText = getTextContent(envelopeToElement);
            if (envelopeToText) {
              envelopeTo = validateDomain(envelopeToText);
            }
          } catch (error) {
            console.warn(`[parseDmarcXml] Record ${index + 1} has invalid envelope_to, skipping: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Parse DKIM results with enhanced validation
        const dkimElements = authResults ? getChildElements(authResults, 'dkim') : [];
        const dkimResults = dkimElements.map((dkim: Element, dkimIndex: number) => {
          const domainElement = getFirstChildElement(dkim, 'domain');
          const resultElement = getFirstChildElement(dkim, 'result');
          
          if (!domainElement || !resultElement) {
            console.warn(`[parseDmarcXml] Record ${index + 1} DKIM ${dkimIndex + 1} missing domain or result, skipping`);
            return null;
          }

          try {
            return {
              domain: validateDomain(getTextContent(domainElement)),
              selector: sanitizeText(getTextContent(getFirstChildElement(dkim, 'selector')), 100) || undefined,
              result: sanitizeText(getTextContent(resultElement), 20) || 'fail',
            };
          } catch (error) {
            console.warn(`[parseDmarcXml] Record ${index + 1} DKIM ${dkimIndex + 1} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
          }
        }).filter(Boolean); // Remove null entries

        // Parse SPF results with enhanced validation
        const spfElements = authResults ? getChildElements(authResults, 'spf') : [];
        const spfResults = spfElements.map((spf: Element, spfIndex: number) => {
          const domainElement = getFirstChildElement(spf, 'domain');
          const resultElement = getFirstChildElement(spf, 'result');
          
          if (!domainElement || !resultElement) {
            console.warn(`[parseDmarcXml] Record ${index + 1} SPF ${spfIndex + 1} missing domain or result, skipping`);
            return null;
          }

          try {
            return {
              domain: validateDomain(getTextContent(domainElement)),
              result: sanitizeText(getTextContent(resultElement), 20) || 'fail',
            };
          } catch (error) {
            console.warn(`[parseDmarcXml] Record ${index + 1} SPF ${spfIndex + 1} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
          }
        }).filter(Boolean); // Remove null entries

        return {
          row: {
            sourceIp,
            count,
            policyEvaluated: {
              disposition: sanitizeText(getTextContent(getFirstChildElement(policyEvaluated, 'disposition')), 20) || 'none',
              dkim: sanitizeText(getTextContent(getFirstChildElement(policyEvaluated, 'dkim')), 20) || 'fail',
              spf: sanitizeText(getTextContent(getFirstChildElement(policyEvaluated, 'spf')), 20) || 'fail',
            },
          },
          identifiers: {
            headerFrom,
            envelopeTo,
          },
          authResults: {
            dkim: dkimResults.length > 0 ? dkimResults : undefined,
            spf: spfResults.length > 0 ? spfResults : undefined,
          },
        };
      }),
    };

    console.log(`[parseDmarcXml] Successfully parsed report for ${parsedReport.policyPublished.domain} with ${parsedReport.records.length} records`);
    return parsedReport;
    
  } catch (error) {
    console.error(`[parseDmarcXml] Parsing failed:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
    throw new Error(`DMARC report parsing failed: ${errorMessage}`);
  }
}

export function validateDmarcXml(xmlContent: string): { isValid: boolean; error?: string } {
  try {
    // Parse the XML to check if it's valid
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');
    
    // Check for XML parsing errors
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) {
      return { isValid: false, error: 'Invalid XML format' };
    }

    // Check for feedback element (root element for DMARC reports)
    const feedback = doc.getElementsByTagName('feedback')[0];
    if (!feedback) {
      return { isValid: false, error: 'Not a valid DMARC report XML file' };
    }

    // Check for required elements
    const requiredElements = ['report_metadata', 'policy_published', 'record'];
    for (const element of requiredElements) {
      const elements = doc.getElementsByTagName(element);
      if (elements.length === 0) {
        return { isValid: false, error: `Missing required element: ${element}` };
      }
    }

    // Additional validation for key metadata
    const reportMetadata = doc.getElementsByTagName('report_metadata')[0];
    if (reportMetadata) {
      const orgName = reportMetadata.getElementsByTagName('org_name')[0];
      const reportId = reportMetadata.getElementsByTagName('report_id')[0];
      if (!orgName || !reportId) {
        return { isValid: false, error: 'Missing required report metadata (org_name or report_id)' };
      }
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid XML format' };
  }
}