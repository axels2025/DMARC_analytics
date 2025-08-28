-- Create DMARC Forensic Reports table
-- This table stores detailed forensic (RUF) reports containing information about individual emails that fail DMARC authentication
CREATE TABLE public.dmarc_forensic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    domain VARCHAR(255) NOT NULL,
    report_id VARCHAR(500) NOT NULL,
    arrival_date BIGINT NOT NULL,
    message_id VARCHAR(500),
    source_ip INET NOT NULL,
    auth_failure VARCHAR(50) NOT NULL,
    envelope_to VARCHAR(255),                   -- masked for privacy
    envelope_from VARCHAR(255),                 -- masked for privacy
    header_from VARCHAR(255),                   -- masked for privacy
    subject VARCHAR(500),                       -- masked/truncated for privacy
    original_headers TEXT,
    message_body TEXT,                          -- optional, encrypted if is_encrypted = true
    spf_result VARCHAR(20),
    dkim_result VARCHAR(20),
    dmarc_result VARCHAR(20),
    policy_evaluated VARCHAR(20),               -- none/quarantine/reject
    raw_xml TEXT,                               -- original forensic XML
    is_encrypted BOOLEAN DEFAULT FALSE,         -- indicates if sensitive data is encrypted
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.dmarc_forensic_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for dmarc_forensic_reports
CREATE POLICY "Users can view their own forensic reports" 
ON public.dmarc_forensic_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own forensic reports" 
ON public.dmarc_forensic_reports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own forensic reports" 
ON public.dmarc_forensic_reports 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own forensic reports" 
ON public.dmarc_forensic_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_forensic_reports_user_id ON public.dmarc_forensic_reports(user_id);
CREATE INDEX idx_forensic_reports_domain ON public.dmarc_forensic_reports(domain);
CREATE INDEX idx_forensic_reports_arrival_date ON public.dmarc_forensic_reports(arrival_date);
CREATE INDEX idx_forensic_reports_source_ip ON public.dmarc_forensic_reports(source_ip);
CREATE INDEX idx_forensic_reports_auth_failure ON public.dmarc_forensic_reports(auth_failure);

-- Create trigger for automatic timestamp updates (reuse existing function)
CREATE TRIGGER update_dmarc_forensic_reports_updated_at
BEFORE UPDATE ON public.dmarc_forensic_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();