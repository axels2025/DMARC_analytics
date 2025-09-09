import { unifiedEmailService, EmailProvider, getProviderFromConfig } from './emailProviderInterface';
import { gmailAuthService } from './gmailAuth';
import { parseDmarcXml } from '@/utils/dmarcParser';
import { saveDmarcReport } from '@/utils/dmarcDatabase';
import { supabase } from '@/integrations/supabase/client';


type ProgressCallback = (progress: { phase: 'searching' | 'downloading' | 'processing' | 'completed' | 'error'; message: string; emailsFound?: number; attachmentsFound?: number; processed?: number; skipped?: number; errors?: number; }) => void;

// Backward-compatible email processor that automatically detects provider
class LegacyEmailProcessor {
  // Process DMARC reports for any provider (automatically detects Gmail/Microsoft)
  async syncDmarcReports(
    configId: string,
    userId: string,
    onProgress?: ProgressCallback,
    isRetry: boolean = false
  ): Promise<{
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
  }> {
    const startTime = Date.now();
    let syncLogId: string | null = null;
    
    try {
      // Get config to determine provider
      const { data: configData, error: configError } = await supabase
        .from('user_email_configs')
        .select('provider')
        .eq('id', configId)
        .eq('user_id', userId)
        .single();

      if (configError || !configData) {
        throw new Error('Email configuration not found');
      }

      const provider = configData.provider as EmailProvider;
      
      // For backward compatibility, fall back to Gmail auth service for sync status updates
      await gmailAuthService.updateSyncStatus(configId, 'syncing');
      
      // Create sync log entry
      syncLogId = await this.createSyncLog(configId, userId);
      
      onProgress?.({
        phase: 'searching',
        message: `Getting ${provider} credentials...`
      });

      // Get credentials using unified service
      const credentials = await unifiedEmailService.getCredentials(configId, userId, provider);
      if (!credentials) {
        console.warn('[syncDmarcReports] No valid credentials found - likely need re-authentication');
        throw new Error(`${provider} authentication required. Please reconnect your ${provider} account to continue syncing.`);
      }

      console.log(`${provider} credentials obtained:`, {
        has_access_token: !!credentials.access_token,
        has_refresh_token: !!credentials.refresh_token,
        expires_at: credentials.expires_at,
        email: credentials.email
      });

      // Get config settings for search options
      let syncUnreadOnly = false;
      try {
        const { data: configSettings, error } = await supabase
          .from('user_email_configs')
          .select('sync_unread_only')
          .eq('id', configId)
          .single();
        
        if (error && !error.message.includes('sync_unread_only')) {
          throw error;
        }
        
        syncUnreadOnly = configSettings?.sync_unread_only ?? false;
        console.log(`[legacyEmailProcessor] Retrieved sync_unread_only setting: ${syncUnreadOnly}`, configSettings);
      } catch (error) {
        console.warn('sync_unread_only column not available, defaulting to false');
        syncUnreadOnly = false;
      }

      onProgress?.({
        phase: 'searching',
        message: `Searching for DMARC reports in ${provider}${syncUnreadOnly ? ' (unread emails only)' : ' (all emails)'}...`
      });

      // Search for DMARC reports using unified service
      const searchResult = await unifiedEmailService.searchDmarcReports(
        credentials, 
        { unreadOnly: syncUnreadOnly, maxResults: 100 }
      );
      const messages = searchResult.messages;

      const emailTypeDescription = syncUnreadOnly ? 'unread DMARC emails' : 'potential DMARC emails';
      
      if (messages.length === 0) {
        onProgress?.({
          phase: 'completed',
          message: 'No DMARC emails found.',
          emailsFound: 0,
          processed: 0,
          skipped: 0,
          errors: 0
        });
        
        return {
          success: true,
          emailsFound: 0,
          emailsFetched: 0,
          attachmentsFound: 0,
          reportsProcessed: 0,
          reportsSkipped: 0,
          emailsDeleted: 0,
          deletionEnabled: false,
          deletionErrors: 0,
          errors: [],
          duration: Date.now() - startTime
        };
      }
      
      onProgress?.({
        phase: 'downloading',
        message: `Found ${messages.length} ${emailTypeDescription}. Downloading attachments...`,
        emailsFound: messages.length
      });

      // Extract attachments using unified service
      const attachments = await unifiedEmailService.extractDmarcAttachments(credentials, messages);

      onProgress?.({
        phase: 'processing',
        message: `Found ${attachments.length} DMARC attachments. Decompressing and processing reports...`,
        attachmentsFound: attachments.length
      });

      // Check if deletion is enabled for this config
      let deletionEnabled = false;
      try {
        const { data: configData, error } = await supabase
          .from('user_email_configs')
          .select('delete_after_import')
          .eq('id', configId)
          .single();
        
        if (error && !error.message.includes('delete_after_import')) {
          throw error;
        }
        
        deletionEnabled = configData?.delete_after_import || false;
      } catch (error) {
        console.warn('delete_after_import column not available, defaulting to false');
        deletionEnabled = false;
      }

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
          const deletionResult = await unifiedEmailService.bulkDeleteEmails(
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
      
      const result = {
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
        
      const emailDeletionMessage = result.emailsDeleted > 0 
        ? `, deleted ${result.emailsDeleted} emails from ${provider}` 
        : result.deletionEnabled 
          ? `, left emails in ${provider}` 
          : '';
      
      const syncModeMessage = syncUnreadOnly ? ' from unread emails' : '';
      
      onProgress?.({
        phase: 'completed',
        message: `Sync completed! Processed ${result.reportsProcessed} reports${syncModeMessage}${compressionMessage}, skipped ${result.reportsSkipped} duplicates${emailDeletionMessage}.`,
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
          // For backward compatibility, use Gmail auth service for token refresh
          const refreshedCredentials = await gmailAuthService.refreshTokenForConfig(configId, userId);
          if (refreshedCredentials) {
            console.log('Token refreshed successfully, retrying sync...');
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
        finalErrorMessage = 'Authentication expired. Please reconnect your account.';
      } else if (errorMessage.includes('Failed to decrypt token') || errorMessage.includes('decryption failed')) {
        finalErrorMessage = 'Authentication corrupted. Please reconnect your account.';
      } else if (errorMessage.includes('authentication required')) {
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
    attachments: any[],
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ 
    processed: number; 
    skipped: number; 
    errors: string[];
    processedEmails: Array<{
      messageId: string;
      processed: boolean;
      metadata?: any;
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

  // Process a single DMARC attachment (may contain multiple XML files)
  private async processSingleAttachment(
    attachment: any,
    userId: string
  ): Promise<'processed' | 'skipped' | 'error'> {
    try {
      console.log(`[processSingleAttachment] Processing attachment: ${attachment.filename}`);
      
      // Decompress attachment using unified service
      const xmlContents = await unifiedEmailService.decompressAttachment(attachment);
      
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
        }
      }

      console.log(`Attachment ${attachment.filename}: processed ${processedCount}, skipped ${skippedCount}, errors ${errors.length}`);

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
      
      // Parse DMARC XML
      const dmarcReport = await parseDmarcXml(xmlContent);
      
      // Validate that parsing was successful and we have required fields
      if (!dmarcReport || !dmarcReport.reportMetadata || !dmarcReport.reportMetadata.reportId) {
        throw new Error('Invalid parsing result: missing report metadata or report ID');
      }
      
      console.log(`[processSingleReport] Successfully parsed report with ID: ${dmarcReport.reportMetadata.reportId}`);
      
      // Check if report already exists to avoid duplicates
      try {
        const { data: existingReport, error: duplicateError } = await supabase
          .from('dmarc_reports')
          .select('id')
          .eq('user_id', userId)
          .eq('report_id', dmarcReport.reportMetadata.reportId)
          .eq('org_name', dmarcReport.reportMetadata.orgName)
          .maybeSingle();

        if (duplicateError) {
          console.warn(`[processSingleReport] Duplicate check failed for ${dmarcReport.reportMetadata.reportId}: ${duplicateError.message}`);
        } else if (existingReport) {
          console.log(`Skipping duplicate report: ${dmarcReport.reportMetadata.reportId} from ${xmlFilename}`);
          return 'skipped';
        }
      } catch (duplicateCheckError) {
        console.warn(`[processSingleReport] Duplicate check error for ${dmarcReport.reportMetadata.reportId}:`, duplicateCheckError);
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

  // Test connection for any provider
  async testConnection(configId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    emailsFound?: number;
  }> {
    try {
      // Get config to determine provider
      const { data: configData, error: configError } = await supabase
        .from('user_email_configs')
        .select('provider')
        .eq('id', configId)
        .eq('user_id', userId)
        .single();

      if (configError || !configData) {
        return {
          success: false,
          message: 'Email configuration not found'
        };
      }

      const provider = configData.provider as EmailProvider;
      
      const credentials = await unifiedEmailService.getCredentials(configId, userId, provider);
      if (!credentials) {
        return {
          success: false,
          message: `Failed to get ${provider} credentials`
        };
      }

      // Test connection
      const connectionTest = await unifiedEmailService.testConnection(configId, userId, provider);
      if (!connectionTest) {
        return {
          success: false,
          message: `${provider} connection test failed. Please re-authenticate.`
        };
      }

      // Get config settings for search options
      let syncUnreadOnly = false;
      try {
        const { data: configSettings, error } = await supabase
          .from('user_email_configs')
          .select('sync_unread_only')
          .eq('id', configId)
          .single();
        
        if (error && !error.message.includes('sync_unread_only')) {
          throw error;
        }
        
        syncUnreadOnly = configSettings?.sync_unread_only ?? false;
      } catch (error) {
        console.warn('sync_unread_only column not available, defaulting to false in testConnection');
        syncUnreadOnly = false;
      }

      // Try to search for a small number of DMARC reports to test connection
      const searchResult = await unifiedEmailService.searchDmarcReports(
        credentials, 
        { unreadOnly: syncUnreadOnly, maxResults: 5 }
      );
      
      return {
        success: true,
        message: `${provider} connection test successful! Your account is properly configured.`,
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

export const legacyEmailProcessor = new LegacyEmailProcessor();