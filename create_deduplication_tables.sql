-- Run this SQL manually in your Supabase SQL editor to enable deduplication
-- Enhanced email sync tracking with deduplication support

-- Add email message tracking table
CREATE TABLE IF NOT EXISTS email_message_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES user_email_configs(id) ON DELETE CASCADE,
  
  -- Gmail message identification for deduplication
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  internal_date BIGINT, -- Gmail's internalDate for chronological ordering
  
  -- Content identification
  subject_hash TEXT, -- SHA-256 of email subject for duplicate detection
  attachment_hashes TEXT[], -- Array of attachment hashes for content deduplication
  
  -- Processing state
  processing_status TEXT DEFAULT 'discovered' CHECK (
    processing_status IN ('discovered', 'processing', 'completed', 'failed', 'skipped')
  ),
  dmarc_reports_found INTEGER DEFAULT 0,
  dmarc_reports_processed INTEGER DEFAULT 0,
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for deduplication
  UNIQUE(user_id, gmail_message_id)
);

-- Add sync cursor tracking for incremental sync
ALTER TABLE user_email_configs ADD COLUMN IF NOT EXISTS last_sync_cursor TEXT;
ALTER TABLE user_email_configs ADD COLUMN IF NOT EXISTS incremental_sync_enabled BOOLEAN DEFAULT true;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_email_message_tracking_user_config ON email_message_tracking(user_id, config_id);
CREATE INDEX IF NOT EXISTS idx_email_message_tracking_status ON email_message_tracking(processing_status, discovered_at);
CREATE INDEX IF NOT EXISTS idx_email_message_tracking_gmail_id ON email_message_tracking(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_email_message_tracking_internal_date ON email_message_tracking(internal_date DESC);

-- Enable RLS
ALTER TABLE email_message_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can manage own email tracking" ON email_message_tracking;
CREATE POLICY "Users can manage own email tracking" ON email_message_tracking
FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON email_message_tracking TO authenticated;