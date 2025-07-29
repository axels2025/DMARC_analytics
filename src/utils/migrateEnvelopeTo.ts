import { supabase } from '@/integrations/supabase/client';
import { parseDmarcXml } from './dmarcParser';

/**
 * Migrate existing DMARC records to populate envelope_to field from raw XML
 */
export async function migrateEnvelopeToData(userId: string): Promise<{
  migrated: number;
  errors: number;
  message: string;
}> {
  console.log('[migrateEnvelopeTo] Starting migration for user:', userId);
  
  try {
    // Get all reports that have raw_xml and records with null envelope_to
    const { data: reports, error: reportsError } = await supabase
      .from('dmarc_reports')
      .select(`
        id,
        raw_xml,
        report_id,
        dmarc_records!inner(id, envelope_to)
      `)
      .eq('user_id', userId)
      .not('raw_xml', 'is', null)
      .is('dmarc_records.envelope_to', null);

    if (reportsError) {
      throw new Error(`Failed to fetch reports: ${reportsError.message}`);
    }

    if (!reports || reports.length === 0) {
      return {
        migrated: 0,
        errors: 0,
        message: 'No reports need migration. All records already have envelope_to data.'
      };
    }

    console.log(`[migrateEnvelopeTo] Found ${reports.length} reports to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const report of reports) {
      try {
        if (!report.raw_xml) continue;

        console.log(`[migrateEnvelopeTo] Processing report ${report.report_id}`);

        // Parse the raw XML to extract envelope_to data
        const parsedReport = await parseDmarcXml(report.raw_xml);

        // Get existing records for this report
        const { data: existingRecords, error: recordsError } = await supabase
          .from('dmarc_records')
          .select('id, source_ip, count, header_from')
          .eq('report_id', report.id)
          .is('envelope_to', null);

        if (recordsError) {
          console.error(`[migrateEnvelopeTo] Error fetching records for report ${report.report_id}:`, recordsError);
          errorCount++;
          continue;
        }

        if (!existingRecords || existingRecords.length === 0) {
          continue;
        }

        // Match existing records with parsed records and update envelope_to
        for (const existingRecord of existingRecords) {
          // Find matching parsed record by source_ip, count, and header_from
          const matchingParsedRecord = parsedReport.records.find(pr => 
            pr.row.sourceIp === existingRecord.source_ip &&
            pr.row.count === existingRecord.count &&
            pr.identifiers.headerFrom === existingRecord.header_from
          );

          if (matchingParsedRecord && matchingParsedRecord.identifiers.envelopeTo) {
            // Update the existing record with envelope_to
            const { error: updateError } = await supabase
              .from('dmarc_records')
              .update({ envelope_to: matchingParsedRecord.identifiers.envelopeTo })
              .eq('id', existingRecord.id);

            if (updateError) {
              console.error(`[migrateEnvelopeTo] Error updating record ${existingRecord.id}:`, updateError);
              errorCount++;
            } else {
              migratedCount++;
              console.log(`[migrateEnvelopeTo] Updated record ${existingRecord.id} with envelope_to: ${matchingParsedRecord.identifiers.envelopeTo}`);
            }
          }
        }

      } catch (parseError) {
        console.error(`[migrateEnvelopeTo] Error processing report ${report.report_id}:`, parseError);
        errorCount++;
      }
    }

    const message = migratedCount > 0 
      ? `Successfully migrated ${migratedCount} records with ${errorCount} errors.`
      : errorCount > 0 
        ? `Migration completed with ${errorCount} errors. No records were updated.`
        : 'Migration completed successfully.';

    console.log(`[migrateEnvelopeTo] Migration complete: ${message}`);

    return {
      migrated: migratedCount,
      errors: errorCount,
      message
    };

  } catch (error) {
    console.error('[migrateEnvelopeTo] Migration failed:', error);
    return {
      migrated: 0,
      errors: 1,
      message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Check if user has records that need envelope_to migration
 */
export async function checkMigrationNeeded(userId: string): Promise<boolean> {
  try {
    // First get user's report IDs
    const { data: userReports, error: reportsError } = await supabase
      .from('dmarc_reports')
      .select('id')
      .eq('user_id', userId);

    if (reportsError || !userReports || userReports.length === 0) {
      return false;
    }

    const reportIds = userReports.map(r => r.id);

    // Check if any records from these reports have null envelope_to
    const { data: records, error } = await supabase
      .from('dmarc_records')
      .select('id')
      .in('report_id', reportIds)
      .is('envelope_to', null)
      .limit(1);

    if (error) {
      console.error('[checkMigrationNeeded] Error:', error);
      return false;
    }

    return (records?.length || 0) > 0;
  } catch (error) {
    console.error('[checkMigrationNeeded] Error:', error);
    return false;
  }
}