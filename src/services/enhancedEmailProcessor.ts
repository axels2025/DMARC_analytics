import { supabase } from '@/integrations/supabase/client';
import { gmailService, EmailSearchOptions, GmailMessage } from './gmailService';
import { gmailAuthService } from './gmailAuth';

interface EmailProcessingResult {
  success: boolean;
  emailsFound: number;
  emailsProcessed: number;
  reportsProcessed: number;
  reportsSkipped: number;
  newEmails: number;
  duplicatesSkipped: number;
  emailsDeleted: number;
  deletionEnabled: boolean;
  deletionErrors: number;
  errors: string[];
  duration: number;
}

interface ProcessingProgress {
  phase: 'initializing' | 'searching' | 'deduplicating' | 'processing' | 'deleting' | 'completed';
  message: string;
  emailsFound?: number;
  processed?: number;
  skipped?: number;
  deleted?: number;
  errors?: number;
}

class EnhancedEmailProcessor {
  
  /**
   * Process emails with proper deduplication and incremental sync
   */
  async processEmails(
    configId: string,
    userId: string,
    onProgress?: (progress: ProcessingProgress) => void
  ): Promise<EmailProcessingResult> {
    const startTime = Date.now();
    
    try {
      onProgress?.({
        phase: 'initializing',
        message: 'Initializing email sync...'
      });

      // Get credentials and config
      const credentials = await gmailAuthService.getCredentials(configId, userId);
      if (!credentials) {
        throw new Error('Gmail credentials not available');
      }

      const config = await this.getEmailConfig(configId, userId);
      if (!config) {
        throw new Error('Email configuration not found');
      }

      // Build search options
      const searchOptions: EmailSearchOptions = {
        unreadOnly: config.sync_unread_only ?? true,
        maxResults: 50,
        afterDate: config.incremental_sync_enabled ? this.getLastSyncDate(config) : undefined
      };

      onProgress?.({
        phase: 'searching',
        message: `Searching for DMARC emails${searchOptions.unreadOnly ? ' (unread only)' : ''}...`
      });

      // Search for all DMARC emails with proper pagination
      const allMessages = await gmailService.processAllDmarcEmails(
        credentials,
        searchOptions,
        (progress) => onProgress?.({
          phase: 'searching',
          message: progress.message,
          emailsFound: progress.processed
        })
      );

      if (allMessages.length === 0) {
        onProgress?.({
          phase: 'completed',
          message: 'No DMARC emails found.',
          emailsFound: 0,
          processed: 0,
          skipped: 0
        });

        return {
          success: true,
          emailsFound: 0,
          emailsProcessed: 0,
          reportsProcessed: 0,
          reportsSkipped: 0,
          newEmails: 0,
          duplicatesSkipped: 0,
          errors: [],
          duration: Date.now() - startTime
        };
      }

      onProgress?.({
        phase: 'deduplicating',
        message: `Found ${allMessages.length} emails, checking for duplicates...`
      });

      // Deduplicate messages against database
      const { newMessages, duplicates } = await this.deduplicateMessages(
        userId, configId, allMessages
      );

      onProgress?.({
        phase: 'processing',
        message: `Processing ${newMessages.length} new emails (${duplicates.length} duplicates skipped)...`,
        emailsFound: allMessages.length,
        processed: 0,
        skipped: duplicates.length
      });

      // Process new messages
      let reportsProcessed = 0;
      let reportsSkipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < newMessages.length; i++) {
        const message = newMessages[i];
        
        try {
          await this.markMessageProcessing(userId, configId, message);
          
          // Process DMARC attachments
          const attachments = await gmailService.extractDmarcAttachments(credentials, message);
          
          if (attachments.length > 0) {
            // Process each attachment
            for (const attachment of attachments) {
              try {
                await this.processDmarcAttachment(attachment, userId);
                reportsProcessed++;
              } catch (error) {
                console.error('Failed to process attachment:', error);
                reportsSkipped++;
                errors.push(`Failed to process attachment from ${message.id}`);
              }
            }
            
            await this.markMessageCompleted(userId, configId, message, attachments.length);
          } else {
            await this.markMessageSkipped(userId, configId, message, 'No DMARC attachments found');
            reportsSkipped++;
          }
        } catch (error) {
          console.error('Failed to process message:', error);
          await this.markMessageFailed(userId, configId, message, error instanceof Error ? error.message : 'Unknown error');
          errors.push(`Failed to process email ${message.id}`);
        }

        onProgress?.({
          phase: 'processing',
          message: `Processing ${newMessages.length} new emails (${duplicates.length} duplicates skipped)...`,
          emailsFound: allMessages.length,
          processed: i + 1,
          skipped: duplicates.length + reportsSkipped,
          errors: errors.length
        });
      }

      // Handle email deletion if enabled
      let emailsDeleted = 0;
      let deletionErrors = 0;
      const deletionEnabled = config.delete_after_import ?? false;
      const processedMessages = newMessages.filter((_, i) => i < reportsProcessed);
      
      if (deletionEnabled && processedMessages.length > 0) {
        onProgress?.({
          phase: 'deleting',
          message: `Deleting ${processedMessages.length} processed emails...`,
          emailsFound: allMessages.length,
          processed: reportsProcessed,
          skipped: reportsSkipped + duplicates.length,
          deleted: 0
        });

        try {
          const deletionResults = await this.deleteProcessedEmails(
            credentials,
            processedMessages,
            (deletedCount) => {
              onProgress?.({
                phase: 'deleting',
                message: `Deleting processed emails... (${deletedCount}/${processedMessages.length})`,
                emailsFound: allMessages.length,
                processed: reportsProcessed,
                skipped: reportsSkipped + duplicates.length,
                deleted: deletedCount
              });
            }
          );
          
          emailsDeleted = deletionResults.deleted;
          deletionErrors = deletionResults.errors;
          
          if (deletionErrors > 0) {
            errors.push(`${deletionErrors} emails failed to delete`);
          }
        } catch (deletionError) {
          console.error('Email deletion failed:', deletionError);
          deletionErrors = processedMessages.length;
          errors.push(`Email deletion failed: ${deletionError instanceof Error ? deletionError.message : 'Unknown error'}`);
        }
      }

      // Update sync cursor for incremental sync
      if (newMessages.length > 0) {
        await this.updateSyncCursor(configId, allMessages);
      }

      const completedMessage = deletionEnabled 
        ? `Sync completed! Processed ${reportsProcessed} reports, deleted ${emailsDeleted} emails, skipped ${reportsSkipped + duplicates.length} items.`
        : `Sync completed! Processed ${reportsProcessed} reports, skipped ${reportsSkipped + duplicates.length} items.`;

      onProgress?.({
        phase: 'completed',
        message: completedMessage,
        emailsFound: allMessages.length,
        processed: reportsProcessed,
        skipped: reportsSkipped + duplicates.length,
        deleted: emailsDeleted,
        errors: errors.length
      });

      return {
        success: true,
        emailsFound: allMessages.length,
        emailsProcessed: newMessages.length,
        reportsProcessed,
        reportsSkipped,
        newEmails: newMessages.length,
        duplicatesSkipped: duplicates.length,
        emailsDeleted,
        deletionEnabled,
        deletionErrors,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      onProgress?.({
        phase: 'completed',
        message: `Sync failed: ${errorMessage}`,
        errors: 1
      });

      return {
        success: false,
        emailsFound: 0,
        emailsProcessed: 0,
        reportsProcessed: 0,
        reportsSkipped: 0,
        newEmails: 0,
        duplicatesSkipped: 0,
        emailsDeleted: 0,
        deletionEnabled: false,
        deletionErrors: 0,
        errors: [errorMessage],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Deduplicate messages against database tracking
   */
  private async deduplicateMessages(
    userId: string,
    configId: string,
    messages: GmailMessage[]
  ): Promise<{ newMessages: GmailMessage[]; duplicates: GmailMessage[] }> {
    
    try {
      // Get existing message IDs from database
      const messageIds = messages.map(m => m.id);
      
      const { data: existingMessages, error } = await supabase
        .from('email_message_tracking')
        .select('gmail_message_id')
        .eq('user_id', userId)
        .in('gmail_message_id', messageIds);

      if (error) {
        console.warn('Error checking for duplicates (table may not exist):', error);
        // If table doesn't exist or other error, process all messages to be safe
        return { newMessages: messages, duplicates: [] };
      }

      const existingIds = new Set(existingMessages.map(m => m.gmail_message_id));
      
      const newMessages = messages.filter(m => !existingIds.has(m.id));
      const duplicates = messages.filter(m => existingIds.has(m.id));
      
      console.log(`[deduplicateMessages] Total: ${messages.length}, New: ${newMessages.length}, Duplicates: ${duplicates.length}`);
      
      return { newMessages, duplicates };
    } catch (error) {
      console.warn('Deduplication failed, processing all messages:', error);
      return { newMessages: messages, duplicates: [] };
    }
  }

  /**
   * Mark message as being processed
   */
  private async markMessageProcessing(userId: string, configId: string, message: GmailMessage): Promise<void> {
    try {
      const subjectHeader = message.payload?.headers?.find(h => h.name.toLowerCase() === 'subject');
      const subject = subjectHeader?.value || '';
      const subjectHash = await this.hashString(subject);

      await supabase
        .from('email_message_tracking')
        .insert({
          user_id: userId,
          config_id: configId,
          gmail_message_id: message.id,
          gmail_thread_id: message.threadId,
          internal_date: parseInt(message.internalDate),
          subject_hash: subjectHash,
          processing_status: 'processing'
        });
    } catch (error) {
      console.warn('Failed to mark message as processing (table may not exist):', error);
      // Continue without tracking
    }
  }

  /**
   * Mark message as completed
   */
  private async markMessageCompleted(
    userId: string,
    configId: string,
    message: GmailMessage,
    reportsFound: number
  ): Promise<void> {
    try {
      await supabase
        .from('email_message_tracking')
        .update({
          processing_status: 'completed',
          dmarc_reports_found: reportsFound,
          dmarc_reports_processed: reportsFound,
          processed_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('gmail_message_id', message.id);
    } catch (error) {
      console.warn('Failed to mark message as completed:', error);
    }
  }

  /**
   * Mark message as failed
   */
  private async markMessageFailed(
    userId: string,
    configId: string,
    message: GmailMessage,
    error: string
  ): Promise<void> {
    try {
      await supabase
        .from('email_message_tracking')
        .update({
          processing_status: 'failed',
          last_error: error,
          processed_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('gmail_message_id', message.id);
    } catch (err) {
      console.warn('Failed to mark message as failed:', err);
    }
  }

  /**
   * Mark message as skipped
   */
  private async markMessageSkipped(
    userId: string,
    configId: string,
    message: GmailMessage,
    reason: string
  ): Promise<void> {
    try {
      await supabase
        .from('email_message_tracking')
        .update({
          processing_status: 'skipped',
          last_error: reason,
          processed_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('gmail_message_id', message.id);
    } catch (error) {
      console.warn('Failed to mark message as skipped:', error);
    }
  }

  /**
   * Get email configuration
   */
  private async getEmailConfig(configId: string, userId: string) {
    const { data, error } = await supabase
      .from('user_email_configs')
      .select('*')
      .eq('id', configId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching email config:', error);
      return null;
    }

    return data;
  }

  /**
   * Get last sync date for incremental sync
   */
  private getLastSyncDate(config: any): Date | undefined {
    if (!config.incremental_sync_enabled || !config.last_sync_at) {
      return undefined;
    }
    
    // Go back 1 day from last sync to account for any missed emails
    const lastSync = new Date(config.last_sync_at);
    lastSync.setDate(lastSync.getDate() - 1);
    return lastSync;
  }

  /**
   * Update sync cursor for next incremental sync
   */
  private async updateSyncCursor(configId: string, messages: GmailMessage[]): Promise<void> {
    if (messages.length === 0) return;

    try {
      // Use the latest internal date as cursor
      const latestMessage = messages.reduce((latest, current) => 
        parseInt(current.internalDate) > parseInt(latest.internalDate) ? current : latest
      );

      await supabase
        .from('user_email_configs')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_cursor: latestMessage.internalDate
        })
        .eq('id', configId);
    } catch (error) {
      console.warn('Failed to update sync cursor (columns may not exist):', error);
    }
  }

  /**
   * Hash string for deduplication
   */
  private async hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Process DMARC attachment (integrate with your existing parser)
   */
  private async processDmarcAttachment(attachment: any, userId: string): Promise<void> {
    console.log('Processing DMARC attachment:', attachment.filename);
    
    try {
      // Import and use existing DMARC parser and database functions
      const { parseDmarcXml } = await import('@/utils/dmarcParser');
      const { saveDmarcReport } = await import('@/utils/dmarcDatabase');
      
      // Decompress attachment if needed
      const xmlContents = await gmailService.decompressAttachment(attachment);
      
      // Process each XML file (in case of ZIP archives with multiple files)
      for (const xmlContent of xmlContents) {
        const parsed = await parseDmarcXml(xmlContent);
        // saveDmarcReport requires: report, rawXml, userId
        await saveDmarcReport(parsed, xmlContent, userId);
      }
    } catch (error) {
      console.error('Failed to process DMARC attachment:', error);
      throw error;
    }
  }

  /**
   * Delete processed emails with progress tracking
   */
  private async deleteProcessedEmails(
    credentials: any,
    messages: GmailMessage[],
    onProgress?: (deletedCount: number) => void
  ): Promise<{ deleted: number; errors: number }> {
    let deletedCount = 0;
    let errorCount = 0;
    
    console.log(`[deleteProcessedEmails] Starting deletion of ${messages.length} emails`);
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      try {
        // Add delay to respect Gmail API rate limits
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between deletions
        }
        
        const result = await gmailService.deleteEmail(credentials, message.id);
        
        if (result.success && result.deleted) {
          deletedCount++;
          console.log(`[deleteProcessedEmails] Successfully deleted email ${message.id}`);
        } else {
          errorCount++;
          console.warn(`[deleteProcessedEmails] Failed to delete email ${message.id}: ${result.error}`);
        }
        
        onProgress?.(deletedCount);
        
      } catch (error) {
        errorCount++;
        console.error(`[deleteProcessedEmails] Error deleting email ${message.id}:`, error);
      }
    }
    
    console.log(`[deleteProcessedEmails] Deletion completed: ${deletedCount} deleted, ${errorCount} errors`);
    
    return {
      deleted: deletedCount,
      errors: errorCount
    };
  }
}

export const enhancedEmailProcessor = new EnhancedEmailProcessor();