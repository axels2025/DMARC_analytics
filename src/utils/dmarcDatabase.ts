import { supabase } from '@/integrations/supabase/client';
import { DmarcReport, DmarcRecord } from './dmarcParser';

export async function saveDmarcReport(
  report: DmarcReport, 
  rawXml: string, 
  userId: string
): Promise<string> {
  console.log(`[saveDmarcReport] Starting save operation for report ${report.reportMetadata.reportId} by user ${userId}`);
  
  // CRITICAL: Double-check for duplicates just before saving to prevent race conditions
  console.log(`[saveDmarcReport] Final duplicate check before database operation`);
  const finalDuplicateCheck = await checkDuplicateReport(report.reportMetadata.reportId, userId);
  if (finalDuplicateCheck) {
    console.error(`[saveDmarcReport] DUPLICATE DETECTED in final check: ${report.reportMetadata.reportId}`);
    throw new Error(`Report ${report.reportMetadata.reportId} already exists in database`);
  }
  
  // Use manual transaction handling with proper error recovery
  return await saveDmarcReportManual(report, rawXml, userId);
}

async function saveDmarcReportManual(
  report: DmarcReport, 
  rawXml: string, 
  userId: string
): Promise<string> {
  console.log(`[saveDmarcReportManual] Starting manual save for report ${report.reportMetadata.reportId}`);
  
  let reportId: string | null = null;
  let allDataSaved = false; // Track if we've successfully saved everything
  
  try {
    // ONE MORE duplicate check right before insert (triple check for absolute safety)
    console.log(`[saveDmarcReportManual] Triple-checking for duplicates before insert`);
    const tripleCheck = await checkDuplicateReport(report.reportMetadata.reportId, userId);
    if (tripleCheck) {
      console.error(`[saveDmarcReportManual] DUPLICATE DETECTED in triple check: ${report.reportMetadata.reportId}`);
      throw new Error(`Report ${report.reportMetadata.reportId} already exists - detected in final safety check`);
    }

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
        include_in_dashboard: true, // Default new reports to be included
      })
      .select('id')
      .single();

    if (reportError) {
      console.error(`[saveDmarcReportManual] Failed to save main report:`, reportError);
      
      // Check if this is a duplicate error from database constraints
      if (reportError.message?.includes('duplicate') || reportError.message?.includes('unique') || reportError.code === '23505') {
        console.error(`[saveDmarcReportManual] Database detected duplicate constraint violation`);
        throw new Error(`Report ${report.reportMetadata.reportId} already exists - detected by database constraints`);
      }
      
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
      
      // Validate that reportId is properly set before processing records
      if (!reportId) {
        throw new Error(`Report ID is null when processing record ${i}. This should not happen.`);
      }
      
      const recordPromise = saveRecordWithAuthResults(reportId, record, i);
      recordPromises.push(recordPromise);
    }

    // Execute all record saves
    await Promise.all(recordPromises);
    console.log(`[saveDmarcReportManual] All records processed successfully`);
    
    // Mark that all data was saved successfully
    allDataSaved = true;
    console.log(`[saveDmarcReportManual] COMPLETE: All data saved successfully for report ${report.reportMetadata.reportId}`);

    return reportId;
    
  } catch (error) {
    console.error(`[saveDmarcReportManual] Error occurred:`, error);
    
    // If we have a reportId and NOT all data was saved, we need to clean up
    if (reportId && !allDataSaved) {
      console.error(`[saveDmarcReportManual] CRITICAL: Partial data detected, initiating cleanup for report ID: ${reportId}`);
      try {
        await cleanupPartialReport(reportId);
        console.log(`[saveDmarcReportManual] Cleanup successful - removed partial data`);
      } catch (cleanupError) {
        console.error(`[saveDmarcReportManual] CRITICAL: Cleanup failed - partial data may remain in database:`, cleanupError);
        // Log this as a critical issue that needs manual intervention
        console.error(`[saveDmarcReportManual] MANUAL CLEANUP REQUIRED for report ID: ${reportId}`);
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
        envelope_to: record.identifiers.envelopeTo,
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
  console.log(`[cleanupPartialReport] CRITICAL CLEANUP: Removing partial report data for ID: ${reportId}`);
  
  const cleanupErrors: string[] = [];
  
  try {
    // Step 1: Get all record IDs for this report first
    console.log(`[cleanupPartialReport] Step 1: Finding records for report ${reportId}`);
    const { data: recordIds, error: findError } = await supabase
      .from('dmarc_records')
      .select('id')
      .eq('report_id', reportId);
    
    if (findError) {
      cleanupErrors.push(`Failed to find records: ${findError.message}`);
    } else if (recordIds && recordIds.length > 0) {
      console.log(`[cleanupPartialReport] Found ${recordIds.length} records to clean up`);
      
      // Step 2: Delete auth results for those records
      console.log(`[cleanupPartialReport] Step 2: Deleting auth results`);
      const recordIdList = recordIds.map(r => r.id);
      const { error: authError } = await supabase
        .from('dmarc_auth_results')
        .delete()
        .in('record_id', recordIdList);

      if (authError) {
        cleanupErrors.push(`Failed to delete auth results: ${authError.message}`);
      } else {
        console.log(`[cleanupPartialReport] Auth results deleted successfully`);
      }
    }

    // Step 3: Delete records
    console.log(`[cleanupPartialReport] Step 3: Deleting records`);
    const { error: recordsError } = await supabase
      .from('dmarc_records')
      .delete()
      .eq('report_id', reportId);

    if (recordsError) {
      cleanupErrors.push(`Failed to delete records: ${recordsError.message}`);
    } else {
      console.log(`[cleanupPartialReport] Records deleted successfully`);
    }

    // Step 4: Delete main report
    console.log(`[cleanupPartialReport] Step 4: Deleting main report`);
    const { error: reportError } = await supabase
      .from('dmarc_reports')
      .delete()
      .eq('id', reportId);

    if (reportError) {
      cleanupErrors.push(`Failed to delete main report: ${reportError.message}`);
    } else {
      console.log(`[cleanupPartialReport] Main report deleted successfully`);
    }
    
    if (cleanupErrors.length === 0) {
      console.log(`[cleanupPartialReport] SUCCESS: Complete cleanup of report ${reportId}`);
    } else {
      console.error(`[cleanupPartialReport] PARTIAL CLEANUP: Some errors occurred:`, cleanupErrors);
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
  try {
    const { data, error } = await supabase
      .from('dmarc_reports')
      .select('id')
      .eq('report_id', reportId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      // Log the specific error but don't throw - this prevents processing from stopping
      console.warn(`[checkDuplicateReport] Warning - duplicate check failed for report ${reportId}: ${error.message}`);
      
      // For 406 errors, likely URL encoding issues, return false to continue processing
      if (error.message.includes('406') || error.message.includes('Not Acceptable')) {
        console.warn(`[checkDuplicateReport] 406 error detected - continuing with processing (may be duplicate but database constraints will prevent actual duplicate)`);
        return false;
      }
      
      throw new Error(`Duplicate check failed: ${error.message}`);
    }

    return !!data;
  } catch (error) {
    console.error(`[checkDuplicateReport] Unexpected error checking duplicate for report ${reportId}:`, error);
    throw error;
  }
}

export async function deleteDmarcReport(
  reportDbId: string, 
  userId: string
): Promise<void> {
  console.log(`[deleteDmarcReport] Starting deletion for report ${reportDbId} by user ${userId}`);
  
  try {
    // First verify the report belongs to the user for security
    const { data: reportData, error: verifyError } = await supabase
      .from('dmarc_reports')
      .select('id, report_id')
      .eq('id', reportDbId)
      .eq('user_id', userId)
      .single();

    if (verifyError) {
      console.error(`[deleteDmarcReport] Failed to verify report ownership:`, verifyError);
      throw new Error(`Failed to verify report ownership: ${verifyError.message}`);
    }

    if (!reportData) {
      console.error(`[deleteDmarcReport] Report not found or not owned by user`);
      throw new Error('Report not found or you do not have permission to delete it');
    }

    console.log(`[deleteDmarcReport] Verified ownership of report ${reportData.report_id}, proceeding with deletion`);

    // Use the existing cleanup function to perform the deletion
    await cleanupPartialReport(reportDbId);
    
    console.log(`[deleteDmarcReport] Successfully deleted report ${reportData.report_id}`);
    
  } catch (error) {
    console.error(`[deleteDmarcReport] Delete operation failed:`, error);
    throw new Error(`Failed to delete report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function updateReportDashboardInclusion(
  reportDbId: string, 
  userId: string, 
  includeInDashboard: boolean
): Promise<void> {
  console.log(`[updateReportDashboardInclusion] Updating dashboard inclusion for report ${reportDbId} to ${includeInDashboard}`);
  
  try {
    // First verify the report belongs to the user for security
    const { data: reportData, error: verifyError } = await supabase
      .from('dmarc_reports')
      .select('id, report_id')
      .eq('id', reportDbId)
      .eq('user_id', userId)
      .single();

    if (verifyError) {
      console.error(`[updateReportDashboardInclusion] Failed to verify report ownership:`, verifyError);
      throw new Error(`Failed to verify report ownership: ${verifyError.message}`);
    }

    if (!reportData) {
      console.error(`[updateReportDashboardInclusion] Report not found or not owned by user`);
      throw new Error('Report not found or you do not have permission to update it');
    }

    // Update the include_in_dashboard field
    const { error: updateError } = await supabase
      .from('dmarc_reports')
      .update({ include_in_dashboard: includeInDashboard })
      .eq('id', reportDbId)
      .eq('user_id', userId);

    if (updateError) {
      console.error(`[updateReportDashboardInclusion] Failed to update dashboard inclusion:`, updateError);
      throw new Error(`Failed to update dashboard inclusion: ${updateError.message}`);
    }

    console.log(`[updateReportDashboardInclusion] Successfully updated report ${reportData.report_id} dashboard inclusion to ${includeInDashboard}`);
    
  } catch (error) {
    console.error(`[updateReportDashboardInclusion] Update operation failed:`, error);
    throw new Error(`Failed to update dashboard inclusion: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}