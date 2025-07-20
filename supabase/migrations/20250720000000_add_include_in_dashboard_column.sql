-- Add include_in_dashboard column to dmarc_reports table
-- This migration adds a boolean column to control which reports are included in dashboard calculations

-- Add the column with default value of true (existing reports should be included by default)
ALTER TABLE dmarc_reports 
ADD COLUMN include_in_dashboard BOOLEAN NOT NULL DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN dmarc_reports.include_in_dashboard IS 'Controls whether this report is included in dashboard calculations and metrics';

-- Create index for efficient filtering by include_in_dashboard
CREATE INDEX idx_dmarc_reports_include_in_dashboard ON dmarc_reports(include_in_dashboard);

-- Update the updated_at timestamp for any existing records (optional, but good practice)
UPDATE dmarc_reports SET updated_at = NOW() WHERE include_in_dashboard = true;