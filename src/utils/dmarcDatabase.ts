import { supabase } from '@/integrations/supabase/client';
import { DmarcReport, DmarcRecord } from './dmarcParser';

export async function saveDmarcReport(
  report: DmarcReport, 
  rawXml: string, 
  userId: string
): Promise<string> {
  console.log(`[saveDmarcReport] Starting save operation for report ${report.reportMetadata.reportId} by user ${userId}`);
  
  try {
    // Use RPC for transaction-safe operation
    const { data: result, error: rpcError } = await supabase.rpc('save_dmarc_report_transaction', {
      p_user_id: userId,
      p_domain: report.policyPublished.domain,
      p_org_name: report.reportMetadata.orgName,
      p_org_email: report.reportMetadata.email,
      p_report_id: report.reportMetadata.reportId,
      p_date_range_begin: report.reportMetadata.dateRange.begin,
      p_date_range_end: report.reportMetadata.dateRange.end,
      p_policy_domain: report.policyPublished.domain,
      p_policy_dkim: report.policyPublished.dkim,
      p_policy_spf: report.policyPublished.spf,
      p_policy_p: report.policyPublished.p,
      p_policy_sp: report.policyPublished.sp,
      p_policy_pct: report.policyPublished.pct,
      p_raw_xml: rawXml,
      p_records: JSON.stringify(report.records)
    });

    if (rpcError) {
      console.error(`[saveDmarcReport] RPC transaction failed:`, rpcError);
      throw new Error(`Transaction failed: ${rpcError.message}`);
    }

    if (!result) {
      console.error(`[saveDmarcReport] RPC returned null result`);
      throw new Error('Transaction returned no result');
    }

    console.log(`[saveDmarcReport] Successfully saved report with ID: ${result}`);
    return result;
    
  } catch (error) {
    console.error(`[saveDmarcReport] Operation failed:`, error);
    
    // Fallback to manual transaction handling if RPC isn't available
    console.log(`[saveDmarcReport] Falling back to manual transaction handling`);
    return await saveDmarcReportManual(report, rawXml, userId);
  }
}

async function saveDmarcReportManual(
  report: DmarcReport, 
  rawXml: string, 
  userId: string
): Promise<string> {
  console.log(`[saveDmarcReportManual] Starting manual save for report ${report.reportMetadata.reportId}`);
  
  let reportId: string | null = null;
  
  try {
    // Insert main report
    console.log(`[saveDmarcReportManual] Inserting main report record`);
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
      console.error(`[saveDmarcReportManual] Failed to save main report:`, reportError);
      throw new Error(`Failed to save report: ${reportError.message}`);
    }

    reportId = reportData.id;
    console.log(`[saveDmarcReportManual] Main report saved with ID: ${reportId}`);

    // Insert records with better error handling
    const recordPromises = [];
    console.log(`[saveDmarcReportManual] Processing ${report.records.length} records`);
    
    for (let i = 0; i < report.records.length; i++) {
      const record = report.records[i];
      console.log(`[saveDmarcReportManual] Processing record ${i + 1}/${report.records.length} from IP ${record.row.sourceIp}`);
      
      const recordPromise = saveRecordWithAuthResults(recordId, record, i);
      recordPromises.push(recordPromise);
    }

    // Execute all record saves
    await Promise.all(recordPromises);
    console.log(`[saveDmarcReportManual] All records processed successfully`);

    return reportId;
    
  } catch (error) {
    console.error(`[saveDmarcReportManual] Error occurred:`, error);
    
    // If we have a reportId and encountered an error, try to clean up
    if (reportId) {
      console.log(`[saveDmarcReportManual] Attempting cleanup for report ID: ${reportId}`);
      try {
        await cleanupPartialReport(reportId);
        console.log(`[saveDmarcReportManual] Cleanup successful`);
      } catch (cleanupError) {
        console.error(`[saveDmarcReportManual] Cleanup failed:`, cleanupError);
      }
    }
    
    throw new Error(`Database save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function saveRecordWithAuthResults(reportId: string, record: DmarcRecord, index: number): Promise<void> {
  try {
    // Insert record
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
      console.error(`[saveRecordWithAuthResults] Failed to save record ${index}:`, recordError);
      throw new Error(`Failed to save record ${index}: ${recordError.message}`);
    }

    const recordDbId = recordData.id;
    console.log(`[saveRecordWithAuthResults] Record ${index} saved with ID: ${recordDbId}`);

    // Insert auth results in parallel
    const authPromises = [];

    // Insert DKIM auth results
    if (record.authResults.dkim) {
      for (let j = 0; j < record.authResults.dkim.length; j++) {
        const dkim = record.authResults.dkim[j];
        authPromises.push(
          supabase
            .from('dmarc_auth_results')
            .insert({
              record_id: recordDbId,
              auth_type: 'dkim',
              domain: dkim.domain,
              selector: dkim.selector,
              result: dkim.result,
            })
            .then(({ error }) => {
              if (error) {
                console.error(`[saveRecordWithAuthResults] DKIM auth result ${j} failed:`, error);
                throw new Error(`Failed to save DKIM auth result ${j}: ${error.message}`);
              }
            })
        );
      }
    }

    // Insert SPF auth results
    if (record.authResults.spf) {
      for (let k = 0; k < record.authResults.spf.length; k++) {
        const spf = record.authResults.spf[k];
        authPromises.push(
          supabase
            .from('dmarc_auth_results')
            .insert({
              record_id: recordDbId,
              auth_type: 'spf',
              domain: spf.domain,
              result: spf.result,
            })
            .then(({ error }) => {
              if (error) {
                console.error(`[saveRecordWithAuthResults] SPF auth result ${k} failed:`, error);
                throw new Error(`Failed to save SPF auth result ${k}: ${error.message}`);
              }
            })
        );
      }
    }

    if (authPromises.length > 0) {
      await Promise.all(authPromises);
      console.log(`[saveRecordWithAuthResults] All auth results for record ${index} saved`);
    }

  } catch (error) {
    console.error(`[saveRecordWithAuthResults] Failed processing record ${index}:`, error);
    throw error;
  }
}

async function cleanupPartialReport(reportId: string): Promise<void> {
  console.log(`[cleanupPartialReport] Cleaning up partial report: ${reportId}`);
  
  try {
    // Delete auth results first (foreign key dependency)
    const { error: authError } = await supabase
      .from('dmarc_auth_results')
      .delete()
      .in('record_id', 
        supabase
          .from('dmarc_records')
          .select('id')
          .eq('report_id', reportId)
      );

    if (authError) {
      console.error(`[cleanupPartialReport] Failed to delete auth results:`, authError);
    }

    // Delete records
    const { error: recordsError } = await supabase
      .from('dmarc_records')
      .delete()
      .eq('report_id', reportId);

    if (recordsError) {
      console.error(`[cleanupPartialReport] Failed to delete records:`, recordsError);
    }

    // Delete main report
    const { error: reportError } = await supabase
      .from('dmarc_reports')
      .delete()
      .eq('id', reportId);

    if (reportError) {
      console.error(`[cleanupPartialReport] Failed to delete main report:`, reportError);
    } else {
      console.log(`[cleanupPartialReport] Successfully cleaned up report: ${reportId}`);
    }

  } catch (error) {
    console.error(`[cleanupPartialReport] Cleanup operation failed:`, error);
    throw error;
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