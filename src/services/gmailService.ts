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
        const errorText = await response.text();
        console.error('Gmail API error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
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

  // Helper method to properly decode URL-safe base64 to Uint8Array
  private base64ToUint8Array(base64: string): Uint8Array {
    try {
      // Handle URL-safe base64: convert to regular base64
      let regularBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
      
      // Add padding if needed
      const padding = regularBase64.length % 4;
      if (padding > 0) {
        regularBase64 += '='.repeat(4 - padding);
      }
      
      // Log for debugging
      console.log(`Base64 decode: input length=${base64.length}, with padding length=${regularBase64.length}`);
      
      // Use modern approach with Uint8Array.from and atob
      const binaryString = atob(regularBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log(`Base64 decode: output ${bytes.length} bytes`);
      return bytes;
    } catch (error) {
      console.error('Base64 decode error:', error);
      throw new Error(`Failed to decode base64 data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Validate XML content
  private validateXmlContent(content: string, filename: string): void {
    if (!content || typeof content !== 'string') {
      throw new Error(`Invalid content: expected string, got ${typeof content}`);
    }
    
    // Trim whitespace
    content = content.trim();
    
    if (content.length === 0) {
      throw new Error('Empty content after decoding');
    }
    
    // Check if content starts with XML declaration or root element
    if (!content.startsWith('<')) {
      console.error(`Invalid XML content start for ${filename}:`, content.substring(0, 100));
      throw new Error(`Content does not appear to be valid XML (doesn't start with '<')`);
    }
    
    // Check for common XML patterns
    if (!content.includes('<feedback>') && !content.includes('<report>') && !content.includes('<?xml')) {
      console.warn(`Content for ${filename} may not be a DMARC report (missing expected XML elements)`);
    }
    
    console.log(`XML validation passed for ${filename}: ${content.length} characters, starts with: ${content.substring(0, 50)}...`);
  }

  // Decompress attachment data if needed - returns array of XML content strings
  async decompressAttachment(attachment: DmarcAttachment): Promise<string[]> {
    const filename = attachment.filename.toLowerCase();
    
    try {
      console.log(`Processing attachment: ${filename}, base64 length: ${attachment.data.length}`);
      
      // Decode base64 using proper URL-safe decoding
      const uint8Array = this.base64ToUint8Array(attachment.data);
      console.log(`Decoded ${uint8Array.length} bytes from base64 for ${filename}`);
      
      // Handle raw XML files
      if (filename.endsWith('.xml')) {
        const textDecoder = new TextDecoder('utf-8');
        const xmlContent = textDecoder.decode(uint8Array);
        console.log(`Raw XML file ${filename}: ${xmlContent.length} characters`);
        this.validateXmlContent(xmlContent, filename);
        return [xmlContent];
      }
      
      // Handle gzip compressed files
      if (filename.endsWith('.gz') || filename.endsWith('.gzip')) {
        try {
          console.log(`Decompressing gzip file ${filename}...`);
          const decompressed = pako.inflate(uint8Array, { to: 'string' });
          console.log(`Gzip decompression successful: ${decompressed.length} characters`);
          this.validateXmlContent(decompressed, filename);
          return [decompressed];
        } catch (error) {
          console.error(`Gzip decompression failed for ${filename}:`, error);
          throw new Error(`Failed to decompress gzip file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Handle ZIP archives
      if (filename.endsWith('.zip')) {
        try {
          console.log(`Loading ZIP archive ${filename}...`);
          const zip = await JSZip.loadAsync(uint8Array);
          const xmlFiles: string[] = [];
          
          console.log(`ZIP archive contains ${Object.keys(zip.files).length} files`);
          
          // Extract all XML files from the zip
          for (const [entryFilename, file] of Object.entries(zip.files)) {
            if (!file.dir && entryFilename.toLowerCase().endsWith('.xml')) {
              try {
                console.log(`Extracting XML file: ${entryFilename}`);
                const content = await file.async('string');
                console.log(`Extracted ${content.length} characters from ${entryFilename}`);
                this.validateXmlContent(content, entryFilename);
                xmlFiles.push(content);
              } catch (error) {
                console.warn(`Failed to extract ${entryFilename} from ZIP:`, error);
              }
            }
          }
          
          if (xmlFiles.length === 0) {
            const allFiles = Object.keys(zip.files).join(', ');
            throw new Error(`No XML files found in ZIP archive ${filename}. Found files: ${allFiles}`);
          }
          
          console.log(`Successfully extracted ${xmlFiles.length} XML files from ${filename}`);
          return xmlFiles;
        } catch (error) {
          console.error(`ZIP processing failed for ${filename}:`, error);
          throw new Error(`Failed to decompress ZIP file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      throw new Error(`Unsupported file format: ${filename}. Supported formats: .xml, .gz, .gzip, .zip`);
    } catch (error) {
      console.error(`Error decompressing attachment ${filename}:`, error);
      console.error(`Attachment data preview:`, attachment.data.substring(0, 100) + '...');
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