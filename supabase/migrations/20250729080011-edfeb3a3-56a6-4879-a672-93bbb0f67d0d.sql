-- Add envelope_to column to dmarc_records table to store recipient domain information
ALTER TABLE public.dmarc_records 
ADD COLUMN envelope_to character varying;