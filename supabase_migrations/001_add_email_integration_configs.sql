-- Create table for storing email integration configurations
CREATE TABLE user_email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('gmail')), -- Start with Gmail, can extend later
  email_address VARCHAR(254) NOT NULL,
  
  -- Encrypted token storage (will be encrypted before storing)
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync tracking
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(50) DEFAULT 'idle', -- idle, syncing, error, completed
  last_error_message TEXT,
  
  -- Configuration
  is_active BOOLEAN DEFAULT true,
  auto_sync_enabled BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider, email_address)
);

-- Create table for tracking email sync operations
CREATE TABLE email_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES user_email_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Sync details
  sync_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sync_completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) NOT NULL DEFAULT 'running', -- running, completed, failed
  
  -- Results
  emails_fetched INTEGER DEFAULT 0,
  reports_processed INTEGER DEFAULT 0,
  reports_skipped INTEGER DEFAULT 0, -- duplicates
  error_message TEXT,
  
  -- Created timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_user_email_configs_user_id ON user_email_configs(user_id);
CREATE INDEX idx_user_email_configs_active ON user_email_configs(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_email_sync_logs_config_id ON email_sync_logs(config_id);
CREATE INDEX idx_email_sync_logs_user_id ON email_sync_logs(user_id);
CREATE INDEX idx_email_sync_logs_status ON email_sync_logs(status);
CREATE INDEX idx_email_sync_logs_created_at ON email_sync_logs(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE user_email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sync_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_email_configs
CREATE POLICY "Users can view their own email configs" 
ON user_email_configs FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email configs" 
ON user_email_configs FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email configs" 
ON user_email_configs FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email configs" 
ON user_email_configs FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for email_sync_logs
CREATE POLICY "Users can view their own sync logs" 
ON email_sync_logs FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync logs" 
ON email_sync_logs FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_user_email_configs_updated_at 
    BEFORE UPDATE ON user_email_configs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();