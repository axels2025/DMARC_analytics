-- Create DMARC Reports table
CREATE TABLE public.dmarc_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    domain VARCHAR(255) NOT NULL,
    org_name VARCHAR(255) NOT NULL,
    org_email VARCHAR(255),
    report_id VARCHAR(500) NOT NULL,
    date_range_begin BIGINT NOT NULL,
    date_range_end BIGINT NOT NULL,
    policy_domain VARCHAR(255) NOT NULL,
    policy_dkim VARCHAR(10) NOT NULL, -- 'r' or 's'
    policy_spf VARCHAR(10) NOT NULL,   -- 'r' or 's'
    policy_p VARCHAR(20) NOT NULL,     -- 'none', 'quarantine', 'reject'
    policy_sp VARCHAR(20),             -- subdomain policy
    policy_pct INTEGER DEFAULT 100,
    raw_xml TEXT,                      -- store original XML
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create DMARC Records table
CREATE TABLE public.dmarc_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES public.dmarc_reports(id) ON DELETE CASCADE NOT NULL,
    source_ip INET NOT NULL,
    count INTEGER NOT NULL,
    disposition VARCHAR(20) NOT NULL,
    dkim_result VARCHAR(20) NOT NULL,
    spf_result VARCHAR(20) NOT NULL,
    header_from VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create DMARC Auth Results table
CREATE TABLE public.dmarc_auth_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID REFERENCES public.dmarc_records(id) ON DELETE CASCADE NOT NULL,
    auth_type VARCHAR(10) NOT NULL, -- 'dkim' or 'spf'
    domain VARCHAR(255) NOT NULL,
    selector VARCHAR(100),           -- for DKIM only
    result VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create User Domains table (for multi-tenant support)
CREATE TABLE public.user_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    domain VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, domain)
);

-- Enable Row Level Security
ALTER TABLE public.dmarc_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmarc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmarc_auth_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_domains ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for dmarc_reports
CREATE POLICY "Users can view their own DMARC reports" 
ON public.dmarc_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own DMARC reports" 
ON public.dmarc_reports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own DMARC reports" 
ON public.dmarc_reports 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own DMARC reports" 
ON public.dmarc_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for dmarc_records
CREATE POLICY "Users can view records from their own reports" 
ON public.dmarc_records 
FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.dmarc_reports 
    WHERE id = dmarc_records.report_id 
    AND user_id = auth.uid()
));

CREATE POLICY "Users can create records for their own reports" 
ON public.dmarc_records 
FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM public.dmarc_reports 
    WHERE id = dmarc_records.report_id 
    AND user_id = auth.uid()
));

CREATE POLICY "Users can update records from their own reports" 
ON public.dmarc_records 
FOR UPDATE 
USING (EXISTS (
    SELECT 1 FROM public.dmarc_reports 
    WHERE id = dmarc_records.report_id 
    AND user_id = auth.uid()
));

CREATE POLICY "Users can delete records from their own reports" 
ON public.dmarc_records 
FOR DELETE 
USING (EXISTS (
    SELECT 1 FROM public.dmarc_reports 
    WHERE id = dmarc_records.report_id 
    AND user_id = auth.uid()
));

-- Create RLS policies for dmarc_auth_results
CREATE POLICY "Users can view auth results from their own records" 
ON public.dmarc_auth_results 
FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.dmarc_records dr
    JOIN public.dmarc_reports rep ON dr.report_id = rep.id
    WHERE dr.id = dmarc_auth_results.record_id 
    AND rep.user_id = auth.uid()
));

CREATE POLICY "Users can create auth results for their own records" 
ON public.dmarc_auth_results 
FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM public.dmarc_records dr
    JOIN public.dmarc_reports rep ON dr.report_id = rep.id
    WHERE dr.id = dmarc_auth_results.record_id 
    AND rep.user_id = auth.uid()
));

CREATE POLICY "Users can update auth results from their own records" 
ON public.dmarc_auth_results 
FOR UPDATE 
USING (EXISTS (
    SELECT 1 FROM public.dmarc_records dr
    JOIN public.dmarc_reports rep ON dr.report_id = rep.id
    WHERE dr.id = dmarc_auth_results.record_id 
    AND rep.user_id = auth.uid()
));

CREATE POLICY "Users can delete auth results from their own records" 
ON public.dmarc_auth_results 
FOR DELETE 
USING (EXISTS (
    SELECT 1 FROM public.dmarc_records dr
    JOIN public.dmarc_reports rep ON dr.report_id = rep.id
    WHERE dr.id = dmarc_auth_results.record_id 
    AND rep.user_id = auth.uid()
));

-- Create RLS policies for user_domains
CREATE POLICY "Users can view their own domains" 
ON public.user_domains 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own domains" 
ON public.user_domains 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own domains" 
ON public.user_domains 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own domains" 
ON public.user_domains 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_dmarc_reports_user_id ON public.dmarc_reports(user_id);
CREATE INDEX idx_dmarc_reports_domain ON public.dmarc_reports(domain);
CREATE INDEX idx_dmarc_reports_date_range ON public.dmarc_reports(date_range_begin, date_range_end);
CREATE INDEX idx_dmarc_records_report_id ON public.dmarc_records(report_id);
CREATE INDEX idx_dmarc_records_source_ip ON public.dmarc_records(source_ip);
CREATE INDEX idx_auth_results_record_id ON public.dmarc_auth_results(record_id);
CREATE INDEX idx_user_domains_user_id ON public.user_domains(user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_dmarc_reports_updated_at
BEFORE UPDATE ON public.dmarc_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();