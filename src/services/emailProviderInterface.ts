import { gmailService, GmailMessage, DmarcAttachment as GmailDmarcAttachment, EmailSearchOptions as GmailSearchOptions, EmailSearchResult as GmailSearchResult } from './gmailService';
import { gmailAuthService, GmailAuthCredentials, EmailConfig } from './gmailAuth';
import { microsoftGraphService, GraphMessage, DmarcAttachment as MicrosoftDmarcAttachment, OutlookSearchOptions, EmailSearchResult as MicrosoftSearchResult } from './microsoftGraphService';
import { microsoftAuthService, MicrosoftAuthCredentials } from './microsoftAuthService';
// Unified EmailProvider enum
export enum EmailProvider {
  GMAIL = 'gmail',
  MICROSOFT = 'microsoft'
}

// Unified interfaces that work for both providers
export interface UnifiedCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: Date;
  email: string;
  provider: EmailProvider;
  account_id?: string; // For Microsoft
}

export interface UnifiedMessage {
  id: string;
  threadId: string;
  subject?: string;
  snippet: string;
  receivedDateTime: string;
  sender?: {
    email: string;
    name?: string;
  };
  hasAttachments: boolean;
  provider: EmailProvider;
  // Store original message for provider-specific operations
  originalMessage: GmailMessage | GraphMessage;
}

export interface UnifiedAttachment {
  filename: string;
  data: string; // base64 encoded content
  messageId: string;
  date: Date;
  provider: EmailProvider;
}

export interface UnifiedSearchOptions {
  unreadOnly: boolean;
  maxResults: number;
  afterDate?: Date;
  beforeDate?: Date;
}

export interface UnifiedSearchResult {
  messages: UnifiedMessage[];
  nextPageToken?: string;
  totalEstimate: number;
  query: string;
  provider: EmailProvider;
}

// Factory interface for creating provider-specific services
interface EmailServiceFactory {
  createAuthService(provider: EmailProvider): UnifiedAuthService;
  createEmailService(provider: EmailProvider): UnifiedEmailService;
}

// Unified authentication service interface
export interface UnifiedAuthService {
  provider: EmailProvider;
  isConfigured(): boolean;
  getConfigurationStatus(): Promise<{ configured: boolean; message: string; instructions?: string }>;
  startOAuthFlow(): Promise<UnifiedCredentials>;
  saveEmailConfig(credentials: UnifiedCredentials, userId: string): Promise<string>;
  getUserEmailConfigs(userId: string): Promise<EmailConfig[]>;
  getCredentials(configId: string, userId: string): Promise<UnifiedCredentials | null>;
  deleteEmailConfig(configId: string, userId: string): Promise<void>;
  toggleConfigStatus(configId: string, userId: string, isActive: boolean): Promise<void>;
  updateSyncStatus(configId: string, status: 'idle' | 'syncing' | 'error' | 'completed', errorMessage?: string): Promise<void>;
  testConnection(configId: string, userId: string): Promise<boolean>;
  updateDeletionPreference(configId: string, userId: string, deleteAfterImport: boolean, confirmationShown?: boolean): Promise<{ success: boolean; requiresReauth?: boolean; message?: string }>;
  updateSyncUnreadOnly(configId: string, userId: string, syncUnreadOnly: boolean): Promise<void>;
  forceReauthentication(userId: string): Promise<void>;
  checkDeletionPermissions(credentials: UnifiedCredentials): Promise<boolean>;
  upgradeToModifyPermissions(configId: string, userId: string): Promise<UnifiedCredentials>;
}

// Unified email service interface
export interface UnifiedEmailService {
  provider: EmailProvider;
  searchDmarcReports(credentials: UnifiedCredentials, options: UnifiedSearchOptions, pageToken?: string): Promise<UnifiedSearchResult>;
  processAllDmarcEmails(credentials: UnifiedCredentials, options: UnifiedSearchOptions, onProgress?: (progress: { processed: number; total: number; message: string }) => void): Promise<UnifiedMessage[]>;
  extractDmarcAttachments(credentials: UnifiedCredentials, messages: UnifiedMessage | UnifiedMessage[]): Promise<UnifiedAttachment[]>;
  decompressAttachment(attachment: UnifiedAttachment): Promise<string[]>;
  deleteEmail(credentials: UnifiedCredentials, messageId: string, emailMetadata?: any): Promise<{ success: boolean; deleted: boolean; error?: string; metadata?: any }>;
  bulkDeleteEmails(credentials: UnifiedCredentials, emailDeletions: Array<{ messageId: string; processed: boolean; metadata?: any; }>, maxDeletionsPerSecond?: number): Promise<{ totalAttempted: number; totalDeleted: number; totalSkipped: number; totalErrors: number; deletedEmails: Array<any>; }>;
}

// Gmail-specific implementations
class GmailAuthServiceWrapper implements UnifiedAuthService {
  provider = EmailProvider.GMAIL;

  isConfigured(): boolean {
    return gmailAuthService.isGmailConfigured();
  }

  async getConfigurationStatus(): Promise<{ configured: boolean; message: string; instructions?: string }> {
    return gmailAuthService.getConfigurationStatus();
  }

  async startOAuthFlow(): Promise<UnifiedCredentials> {
    const credentials = await gmailAuthService.startOAuthFlow();
    return this.toUnifiedCredentials(credentials);
  }

  async saveEmailConfig(credentials: UnifiedCredentials, userId: string): Promise<string> {
    const gmailCredentials = this.toGmailCredentials(credentials);
    return gmailAuthService.saveEmailConfig(gmailCredentials, userId);
  }

  async getUserEmailConfigs(userId: string): Promise<EmailConfig[]> {
    return gmailAuthService.getUserEmailConfigs(userId);
  }

  async getCredentials(configId: string, userId: string): Promise<UnifiedCredentials | null> {
    const credentials = await gmailAuthService.getCredentials(configId, userId);
    return credentials ? this.toUnifiedCredentials(credentials) : null;
  }

  async deleteEmailConfig(configId: string, userId: string): Promise<void> {
    return gmailAuthService.deleteEmailConfig(configId, userId);
  }

  async toggleConfigStatus(configId: string, userId: string, isActive: boolean): Promise<void> {
    return gmailAuthService.toggleConfigStatus(configId, userId, isActive);
  }

  async updateSyncStatus(configId: string, status: 'idle' | 'syncing' | 'error' | 'completed', errorMessage?: string): Promise<void> {
    return gmailAuthService.updateSyncStatus(configId, status, errorMessage);
  }

  async testConnection(configId: string, userId: string): Promise<boolean> {
    return gmailAuthService.testConnection(configId, userId);
  }

  async updateDeletionPreference(configId: string, userId: string, deleteAfterImport: boolean, confirmationShown?: boolean): Promise<{ success: boolean; requiresReauth?: boolean; message?: string }> {
    return gmailAuthService.updateDeletionPreference(configId, userId, deleteAfterImport, confirmationShown);
  }

  async updateSyncUnreadOnly(configId: string, userId: string, syncUnreadOnly: boolean): Promise<void> {
    return gmailAuthService.updateSyncUnreadOnly(configId, userId, syncUnreadOnly);
  }

  async forceReauthentication(userId: string): Promise<void> {
    return gmailAuthService.forceReauthentication(userId);
  }

  async checkDeletionPermissions(credentials: UnifiedCredentials): Promise<boolean> {
    const gmailCredentials = this.toGmailCredentials(credentials);
    return gmailAuthService.checkDeletionPermissions(gmailCredentials);
  }

  async upgradeToModifyPermissions(configId: string, userId: string): Promise<UnifiedCredentials> {
    const credentials = await gmailAuthService.upgradeToModifyPermissions(configId, userId);
    return this.toUnifiedCredentials(credentials);
  }

  private toUnifiedCredentials(credentials: GmailAuthCredentials): UnifiedCredentials {
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_at: credentials.expires_at,
      email: credentials.email,
      provider: EmailProvider.GMAIL
    };
  }

  private toGmailCredentials(credentials: UnifiedCredentials): GmailAuthCredentials {
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_at: credentials.expires_at,
      email: credentials.email
    };
  }
}

class GmailServiceWrapper implements UnifiedEmailService {
  provider = EmailProvider.GMAIL;

  async searchDmarcReports(credentials: UnifiedCredentials, options: UnifiedSearchOptions, pageToken?: string): Promise<UnifiedSearchResult> {
    const gmailCredentials = this.toGmailCredentials(credentials);
    const gmailOptions = this.toGmailSearchOptions(options);
    const result = await gmailService.searchDmarcReports(gmailCredentials, gmailOptions, pageToken);
    
    return {
      messages: result.messages.map(msg => this.toUnifiedMessage(msg)),
      nextPageToken: result.nextPageToken,
      totalEstimate: result.totalEstimate,
      query: result.query,
      provider: EmailProvider.GMAIL
    };
  }

  async processAllDmarcEmails(credentials: UnifiedCredentials, options: UnifiedSearchOptions, onProgress?: (progress: { processed: number; total: number; message: string }) => void): Promise<UnifiedMessage[]> {
    const gmailCredentials = this.toGmailCredentials(credentials);
    const gmailOptions = this.toGmailSearchOptions(options);
    const messages = await gmailService.processAllDmarcEmails(gmailCredentials, gmailOptions, onProgress);
    
    return messages.map(msg => this.toUnifiedMessage(msg));
  }

  async extractDmarcAttachments(credentials: UnifiedCredentials, messages: UnifiedMessage | UnifiedMessage[]): Promise<UnifiedAttachment[]> {
    const gmailCredentials = this.toGmailCredentials(credentials);
    const gmailMessages = Array.isArray(messages) 
      ? messages.map(msg => msg.originalMessage as GmailMessage)
      : [messages.originalMessage as GmailMessage];
    
    const attachments = await gmailService.extractDmarcAttachments(gmailCredentials, gmailMessages);
    
    return attachments.map(att => this.toUnifiedAttachment(att));
  }

  async decompressAttachment(attachment: UnifiedAttachment): Promise<string[]> {
    const gmailAttachment = this.toGmailAttachment(attachment);
    return gmailService.decompressAttachment(gmailAttachment);
  }

  async deleteEmail(credentials: UnifiedCredentials, messageId: string, emailMetadata?: any): Promise<{ success: boolean; deleted: boolean; error?: string; metadata?: any }> {
    const gmailCredentials = this.toGmailCredentials(credentials);
    return gmailService.deleteEmail(gmailCredentials, messageId, emailMetadata);
  }

  async bulkDeleteEmails(credentials: UnifiedCredentials, emailDeletions: Array<{ messageId: string; processed: boolean; metadata?: any; }>, maxDeletionsPerSecond?: number): Promise<{ totalAttempted: number; totalDeleted: number; totalSkipped: number; totalErrors: number; deletedEmails: Array<any>; }> {
    const gmailCredentials = this.toGmailCredentials(credentials);
    return gmailService.bulkDeleteEmails(gmailCredentials, emailDeletions, maxDeletionsPerSecond);
  }

  private toGmailCredentials(credentials: UnifiedCredentials): GmailAuthCredentials {
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_at: credentials.expires_at,
      email: credentials.email
    };
  }

  private toGmailSearchOptions(options: UnifiedSearchOptions): GmailSearchOptions {
    return {
      unreadOnly: options.unreadOnly,
      maxResults: options.maxResults,
      afterDate: options.afterDate,
      beforeDate: options.beforeDate
    };
  }

  private toUnifiedMessage(message: GmailMessage): UnifiedMessage {
    const headers = message.payload?.headers || [];
    const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
    
    return {
      id: message.id,
      threadId: message.threadId,
      subject: subjectHeader?.value,
      snippet: message.snippet,
      receivedDateTime: new Date(parseInt(message.internalDate)).toISOString(),
      sender: fromHeader ? {
        email: fromHeader.value,
        name: fromHeader.value
      } : undefined,
      hasAttachments: !!(message.payload?.parts?.some(part => part.body?.attachmentId)),
      provider: EmailProvider.GMAIL,
      originalMessage: message
    };
  }

  private toUnifiedAttachment(attachment: GmailDmarcAttachment): UnifiedAttachment {
    return {
      filename: attachment.filename,
      data: attachment.data,
      messageId: attachment.messageId,
      date: attachment.date,
      provider: EmailProvider.GMAIL
    };
  }

  private toGmailAttachment(attachment: UnifiedAttachment): GmailDmarcAttachment {
    return {
      filename: attachment.filename,
      data: attachment.data,
      messageId: attachment.messageId,
      date: attachment.date
    };
  }
}

// Microsoft-specific implementations
class MicrosoftAuthServiceWrapper implements UnifiedAuthService {
  provider = EmailProvider.MICROSOFT;

  isConfigured(): boolean {
    return microsoftAuthService.isMicrosoftConfigured();
  }

  async getConfigurationStatus(): Promise<{ configured: boolean; message: string; instructions?: string }> {
    return await microsoftAuthService.getConfigurationStatus();
  }

  async startOAuthFlow(): Promise<UnifiedCredentials> {
    const credentials = await microsoftAuthService.startOAuthFlow();
    return this.toUnifiedCredentials(credentials);
  }

  async saveEmailConfig(credentials: UnifiedCredentials, userId: string): Promise<string> {
    const microsoftCredentials = this.toMicrosoftCredentials(credentials);
    return microsoftAuthService.saveEmailConfig(microsoftCredentials, userId);
  }

  async getUserEmailConfigs(userId: string): Promise<EmailConfig[]> {
    return microsoftAuthService.getUserEmailConfigs(userId);
  }

  async getCredentials(configId: string, userId: string): Promise<UnifiedCredentials | null> {
    const credentials = await microsoftAuthService.getCredentials(configId, userId);
    return credentials ? this.toUnifiedCredentials(credentials) : null;
  }

  async deleteEmailConfig(configId: string, userId: string): Promise<void> {
    return microsoftAuthService.deleteEmailConfig(configId, userId);
  }

  async toggleConfigStatus(configId: string, userId: string, isActive: boolean): Promise<void> {
    return microsoftAuthService.toggleConfigStatus(configId, userId, isActive);
  }

  async updateSyncStatus(configId: string, status: 'idle' | 'syncing' | 'error' | 'completed', errorMessage?: string): Promise<void> {
    return microsoftAuthService.updateSyncStatus(configId, status, errorMessage);
  }

  async testConnection(configId: string, userId: string): Promise<boolean> {
    return microsoftAuthService.testConnection(configId, userId);
  }

  async updateDeletionPreference(configId: string, userId: string, deleteAfterImport: boolean, confirmationShown?: boolean): Promise<{ success: boolean; requiresReauth?: boolean; message?: string }> {
    return microsoftAuthService.updateDeletionPreference(configId, userId, deleteAfterImport, confirmationShown);
  }

  async updateSyncUnreadOnly(configId: string, userId: string, syncUnreadOnly: boolean): Promise<void> {
    return microsoftAuthService.updateSyncUnreadOnly(configId, userId, syncUnreadOnly);
  }

  async forceReauthentication(userId: string): Promise<void> {
    return microsoftAuthService.forceReauthentication(userId);
  }

  async checkDeletionPermissions(credentials: UnifiedCredentials): Promise<boolean> {
    const microsoftCredentials = this.toMicrosoftCredentials(credentials);
    return microsoftAuthService.checkDeletionPermissions(microsoftCredentials);
  }

  async upgradeToModifyPermissions(configId: string, userId: string): Promise<UnifiedCredentials> {
    const credentials = await microsoftAuthService.upgradeToModifyPermissions(configId, userId);
    return this.toUnifiedCredentials(credentials);
  }

  private toUnifiedCredentials(credentials: MicrosoftAuthCredentials): UnifiedCredentials {
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_at: credentials.expires_at,
      email: credentials.email,
      provider: EmailProvider.MICROSOFT,
      account_id: credentials.account_id
    };
  }

  private toMicrosoftCredentials(credentials: UnifiedCredentials): MicrosoftAuthCredentials {
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_at: credentials.expires_at,
      email: credentials.email,
      account_id: credentials.account_id
    };
  }
}

class MicrosoftServiceWrapper implements UnifiedEmailService {
  provider = EmailProvider.MICROSOFT;

  async searchDmarcReports(credentials: UnifiedCredentials, options: UnifiedSearchOptions, pageToken?: string): Promise<UnifiedSearchResult> {
    const microsoftCredentials = this.toMicrosoftCredentials(credentials);
    const outlookOptions = this.toOutlookSearchOptions(options);
    const result = await microsoftGraphService.searchDmarcReports(microsoftCredentials, outlookOptions, pageToken);
    
    return {
      messages: result.messages.map(msg => this.toUnifiedMessage(msg)),
      nextPageToken: result.nextPageToken,
      totalEstimate: result.totalEstimate,
      query: result.query,
      provider: EmailProvider.MICROSOFT
    };
  }

  async processAllDmarcEmails(credentials: UnifiedCredentials, options: UnifiedSearchOptions, onProgress?: (progress: { processed: number; total: number; message: string }) => void): Promise<UnifiedMessage[]> {
    const microsoftCredentials = this.toMicrosoftCredentials(credentials);
    const outlookOptions = this.toOutlookSearchOptions(options);
    const messages = await microsoftGraphService.processAllDmarcEmails(microsoftCredentials, outlookOptions, onProgress);
    
    return messages.map(msg => this.toUnifiedMessage(msg));
  }

  async extractDmarcAttachments(credentials: UnifiedCredentials, messages: UnifiedMessage | UnifiedMessage[]): Promise<UnifiedAttachment[]> {
    const microsoftCredentials = this.toMicrosoftCredentials(credentials);
    const graphMessages = Array.isArray(messages) 
      ? messages.map(msg => msg.originalMessage as GraphMessage)
      : [messages.originalMessage as GraphMessage];
    
    const attachments = await microsoftGraphService.extractDmarcAttachments(microsoftCredentials, graphMessages);
    
    return attachments.map(att => this.toUnifiedAttachment(att));
  }

  async decompressAttachment(attachment: UnifiedAttachment): Promise<string[]> {
    const microsoftAttachment = this.toMicrosoftAttachment(attachment);
    return microsoftGraphService.decompressAttachment(microsoftAttachment);
  }

  async deleteEmail(credentials: UnifiedCredentials, messageId: string, emailMetadata?: any): Promise<{ success: boolean; deleted: boolean; error?: string; metadata?: any }> {
    const microsoftCredentials = this.toMicrosoftCredentials(credentials);
    return microsoftGraphService.deleteEmail(microsoftCredentials, messageId, emailMetadata);
  }

  async bulkDeleteEmails(credentials: UnifiedCredentials, emailDeletions: Array<{ messageId: string; processed: boolean; metadata?: any; }>, maxDeletionsPerSecond?: number): Promise<{ totalAttempted: number; totalDeleted: number; totalSkipped: number; totalErrors: number; deletedEmails: Array<any>; }> {
    const microsoftCredentials = this.toMicrosoftCredentials(credentials);
    return microsoftGraphService.bulkDeleteEmails(microsoftCredentials, emailDeletions, maxDeletionsPerSecond);
  }

  private toMicrosoftCredentials(credentials: UnifiedCredentials): MicrosoftAuthCredentials {
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_at: credentials.expires_at,
      email: credentials.email,
      account_id: credentials.account_id
    };
  }

  private toOutlookSearchOptions(options: UnifiedSearchOptions): OutlookSearchOptions {
    return {
      unreadOnly: options.unreadOnly,
      maxResults: options.maxResults,
      afterDate: options.afterDate,
      beforeDate: options.beforeDate
    };
  }

  private toUnifiedMessage(message: GraphMessage): UnifiedMessage {
    return {
      id: message.id,
      threadId: message.conversationId,
      subject: message.subject,
      snippet: message.bodyPreview,
      receivedDateTime: message.receivedDateTime,
      sender: message.from ? {
        email: message.from.emailAddress.address,
        name: message.from.emailAddress.name
      } : message.sender ? {
        email: message.sender.emailAddress.address,
        name: message.sender.emailAddress.name
      } : undefined,
      hasAttachments: message.hasAttachments,
      provider: EmailProvider.MICROSOFT,
      originalMessage: message
    };
  }

  private toUnifiedAttachment(attachment: MicrosoftDmarcAttachment): UnifiedAttachment {
    return {
      filename: attachment.filename,
      data: attachment.data,
      messageId: attachment.messageId,
      date: attachment.date,
      provider: EmailProvider.MICROSOFT
    };
  }

  private toMicrosoftAttachment(attachment: UnifiedAttachment): MicrosoftDmarcAttachment {
    return {
      filename: attachment.filename,
      data: attachment.data,
      messageId: attachment.messageId,
      date: attachment.date
    };
  }
}

// Factory implementation
class EmailServiceFactoryImpl implements EmailServiceFactory {
  createAuthService(provider: EmailProvider): UnifiedAuthService {
    switch (provider) {
      case EmailProvider.GMAIL:
        return new GmailAuthServiceWrapper();
      case EmailProvider.MICROSOFT:
        return new MicrosoftAuthServiceWrapper();
      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  createEmailService(provider: EmailProvider): UnifiedEmailService {
    switch (provider) {
      case EmailProvider.GMAIL:
        return new GmailServiceWrapper();
      case EmailProvider.MICROSOFT:
        return new MicrosoftServiceWrapper();
      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }
}

// Singleton factory instance
export const emailServiceFactory = new EmailServiceFactoryImpl();

// Helper functions to determine provider from config
export function getProviderFromConfig(config: EmailConfig): EmailProvider {
  return config.provider as EmailProvider;
}

export function getProviderFromString(provider: string): EmailProvider {
  switch (provider.toLowerCase()) {
    case 'gmail':
      return EmailProvider.GMAIL;
    case 'microsoft':
    case 'outlook':
      return EmailProvider.MICROSOFT;
    default:
      throw new Error(`Unsupported email provider: ${provider}`);
  }
}

// Main unified service that routes to appropriate provider
export class UnifiedEmailProviderService {
  private authServices = new Map<EmailProvider, UnifiedAuthService>();
  private emailServices = new Map<EmailProvider, UnifiedEmailService>();

  private getAuthService(provider: EmailProvider): UnifiedAuthService {
    if (!this.authServices.has(provider)) {
      this.authServices.set(provider, emailServiceFactory.createAuthService(provider));
    }
    return this.authServices.get(provider)!;
  }

  private getEmailService(provider: EmailProvider): UnifiedEmailService {
    if (!this.emailServices.has(provider)) {
      this.emailServices.set(provider, emailServiceFactory.createEmailService(provider));
    }
    return this.emailServices.get(provider)!;
  }

  // Authentication methods
  async startOAuthFlow(provider: EmailProvider): Promise<UnifiedCredentials> {
    return this.getAuthService(provider).startOAuthFlow();
  }

  async saveEmailConfig(credentials: UnifiedCredentials, userId: string): Promise<string> {
    return this.getAuthService(credentials.provider).saveEmailConfig(credentials, userId);
  }

  async getUserEmailConfigs(userId: string, provider?: EmailProvider): Promise<EmailConfig[]> {
    if (provider) {
      return this.getAuthService(provider).getUserEmailConfigs(userId);
    }
    
    // Get configs from all providers
    const gmailConfigs = await this.getAuthService(EmailProvider.GMAIL).getUserEmailConfigs(userId);
    const microsoftConfigs = await this.getAuthService(EmailProvider.MICROSOFT).getUserEmailConfigs(userId);
    return [...gmailConfigs, ...microsoftConfigs];
  }

  async getCredentials(configId: string, userId: string, provider: EmailProvider): Promise<UnifiedCredentials | null> {
    return this.getAuthService(provider).getCredentials(configId, userId);
  }

  async deleteEmailConfig(configId: string, userId: string, provider: EmailProvider): Promise<void> {
    return this.getAuthService(provider).deleteEmailConfig(configId, userId);
  }

  async toggleConfigStatus(configId: string, userId: string, isActive: boolean, provider: EmailProvider): Promise<void> {
    return this.getAuthService(provider).toggleConfigStatus(configId, userId, isActive);
  }

  async testConnection(configId: string, userId: string, provider: EmailProvider): Promise<boolean> {
    return this.getAuthService(provider).testConnection(configId, userId);
  }

  // Email processing methods
  async searchDmarcReports(credentials: UnifiedCredentials, options: UnifiedSearchOptions, pageToken?: string): Promise<UnifiedSearchResult> {
    return this.getEmailService(credentials.provider).searchDmarcReports(credentials, options, pageToken);
  }

  async extractDmarcAttachments(credentials: UnifiedCredentials, messages: UnifiedMessage | UnifiedMessage[]): Promise<UnifiedAttachment[]> {
    return this.getEmailService(credentials.provider).extractDmarcAttachments(credentials, messages);
  }

  async decompressAttachment(attachment: UnifiedAttachment): Promise<string[]> {
    return this.getEmailService(attachment.provider).decompressAttachment(attachment);
  }

  async deleteEmail(credentials: UnifiedCredentials, messageId: string, emailMetadata?: any): Promise<{ success: boolean; deleted: boolean; error?: string; metadata?: any }> {
    return this.getEmailService(credentials.provider).deleteEmail(credentials, messageId, emailMetadata);
  }

  async bulkDeleteEmails(credentials: UnifiedCredentials, emailDeletions: Array<{ messageId: string; processed: boolean; metadata?: any; }>, maxDeletionsPerSecond?: number): Promise<{ totalAttempted: number; totalDeleted: number; totalSkipped: number; totalErrors: number; deletedEmails: Array<any>; }> {
    return this.getEmailService(credentials.provider).bulkDeleteEmails(credentials, emailDeletions, maxDeletionsPerSecond);
  }

  // Provider configuration checks
  isProviderConfigured(provider: EmailProvider): boolean {
    return this.getAuthService(provider).isConfigured();
  }

  async getProviderConfigurationStatus(provider: EmailProvider): Promise<{ configured: boolean; message: string; instructions?: string }> {
    return await this.getAuthService(provider).getConfigurationStatus();
  }

  // Get list of all supported providers
  getSupportedProviders(): EmailProvider[] {
    return Object.values(EmailProvider);
  }

  // Get list of configured providers
  getConfiguredProviders(): EmailProvider[] {
    return this.getSupportedProviders().filter(provider => this.isProviderConfigured(provider));
  }
}

// Singleton instance for global use
export const unifiedEmailService = new UnifiedEmailProviderService();