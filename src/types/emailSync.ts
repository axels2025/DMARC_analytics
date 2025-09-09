// Shared types for email synchronization
// This file contains type definitions that are used across multiple email service files
// to avoid circular dependencies

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
  provider?: any; // Optional for backward compatibility - can be EmailProvider enum or string
}