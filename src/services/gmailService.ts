import { gmailAuthService, GmailAuthCredentials } from './gmailAuth';
import * as pako from 'pako';
import JSZip from 'jszip';

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<{
      mimeType: string;
      body: {
        data?: string;
        attachmentId?: string;
      };
      filename?: string;
    }>;
    body?: {
      data?: string;
    };
  };
  internalDate: string;
}

export interface DmarcAttachment {
  filename: string;
  data: string; // base64 encoded XML content
  messageId: string;
  date: Date;
}

class GmailService {
  private baseUrl = 'https://www.googleapis.com/gmail/v1/users/me';

  // Search for DMARC reports in Gmail
  async searchDmarcReports(
    credentials: GmailAuthCredentials,
    maxResults: number = 50,
    pageToken?: string
  ): Promise<{ messages: GmailMessage[]; nextPageToken?: string }> {
    try {
      // Search query for DMARC reports
      // Common patterns: attachments with .xml, .zip, .gz extensions and DMARC-related subjects
      const query = [
        'has:attachment',
        '(filename:xml OR filename:zip OR filename:gz)',
        '(subject:DMARC OR subject:"Report Domain" OR subject:"dmarc report" OR from:noreply-dmarc-support@google.com OR from:postmaster@yahoo.com OR from:dmarc-report@microsoft.com)'
      ].join(' ');

      const searchUrl = `${this.baseUrl}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Get detailed message information for each result
      const messages = await Promise.all(
        (data.messages || []).map((msg: { id: string }) => 
          this.getMessage(credentials, msg.id)
        )
      );

      return {
        messages: messages.filter(msg => msg !== null),
        nextPageToken: data.nextPageToken
      };
    } catch (error) {
      console.error('Error searching DMARC reports:', error);
      throw error;
    }
  }

  // Get detailed message information
  private async getMessage(credentials: GmailAuthCredentials, messageId: string): Promise<GmailMessage | null> {
    try {
      const response = await fetch(`${this.baseUrl}/messages/${messageId}`, {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to get message ${messageId}: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`Error getting message ${messageId}:`, error);
      return null;
    }
  }

  // Extract DMARC attachments from Gmail messages
  async extractDmarcAttachments(
    credentials: GmailAuthCredentials,
    messages: GmailMessage[]
  ): Promise<DmarcAttachment[]> {
    const attachments: DmarcAttachment[] = [];

    for (const message of messages) {
      try {
        const messageAttachments = await this.getMessageAttachments(credentials, message);
        attachments.push(...messageAttachments);
      } catch (error) {
        console.warn(`Failed to extract attachments from message ${message.id}:`, error);
      }
    }

    return attachments;
  }

  // Get attachments from a specific message
  private async getMessageAttachments(
    credentials: GmailAuthCredentials,
    message: GmailMessage
  ): Promise<DmarcAttachment[]> {
    const attachments: DmarcAttachment[] = [];

    if (!message.payload) {
      return attachments;
    }

    const messageDate = new Date(parseInt(message.internalDate));
    const parts = message.payload.parts || [];

    // Check main body for attachments
    if (message.payload.body?.attachmentId) {
      const attachment = await this.downloadAttachment(
        credentials,
        message.id,
        message.payload.body.attachmentId,
        'dmarc_report.xml' // Default filename
      );

      if (attachment && this.isDmarcFile(attachment.filename)) {
        attachments.push({
          ...attachment,
          messageId: message.id,
          date: messageDate
        });
      }
    }

    // Check all parts for attachments
    for (const part of parts) {
      if (part.body?.attachmentId && part.filename) {
        const attachment = await this.downloadAttachment(
          credentials,
          message.id,
          part.body.attachmentId,
          part.filename
        );

        if (attachment && this.isDmarcFile(attachment.filename)) {
          attachments.push({
            ...attachment,
            messageId: message.id,
            date: messageDate
          });
        }
      }
    }

    return attachments;
  }

  // Download attachment from Gmail
  private async downloadAttachment(
    credentials: GmailAuthCredentials,
    messageId: string,
    attachmentId: string,
    filename: string
  ): Promise<{ filename: string; data: string } | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/messages/${messageId}/attachments/${attachmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to download attachment: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        filename,
        data: data.data // This is base64 encoded
      };
    } catch (error) {
      console.error(`Error downloading attachment ${attachmentId}:`, error);
      return null;
    }
  }

  // Check if file is likely a DMARC report
  private isDmarcFile(filename: string): boolean {
    const lowerFilename = filename.toLowerCase();
    
    // Check for DMARC-related patterns in filename
    const dmarcPatterns = [
      'dmarc',
      'report',
      '.xml',
      '.zip',
      '.gz'
    ];

    return dmarcPatterns.some(pattern => lowerFilename.includes(pattern)) ||
           // Common DMARC report filename patterns
           /^[\w\.-]+![\w\.-]+!\d+!\d+\.xml/.test(lowerFilename) ||
           /dmarc.*\.xml$/.test(lowerFilename) ||
           /report.*domain.*\.xml$/.test(lowerFilename);
  }

  // Decompress attachment data if needed - returns array of XML content strings
  async decompressAttachment(attachment: DmarcAttachment): Promise<string[]> {
    const filename = attachment.filename.toLowerCase();
    
    try {
      // Decode base64
      const binaryData = atob(attachment.data.replace(/-/g, '+').replace(/_/g, '/'));
      const uint8Array = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
      }
      
      // Handle raw XML files
      if (filename.endsWith('.xml')) {
        return [binaryData];
      }
      
      // Handle gzip compressed files
      if (filename.endsWith('.gz') || filename.endsWith('.gzip')) {
        try {
          const decompressed = pako.inflate(uint8Array, { to: 'string' });
          return [decompressed];
        } catch (error) {
          throw new Error(`Failed to decompress gzip file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Handle ZIP archives
      if (filename.endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(uint8Array);
          const xmlFiles: string[] = [];
          
          // Extract all XML files from the zip
          for (const [entryFilename, file] of Object.entries(zip.files)) {
            if (!file.dir && entryFilename.toLowerCase().endsWith('.xml')) {
              try {
                const content = await file.async('string');
                xmlFiles.push(content);
              } catch (error) {
                console.warn(`Failed to extract ${entryFilename} from ZIP:`, error);
              }
            }
          }
          
          if (xmlFiles.length === 0) {
            throw new Error(`No XML files found in ZIP archive ${filename}`);
          }
          
          console.log(`Extracted ${xmlFiles.length} XML files from ${filename}`);
          return xmlFiles;
        } catch (error) {
          throw new Error(`Failed to decompress ZIP file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      throw new Error(`Unsupported file format: ${filename}. Supported formats: .xml, .gz, .gzip, .zip`);
    } catch (error) {
      console.error(`Error decompressing attachment ${filename}:`, error);
      throw error;
    }
  }

  // Get recent sync statistics
  async getSyncStats(configId: string): Promise<{
    lastSync: Date | null;
    totalSyncs: number;
    recentSyncs: Array<{
      date: Date;
      emailsFetched: number;
      reportsProcessed: number;
      status: string;
    }>;
  }> {
    try {
      const { data, error } = await supabase
        .from('email_sync_logs')
        .select('*')
        .eq('config_id', configId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        throw error;
      }

      const logs = data || [];
      
      return {
        lastSync: logs.length > 0 ? new Date(logs[0].sync_started_at) : null,
        totalSyncs: logs.length,
        recentSyncs: logs.map(log => ({
          date: new Date(log.sync_started_at),
          emailsFetched: log.emails_fetched || 0,
          reportsProcessed: log.reports_processed || 0,
          status: log.status
        }))
      };
    } catch (error) {
      console.error('Error getting sync stats:', error);
      return {
        lastSync: null,
        totalSyncs: 0,
        recentSyncs: []
      };
    }
  }
}

export const gmailService = new GmailService();

// Import supabase client
import { supabase } from '@/integrations/supabase/client';