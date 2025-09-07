import { gmailService, DmarcAttachment } from './gmailService';
import { gmailAuthService } from './gmailAuth';
import { parseDmarcXml } from '@/utils/dmarcParser';
import { saveDmarcReport } from '@/utils/dmarcDatabase';
import { supabase } from '@/integrations/supabase/client';

// VERSION IDENTIFIER - Updated 2024-09-04 - Gzip Error Fallback
console.log('[emailProcessor] Loading version 2024-09-04-gzip-fallback');

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
  emailsFound: number;
  emailsFetched: number;
  attachmentsFound: number;
  reportsProcessed: number;
  reportsSkipped: number;
  emailsDeleted: number;
  deletionEnabled: boolean;
  deletionErrors: number;
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

      // Get credentials (this now handles automatic token refresh and corruption recovery)
      const credentials = await gmailAuthService.getCredentials(configId, userId);
      if (!credentials) {
        console.warn('[syncDmarcReports] No valid credentials found - likely need re-authentication');
        throw new Error('Gmail authentication required. Please reconnect your Gmail account to continue syncing.');
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

      // Check if deletion is enabled for this config
      const { data: configData } = await supabase
        .from('user_email_configs')
        .select('delete_after_import')
        .eq('id', configId)
        .single();
      
      const deletionEnabled = configData?.delete_after_import || false;

      // Process each attachment and track which emails were successfully processed
      const results = await this.processAttachmentsWithTracking(attachments, userId, onProgress);
      
      let emailsDeleted = 0;
      let deletionErrors = 0;
      const deletedEmailsMetadata: any[] = [];
      
      // Handle email deletion if enabled and reports were processed OR skipped (duplicates)
      if (deletionEnabled && results.processedEmails.length > 0) {
        const eligibleEmails = results.processedEmails.filter(email => email.processed);
        
        onProgress?.({
          phase: 'processing',
          message: `Processing completed. Deleting ${eligibleEmails.length} emails (including duplicates)...`,
          processed: results.processed,
          skipped: results.skipped,
          errors: results.errors.length
        });

        try {
          const deletionResult = await gmailService.bulkDeleteEmails(
            credentials,
            eligibleEmails.map(email => ({
              messageId: email.messageId,
              processed: email.processed,
              metadata: email.metadata
            }))
          );

          emailsDeleted = deletionResult.totalDeleted;
          deletionErrors = deletionResult.totalErrors;
          
          // Store deletion audit trail
          for (const deletedEmail of deletionResult.deletedEmails) {
            if (deletedEmail.success && deletedEmail.deleted && deletedEmail.metadata) {
              deletedEmailsMetadata.push({
                messageId: deletedEmail.messageId,
                subject: deletedEmail.metadata.subject,
                sender: deletedEmail.metadata.sender,
                deletedAt: new Date().toISOString(),
                attachmentFilenames: deletedEmail.metadata.attachmentFilenames
              });
            }
          }

        } catch (deletionError) {
          console.error('Email deletion failed:', deletionError);
          deletionErrors++;
          results.errors.push(`Email deletion failed: ${deletionError instanceof Error ? deletionError.message : 'Unknown error'}`);
        }
      }
      
      const result: SyncResult = {
        success: true,
        emailsFound: messages.length,
        emailsFetched: messages.length,
        attachmentsFound: attachments.length,
        reportsProcessed: results.processed,
        reportsSkipped: results.skipped,
        emailsDeleted,
        deletionEnabled,
        deletionErrors,
        errors: results.errors,
        duration: Date.now() - startTime
      };

      // Update sync log with final results
      if (syncLogId) {
        await this.updateSyncLog(syncLogId, {
          status: 'completed',
          sync_completed_at: new Date().toISOString(),
          emails_found: result.emailsFound,
          emails_fetched: result.emailsFetched,
          attachments_found: result.attachmentsFound,
          reports_processed: result.reportsProcessed,
          reports_skipped: result.reportsSkipped,
          emails_deleted: result.emailsDeleted,
          deletion_enabled: result.deletionEnabled,
          deletion_errors: result.deletionErrors,
          errors_count: result.errors.length + result.deletionErrors,
          error_details: result.errors.length > 0 ? { errors: result.errors } : null,
          deleted_emails_metadata: deletedEmailsMetadata,
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
        
      const deletionMessage = result.emailsDeleted > 0 ? `, deleted ${result.emailsDeleted} emails` : '';
      
      onProgress?.({
        phase: 'completed',
        message: `Sync completed! Processed ${result.reportsProcessed} reports${compressionMessage}, skipped ${result.reportsSkipped} duplicates${deletionMessage}.`,
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
          errors_count: 1,
          error_details: { error: errorMessage },
          error_message: errorMessage
        });
      }

      // Update config status
      await gmailAuthService.updateSyncStatus(configId, 'error', errorMessage);

      // Provide user-friendly error messages based on error type
      let finalErrorMessage = errorMessage;
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        finalErrorMessage = 'Gmail authentication expired. Please reconnect your account.';
      } else if (errorMessage.includes('Failed to decrypt token') || errorMessage.includes('decryption failed')) {
        finalErrorMessage = 'Gmail authentication corrupted. Please reconnect your Gmail account.';
      } else if (errorMessage.includes('Gmail authentication required')) {
        finalErrorMessage = errorMessage; // Already user-friendly
      } else {
        finalErrorMessage = errorMessage;
      }

      onProgress?.({
        phase: 'error',
        message: `Sync failed: ${finalErrorMessage}`
      });

      return {
        success: false,
        emailsFound: 0,
        emailsFetched: 0,
        attachmentsFound: 0,
        reportsProcessed: 0,
        reportsSkipped: 0,
        emailsDeleted: 0,
        deletionEnabled: false,
        deletionErrors: 0,
        errors: [finalErrorMessage],
        duration: Date.now() - startTime
      };
    }
  }

  // Process multiple attachments with email tracking for deletion
  private async processAttachmentsWithTracking(
    attachments: DmarcAttachment[],
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ 
    processed: number; 
    skipped: number; 
    errors: string[];
    processedEmails: Array<{
      messageId: string;
      processed: boolean;
      metadata?: {
        subject?: string;
        sender?: string;
        dateReceived?: Date;
        attachmentFilenames?: string[];
      };
    }>;
  }> {
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];
    const emailTracker = new Map<string, { 
      processed: boolean; 
      attachmentCount: number; 
      successfulCount: number;
      metadata?: any;
    }>();

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

        // Track email processing for deletion decision
        const messageId = attachment.messageId;
        if (!emailTracker.has(messageId)) {
          emailTracker.set(messageId, {
            processed: false,
            attachmentCount: 0,
            successfulCount: 0,
            metadata: {
              subject: `Email with ${attachment.filename}`,
              sender: 'Unknown',
              dateReceived: attachment.date,
              attachmentFilenames: []
            }
          });
        }

        const emailData = emailTracker.get(messageId)!;
        emailData.attachmentCount++;
        emailData.metadata.attachmentFilenames.push(attachment.filename);

        const result = await this.processSingleAttachment(attachment, userId);
        
        if (result === 'processed') {
          processed++;
          emailData.successfulCount++;
        } else if (result === 'skipped') {
          skipped++;
          emailData.successfulCount++; // Skipped means it existed, which is still successful processing
        }

        // Mark email as successfully processed if ALL its attachments were processed or skipped
        // This means we can safely delete emails containing duplicate reports
        emailData.processed = emailData.successfulCount === emailData.attachmentCount;

      } catch (error) {
        const errorMsg = `Error processing ${attachment.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg, error);
        
        // Email with failed attachments should not be deleted
        const emailData = emailTracker.get(attachment.messageId);
        if (emailData) {
          emailData.processed = false; // Mark as failed to prevent deletion
        }
        
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

    // Convert email tracker to array for deletion processing
    const processedEmails = Array.from(emailTracker.entries()).map(([messageId, data]) => ({
      messageId,
      processed: data.processed,
      metadata: data.metadata
    }));

    return { processed, skipped, errors, processedEmails };
  }

  // Process multiple attachments (legacy method for backward compatibility)
  private async processAttachments(
    attachments: DmarcAttachment[],
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ processed: number; skipped: number; errors: string[] }> {
    const result = await this.processAttachmentsWithTracking(attachments, userId, onProgress);
    return {
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors
    };
  }

  // Process a single DMARC attachment (may contain multiple XML files)
  private async processSingleAttachment(
    attachment: DmarcAttachment,
    userId: string
  ): Promise<'processed' | 'skipped' | 'error'> {
    try {
      // Decompress attachment - returns array of XML content strings
      console.log(`[processSingleAttachment] Processing attachment: ${attachment.filename}`);
      console.log(`[processSingleAttachment] Calling gmailService.decompressAttachment for ${attachment.filename}`);
      
      let xmlContents: string[];
      
      try {
        xmlContents = await gmailService.decompressAttachment(attachment);
      } catch (error) {
        // FAILSAFE: Catch the "Compressed files not yet supported" error from cached code
        if (error instanceof Error && error.message.includes('Compressed files not yet supported')) {
          console.warn(`[processSingleAttachment] Detected legacy "Compressed files not yet supported" error for ${attachment.filename}`);
          console.log(`[processSingleAttachment] Attempting direct fallback gzip decompression...`);
          
          // Try direct gzip decompression as fallback
          if (attachment.filename.toLowerCase().endsWith('.gz') || attachment.filename.toLowerCase().endsWith('.gzip')) {
            try {
              // Import pako locally for fallback
              const pako = await import('pako');
              
              // Basic base64 to Uint8Array conversion for fallback
              const base64Data = attachment.data.replace(/-/g, '+').replace(/_/g, '/');
              const padding = base64Data.length % 4;
              const paddedBase64 = padding > 0 ? base64Data + '='.repeat(4 - padding) : base64Data;
              
              const binaryString = atob(paddedBase64);
              const uint8Array = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                uint8Array[i] = binaryString.charCodeAt(i);
              }
              
              const decompressed = pako.inflate(uint8Array, { to: 'string' });
              console.log(`[processSingleAttachment] Fallback gzip decompression successful: ${decompressed.length} characters`);
              xmlContents = [decompressed];
            } catch (fallbackError) {
              console.error(`[processSingleAttachment] Fallback gzip decompression failed:`, fallbackError);
              throw new Error(`Both primary and fallback decompression failed for ${attachment.filename}: ${error.message}`);
            }
          } else {
            throw error; // Re-throw if not a gzip file
          }
        } else {
          throw error; // Re-throw other errors
        }
      }
      
      console.log(`[processSingleAttachment] Successfully decompressed ${attachment.filename}, got ${xmlContents.length} XML content(s)`);
      
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
      console.log(`[processSingleReport] Processing ${xmlFilename}, XML content length: ${xmlContent.length} chars`);
      console.log(`[processSingleReport] XML preview: ${xmlContent.substring(0, 200)}...`);
      
      // Parse DMARC XML
      const dmarcReport = await parseDmarcXml(xmlContent);
      
      // Validate that parsing was successful and we have required fields
      if (!dmarcReport || !dmarcReport.reportMetadata || !dmarcReport.reportMetadata.reportId) {
        throw new Error('Invalid parsing result: missing report metadata or report ID');
      }
      
      console.log(`[processSingleReport] Successfully parsed report with ID: ${dmarcReport.reportMetadata.reportId}`);
      console.log(`[processSingleReport] Report org: ${dmarcReport.reportMetadata.orgName}`);
      
      // Validate report ID format (should not contain XML content)
      if (dmarcReport.reportMetadata.reportId.includes('<') || dmarcReport.reportMetadata.reportId.includes('>')) {
        throw new Error(`Invalid report ID format: contains XML characters: ${dmarcReport.reportMetadata.reportId.substring(0, 100)}`);
      }
      
      // Check if report already exists to avoid duplicates
      try {
        const { data: existingReport, error: duplicateError } = await supabase
          .from('dmarc_reports')
          .select('id')
          .eq('user_id', userId)
          .eq('report_id', dmarcReport.reportMetadata.reportId)
          .eq('org_name', dmarcReport.reportMetadata.orgName)
          .maybeSingle(); // Use maybeSingle instead of single to avoid errors when no results

        if (duplicateError) {
          console.warn(`[processSingleReport] Duplicate check failed for ${dmarcReport.reportMetadata.reportId}: ${duplicateError.message}`);
          // Continue processing - the database-level duplicate check will catch this if needed
        } else if (existingReport) {
          console.log(`Skipping duplicate report: ${dmarcReport.reportMetadata.reportId} from ${xmlFilename}`);
          return 'skipped';
        }
      } catch (duplicateCheckError) {
        console.warn(`[processSingleReport] Duplicate check error for ${dmarcReport.reportMetadata.reportId}:`, duplicateCheckError);
        // Continue processing - the database-level duplicate check will catch this if needed
      }

      // Save to database
      await saveDmarcReport(dmarcReport, xmlContent, userId);
      
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
    emails_found: number;
    emails_fetched: number;
    attachments_found: number;
    reports_processed: number;
    reports_skipped: number;
    emails_deleted: number;
    deletion_enabled: boolean;
    errors_count: number;
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
        emails_found: log.emails_found || 0,
        emails_fetched: log.emails_fetched || 0,
        attachments_found: log.attachments_found || 0,
        reports_processed: log.reports_processed || 0,
        reports_skipped: log.reports_skipped || 0,
        emails_deleted: log.emails_deleted || 0,
        deletion_enabled: log.deletion_enabled || false,
        errors_count: log.errors_count || 0,
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