import { gmailService, DmarcAttachment } from './gmailService';
import { gmailAuthService } from './gmailAuth';
import { parseDmarcXml } from '@/utils/dmarcParser';
import { saveDmarcReport } from '@/utils/dmarcDatabase';
import { supabase } from '@/integrations/supabase/client';

export interface SyncProgress {
  phase: 'searching' | 'downloading' | 'processing' | 'completed' | 'error';
  message: string;
  emailsFound?: number;
  attachmentsFound?: number;
  processed?: number;
  skipped?: number;
  errors?: number;
}

export interface SyncResult {
  success: boolean;
  emailsFetched: number;
  reportsProcessed: number;
  reportsSkipped: number;
  errors: string[];
  duration: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

class EmailProcessor {
  // Process DMARC reports from Gmail for a specific config
  async syncDmarcReports(
    configId: string,
    userId: string,
    onProgress?: ProgressCallback,
    isRetry: boolean = false
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let syncLogId: string | null = null;
    
    try {
      // Update config status to syncing
      await gmailAuthService.updateSyncStatus(configId, 'syncing');
      
      // Create sync log entry
      syncLogId = await this.createSyncLog(configId, userId);
      
      onProgress?.({
        phase: 'searching',
        message: 'Getting Gmail credentials...'
      });

      // Get credentials (this now handles automatic token refresh)
      const credentials = await gmailAuthService.getCredentials(configId, userId);
      if (!credentials) {
        throw new Error('Gmail credentials not found or expired. Please reconnect your account.');
      }

      console.log('Gmail credentials obtained:', {
        has_access_token: !!credentials.access_token,
        has_refresh_token: !!credentials.refresh_token,
        expires_at: credentials.expires_at,
        email: credentials.email
      });

      onProgress?.({
        phase: 'searching',
        message: 'Searching for DMARC reports in Gmail...'
      });

      // Search for DMARC reports
      const searchResult = await gmailService.searchDmarcReports(credentials, 100);
      const messages = searchResult.messages;

      onProgress?.({
        phase: 'downloading',
        message: `Found ${messages.length} potential DMARC emails. Downloading attachments...`,
        emailsFound: messages.length
      });

      // Extract attachments
      const attachments = await gmailService.extractDmarcAttachments(credentials, messages);

      onProgress?.({
        phase: 'processing',
        message: `Found ${attachments.length} DMARC attachments. Decompressing and processing reports...`,
        attachmentsFound: attachments.length
      });

      // Process each attachment
      const results = await this.processAttachments(attachments, userId, onProgress);
      
      const result: SyncResult = {
        success: true,
        emailsFetched: messages.length,
        reportsProcessed: results.processed,
        reportsSkipped: results.skipped,
        errors: results.errors,
        duration: Date.now() - startTime
      };

      // Update sync log with final results
      if (syncLogId) {
        await this.updateSyncLog(syncLogId, {
          status: 'completed',
          sync_completed_at: new Date().toISOString(),
          emails_fetched: result.emailsFetched,
          reports_processed: result.reportsProcessed,
          reports_skipped: result.reportsSkipped,
          error_message: result.errors.length > 0 ? result.errors.join('; ') : null
        });
      }

      // Update config status
      await gmailAuthService.updateSyncStatus(
        configId, 
        result.errors.length > 0 ? 'error' : 'completed',
        result.errors.length > 0 ? result.errors.join('; ') : undefined
      );

      const compressionMessage = attachments.length > 0 ? 
        ` (including compressed .zip and .gz files)` : '';
        
      onProgress?.({
        phase: 'completed',
        message: `Sync completed! Processed ${result.reportsProcessed} reports${compressionMessage}, skipped ${result.reportsSkipped} duplicates.`,
        processed: result.reportsProcessed,
        skipped: result.reportsSkipped,
        errors: result.errors.length
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Handle 401 Unauthorized errors with token refresh retry
      if ((errorMessage.includes('401') || errorMessage.includes('Unauthorized')) && !isRetry) {
        console.log('Received 401 error, attempting to refresh token and retry...');
        
        onProgress?.({
          phase: 'searching',
          message: 'Authentication expired, refreshing credentials...'
        });

        try {
          const refreshedCredentials = await gmailAuthService.refreshTokenForConfig(configId, userId);
          if (refreshedCredentials) {
            console.log('Token refreshed successfully, retrying sync...');
            // Retry the sync once with new token
            return await this.syncDmarcReports(configId, userId, onProgress, true);
          } else {
            console.log('Token refresh failed - user needs to re-authenticate');
          }
        } catch (refreshError) {
          console.error('Token refresh attempt failed:', refreshError);
        }
      }
      
      // Update sync log with error
      if (syncLogId) {
        await this.updateSyncLog(syncLogId, {
          status: 'failed',
          sync_completed_at: new Date().toISOString(),
          error_message: errorMessage
        });
      }

      // Update config status
      await gmailAuthService.updateSyncStatus(configId, 'error', errorMessage);

      const finalErrorMessage = (errorMessage.includes('401') || errorMessage.includes('Unauthorized'))
        ? 'Gmail authentication expired. Please reconnect your account.'
        : errorMessage;

      onProgress?.({
        phase: 'error',
        message: `Sync failed: ${finalErrorMessage}`
      });

      return {
        success: false,
        emailsFetched: 0,
        reportsProcessed: 0,
        reportsSkipped: 0,
        errors: [finalErrorMessage],
        duration: Date.now() - startTime
      };
    }
  }

  // Process multiple attachments
  private async processAttachments(
    attachments: DmarcAttachment[],
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ processed: number; skipped: number; errors: string[] }> {
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      
      try {
        const fileType = attachment.filename.toLowerCase().endsWith('.zip') ? 'ZIP archive' :
                         attachment.filename.toLowerCase().endsWith('.gz') || attachment.filename.toLowerCase().endsWith('.gzip') ? 'gzipped file' :
                         'XML file';
                         
        onProgress?.({
          phase: 'processing',
          message: `Processing ${fileType}: ${attachment.filename} (${i + 1}/${attachments.length})...`,
          processed,
          skipped,
          errors: errors.length
        });

        const result = await this.processSingleAttachment(attachment, userId);
        
        if (result === 'processed') {
          processed++;
        } else if (result === 'skipped') {
          skipped++;
        }

      } catch (error) {
        const errorMsg = `Error processing ${attachment.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg, error);
        
        // Log additional details for XML parser errors specifically
        if (error instanceof Error && error.message.includes('XML parser error')) {
          console.error(`XML parsing failed for ${attachment.filename}. This is likely due to corrupted base64 decoding.`);
          console.error(`Attachment size: ${attachment.data.length} characters`);
        }
      }

      // Small delay to prevent overwhelming the system
      if (i < attachments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { processed, skipped, errors };
  }

  // Process a single DMARC attachment (may contain multiple XML files)
  private async processSingleAttachment(
    attachment: DmarcAttachment,
    userId: string
  ): Promise<'processed' | 'skipped' | 'error'> {
    try {
      // Decompress attachment - returns array of XML content strings
      const xmlContents = await gmailService.decompressAttachment(attachment);
      
      let processedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      // Process each XML file
      for (let i = 0; i < xmlContents.length; i++) {
        const xmlContent = xmlContents[i];
        const xmlFilename = xmlContents.length > 1 
          ? `${attachment.filename}_${i + 1}.xml` 
          : attachment.filename;
        
        try {
          const result = await this.processSingleReport(xmlContent, xmlFilename, userId);
          if (result === 'processed') {
            processedCount++;
          } else if (result === 'skipped') {
            skippedCount++;
          }
        } catch (error) {
          const errorMsg = `Error processing XML ${i + 1} from ${attachment.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg, error);
          
          // Log XML content preview for debugging
          if (xmlContent && typeof xmlContent === 'string') {
            console.error(`XML content preview (first 200 chars): ${xmlContent.substring(0, 200)}...`);
          }
        }
      }

      // Log results for this attachment
      console.log(`Attachment ${attachment.filename}: processed ${processedCount}, skipped ${skippedCount}, errors ${errors.length}`);

      // Return overall result - if any files were processed, consider it successful
      if (processedCount > 0) {
        return 'processed';
      } else if (skippedCount > 0 && errors.length === 0) {
        return 'skipped';
      } else {
        throw new Error(`Failed to process any reports from ${attachment.filename}. Errors: ${errors.join('; ')}`);
      }

    } catch (error) {
      console.error(`Failed to process attachment ${attachment.filename}:`, error);
      throw error;
    }
  }

  // Process a single DMARC XML report
  private async processSingleReport(
    xmlContent: string,
    xmlFilename: string,
    userId: string
  ): Promise<'processed' | 'skipped'> {
    try {
      // Parse DMARC XML
      const dmarcReport = await parseDmarcXml(xmlContent);
      
      // Check if report already exists to avoid duplicates
      const { data: existingReport } = await supabase
        .from('dmarc_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('report_id', dmarcReport.reportMetadata.reportId)
        .eq('org_name', dmarcReport.reportMetadata.orgName)
        .single();

      if (existingReport) {
        console.log(`Skipping duplicate report: ${dmarcReport.reportMetadata.reportId} from ${xmlFilename}`);
        return 'skipped';
      }

      // Save to database
      await saveDmarcReport(dmarcReport, userId, xmlContent);
      
      console.log(`Successfully processed DMARC report: ${dmarcReport.reportMetadata.reportId} from ${xmlFilename}`);
      return 'processed';

    } catch (error) {
      console.error(`Failed to process XML report from ${xmlFilename}:`, error);
      throw error;
    }
  }

  // Create sync log entry
  private async createSyncLog(configId: string, userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('email_sync_logs')
      .insert({
        config_id: configId,
        user_id: userId,
        sync_started_at: new Date().toISOString(),
        status: 'running'
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create sync log: ${error.message}`);
    }

    return data.id;
  }

  // Update sync log entry
  private async updateSyncLog(syncLogId: string, updates: any): Promise<void> {
    const { error } = await supabase
      .from('email_sync_logs')
      .update(updates)
      .eq('id', syncLogId);

    if (error) {
      console.error('Failed to update sync log:', error);
    }
  }

  // Get sync history for a config
  async getSyncHistory(configId: string, limit: number = 10): Promise<Array<{
    id: string;
    started_at: Date;
    completed_at: Date | null;
    status: string;
    emails_fetched: number;
    reports_processed: number;
    reports_skipped: number;
    error_message: string | null;
    duration: number | null;
  }>> {
    try {
      const { data, error } = await supabase
        .from('email_sync_logs')
        .select('*')
        .eq('config_id', configId)
        .order('sync_started_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []).map(log => ({
        id: log.id,
        started_at: new Date(log.sync_started_at),
        completed_at: log.sync_completed_at ? new Date(log.sync_completed_at) : null,
        status: log.status,
        emails_fetched: log.emails_fetched || 0,
        reports_processed: log.reports_processed || 0,
        reports_skipped: log.reports_skipped || 0,
        error_message: log.error_message,
        duration: log.sync_completed_at 
          ? new Date(log.sync_completed_at).getTime() - new Date(log.sync_started_at).getTime()
          : null
      }));
    } catch (error) {
      console.error('Error getting sync history:', error);
      return [];
    }
  }

  // Test the connection and ability to find DMARC reports
  async testConnection(configId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    emailsFound?: number;
  }> {
    try {
      const credentials = await gmailAuthService.getCredentials(configId, userId);
      if (!credentials) {
        return {
          success: false,
          message: 'Failed to get Gmail credentials'
        };
      }

      // Test connection first
      const connectionTest = await gmailAuthService.testConnection(configId, userId);
      if (!connectionTest) {
        return {
          success: false,
          message: 'Gmail connection test failed. Please re-authenticate.'
        };
      }

      // Try to search for a small number of DMARC reports
      const searchResult = await gmailService.searchDmarcReports(credentials, 5);
      
      return {
        success: true,
        message: `Connection successful! Found ${searchResult.messages.length} potential DMARC emails.`,
        emailsFound: searchResult.messages.length
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error during connection test'
      };
    }
  }
}

export const emailProcessor = new EmailProcessor();