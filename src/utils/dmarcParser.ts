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

// Helper function to get text content from XML element
function getTextContent(element: Element | null): string {
  return element?.textContent?.trim() || '';
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
        orgName: getTextContent(getFirstChildElement(reportMetadata, 'org_name')),
        email: getTextContent(getFirstChildElement(reportMetadata, 'email')),
        reportId: getTextContent(getFirstChildElement(reportMetadata, 'report_id')),
        dateRange: {
          begin: dateRangeBegin,
          end: dateRangeEnd,
        },
      },
      policyPublished: {
        domain: getTextContent(getFirstChildElement(policyPublished, 'domain')),
        dkim: getTextContent(getFirstChildElement(policyPublished, 'adkim')) || 'r',
        spf: getTextContent(getFirstChildElement(policyPublished, 'aspf')) || 'r',
        p: getTextContent(getFirstChildElement(policyPublished, 'p')) || 'none',
        sp: getTextContent(getFirstChildElement(policyPublished, 'sp')) || undefined,
        pct: parseInt(getTextContent(getFirstChildElement(policyPublished, 'pct'))) || 100,
      },
      records: recordElements.map((recordElement: Element) => {
        const row = getFirstChildElement(recordElement, 'row');
        const identifiers = getFirstChildElement(recordElement, 'identifiers');
        const authResults = getFirstChildElement(recordElement, 'auth_results');
        const policyEvaluated = getFirstChildElement(row, 'policy_evaluated');

        // Parse DKIM results
        const dkimElements = authResults ? getChildElements(authResults, 'dkim') : [];
        const dkimResults = dkimElements.map((dkim: Element) => ({
          domain: getTextContent(getFirstChildElement(dkim, 'domain')),
          selector: getTextContent(getFirstChildElement(dkim, 'selector')) || undefined,
          result: getTextContent(getFirstChildElement(dkim, 'result')) || 'fail',
        }));

        // Parse SPF results
        const spfElements = authResults ? getChildElements(authResults, 'spf') : [];
        const spfResults = spfElements.map((spf: Element) => ({
          domain: getTextContent(getFirstChildElement(spf, 'domain')),
          result: getTextContent(getFirstChildElement(spf, 'result')) || 'fail',
        }));

        return {
          row: {
            sourceIp: getTextContent(getFirstChildElement(row, 'source_ip')),
            count: parseInt(getTextContent(getFirstChildElement(row, 'count'))) || 0,
            policyEvaluated: {
              disposition: getTextContent(getFirstChildElement(policyEvaluated, 'disposition')) || 'none',
              dkim: getTextContent(getFirstChildElement(policyEvaluated, 'dkim')) || 'fail',
              spf: getTextContent(getFirstChildElement(policyEvaluated, 'spf')) || 'fail',
            },
          },
          identifiers: {
            headerFrom: getTextContent(getFirstChildElement(identifiers, 'header_from')),
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