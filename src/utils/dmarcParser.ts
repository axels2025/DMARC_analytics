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
  return truncated.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
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
  
  // Basic IP validation (IPv4 or IPv6)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  
  if (sanitized && !ipv4Regex.test(sanitized) && !ipv6Regex.test(sanitized)) {
    throw new Error(`Invalid IP address format: ${sanitized}`);
  }
  
  return sanitized;
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

export async function parseDmarcXml(xmlContent: string): Promise<DmarcReport> {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');
    
    // Check for XML parsing errors
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) {
      throw new Error(`XML parsing failed: ${parserError.textContent}`);
    }

    const feedback = doc.getElementsByTagName('feedback')[0];
    if (!feedback) {
      throw new Error('Invalid DMARC report: Missing feedback element');
    }

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

    // Parse date range
    const dateRange = getFirstChildElement(reportMetadata, 'date_range');
    const dateRangeBegin = parseInt(getTextContent(getFirstChildElement(dateRange, 'begin'))) || 0;
    const dateRangeEnd = parseInt(getTextContent(getFirstChildElement(dateRange, 'end'))) || 0;

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
      records: recordElements.map((recordElement: Element) => {
        const row = getFirstChildElement(recordElement, 'row');
        const identifiers = getFirstChildElement(recordElement, 'identifiers');
        const authResults = getFirstChildElement(recordElement, 'auth_results');
        const policyEvaluated = getFirstChildElement(row, 'policy_evaluated');

        // Parse DKIM results with validation
        const dkimElements = authResults ? getChildElements(authResults, 'dkim') : [];
        const dkimResults = dkimElements.map((dkim: Element) => ({
          domain: validateDomain(getTextContent(getFirstChildElement(dkim, 'domain'))),
          selector: sanitizeText(getTextContent(getFirstChildElement(dkim, 'selector')), 100) || undefined,
          result: sanitizeText(getTextContent(getFirstChildElement(dkim, 'result')), 20) || 'fail',
        }));

        // Parse SPF results with validation
        const spfElements = authResults ? getChildElements(authResults, 'spf') : [];
        const spfResults = spfElements.map((spf: Element) => ({
          domain: validateDomain(getTextContent(getFirstChildElement(spf, 'domain'))),
          result: sanitizeText(getTextContent(getFirstChildElement(spf, 'result')), 20) || 'fail',
        }));

        return {
          row: {
            sourceIp: validateIpAddress(getTextContent(getFirstChildElement(row, 'source_ip'))),
            count: validateNumeric(getTextContent(getFirstChildElement(row, 'count')), 1, 1000000),
            policyEvaluated: {
              disposition: sanitizeText(getTextContent(getFirstChildElement(policyEvaluated, 'disposition')), 20) || 'none',
              dkim: sanitizeText(getTextContent(getFirstChildElement(policyEvaluated, 'dkim')), 20) || 'fail',
              spf: sanitizeText(getTextContent(getFirstChildElement(policyEvaluated, 'spf')), 20) || 'fail',
            },
          },
          identifiers: {
            headerFrom: validateDomain(getTextContent(getFirstChildElement(identifiers, 'header_from'))),
          },
          authResults: {
            dkim: dkimResults.length > 0 ? dkimResults : undefined,
            spf: spfResults.length > 0 ? spfResults : undefined,
          },
        };
      }),
    };

    return parsedReport;
  } catch (error) {
    throw new Error(`DMARC report parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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