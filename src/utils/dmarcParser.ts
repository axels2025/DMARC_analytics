import { parseString } from 'xml2js';

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

export async function parseDmarcXml(xmlContent: string): Promise<DmarcReport> {
  return new Promise((resolve, reject) => {
    parseString(xmlContent, { explicitArray: false }, (err, result) => {
      if (err) {
        reject(new Error(`XML parsing failed: ${err.message}`));
        return;
      }

      try {
        const feedback = result.feedback;
        
        if (!feedback) {
          throw new Error('Invalid DMARC report: Missing feedback element');
        }

        // Extract report metadata
        const reportMetadata = feedback.report_metadata;
        if (!reportMetadata) {
          throw new Error('Invalid DMARC report: Missing report_metadata');
        }

        // Extract policy published
        const policyPublished = feedback.policy_published;
        if (!policyPublished) {
          throw new Error('Invalid DMARC report: Missing policy_published');
        }

        // Extract records
        let records = feedback.record;
        if (!records) {
          throw new Error('Invalid DMARC report: Missing record data');
        }

        // Ensure records is an array
        if (!Array.isArray(records)) {
          records = [records];
        }

        const parsedReport: DmarcReport = {
          reportMetadata: {
            orgName: reportMetadata.org_name || '',
            email: reportMetadata.email || '',
            reportId: reportMetadata.report_id || '',
            dateRange: {
              begin: parseInt(reportMetadata.date_range?.begin || '0'),
              end: parseInt(reportMetadata.date_range?.end || '0'),
            },
          },
          policyPublished: {
            domain: policyPublished.domain || '',
            dkim: policyPublished.adkim || 'r',
            spf: policyPublished.aspf || 'r',
            p: policyPublished.p || 'none',
            sp: policyPublished.sp,
            pct: parseInt(policyPublished.pct || '100'),
          },
          records: records.map((record: any) => ({
            row: {
              sourceIp: record.row?.source_ip || '',
              count: parseInt(record.row?.count || '0'),
              policyEvaluated: {
                disposition: record.row?.policy_evaluated?.disposition || 'none',
                dkim: record.row?.policy_evaluated?.dkim || 'fail',
                spf: record.row?.policy_evaluated?.spf || 'fail',
              },
            },
            identifiers: {
              headerFrom: record.identifiers?.header_from || '',
            },
            authResults: {
              dkim: record.auth_results?.dkim ? 
                (Array.isArray(record.auth_results.dkim) ? 
                  record.auth_results.dkim : [record.auth_results.dkim])
                  .map((dkim: any) => ({
                    domain: dkim.domain || '',
                    selector: dkim.selector,
                    result: dkim.result || 'fail',
                  })) : [],
              spf: record.auth_results?.spf ? 
                (Array.isArray(record.auth_results.spf) ? 
                  record.auth_results.spf : [record.auth_results.spf])
                  .map((spf: any) => ({
                    domain: spf.domain || '',
                    result: spf.result || 'fail',
                  })) : [],
            },
          })),
        };

        resolve(parsedReport);
      } catch (error) {
        reject(new Error(`DMARC report parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  });
}

export function validateDmarcXml(xmlContent: string): { isValid: boolean; error?: string } {
  try {
    // Basic XML structure validation
    if (!xmlContent.includes('<feedback>') || !xmlContent.includes('</feedback>')) {
      return { isValid: false, error: 'Not a valid DMARC report XML file' };
    }

    // Check for required elements
    const requiredElements = ['report_metadata', 'policy_published', 'record'];
    for (const element of requiredElements) {
      if (!xmlContent.includes(`<${element}`)) {
        return { isValid: false, error: `Missing required element: ${element}` };
      }
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid XML format' };
  }
}