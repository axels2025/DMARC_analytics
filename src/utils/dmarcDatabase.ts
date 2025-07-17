import { supabase } from '@/integrations/supabase/client';
import { DmarcReport } from './dmarcParser';

export async function saveDmarcReport(
  report: DmarcReport, 
  rawXml: string, 
  userId: string
): Promise<string> {
  try {
    // Insert main report
    const { data: reportData, error: reportError } = await supabase
      .from('dmarc_reports')
      .insert({
        user_id: userId,
        domain: report.policyPublished.domain,
        org_name: report.reportMetadata.orgName,
        org_email: report.reportMetadata.email,
        report_id: report.reportMetadata.reportId,
        date_range_begin: report.reportMetadata.dateRange.begin,
        date_range_end: report.reportMetadata.dateRange.end,
        policy_domain: report.policyPublished.domain,
        policy_dkim: report.policyPublished.dkim,
        policy_spf: report.policyPublished.spf,
        policy_p: report.policyPublished.p,
        policy_sp: report.policyPublished.sp,
        policy_pct: report.policyPublished.pct,
        raw_xml: rawXml,
      })
      .select('id')
      .single();

    if (reportError) {
      throw new Error(`Failed to save report: ${reportError.message}`);
    }

    const reportId = reportData.id;

    // Insert records
    for (const record of report.records) {
      const { data: recordData, error: recordError } = await supabase
        .from('dmarc_records')
        .insert({
          report_id: reportId,
          source_ip: record.row.sourceIp,
          count: record.row.count,
          disposition: record.row.policyEvaluated.disposition,
          dkim_result: record.row.policyEvaluated.dkim,
          spf_result: record.row.policyEvaluated.spf,
          header_from: record.identifiers.headerFrom,
        })
        .select('id')
        .single();

      if (recordError) {
        throw new Error(`Failed to save record: ${recordError.message}`);
      }

      const recordDbId = recordData.id;

      // Insert DKIM auth results
      if (record.authResults.dkim) {
        for (const dkim of record.authResults.dkim) {
          const { error: dkimError } = await supabase
            .from('dmarc_auth_results')
            .insert({
              record_id: recordDbId,
              auth_type: 'dkim',
              domain: dkim.domain,
              selector: dkim.selector,
              result: dkim.result,
            });

          if (dkimError) {
            throw new Error(`Failed to save DKIM auth result: ${dkimError.message}`);
          }
        }
      }

      // Insert SPF auth results
      if (record.authResults.spf) {
        for (const spf of record.authResults.spf) {
          const { error: spfError } = await supabase
            .from('dmarc_auth_results')
            .insert({
              record_id: recordDbId,
              auth_type: 'spf',
              domain: spf.domain,
              result: spf.result,
            });

          if (spfError) {
            throw new Error(`Failed to save SPF auth result: ${spfError.message}`);
          }
        }
      }
    }

    return reportId;
  } catch (error) {
    throw new Error(`Database save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function checkDuplicateReport(
  reportId: string, 
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('dmarc_reports')
    .select('id')
    .eq('report_id', reportId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Duplicate check failed: ${error.message}`);
  }

  return !!data;
}