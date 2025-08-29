# Database Setup for Forensic Reports & Privacy Features

The forensic dashboard requires additional database tables to function properly. Here's how to set them up:

## Quick Setup (Recommended)

### Option 1: Using Supabase CLI
```bash
# Make sure you're in the project directory
cd /Users/axel/projects/DMARC_analytics

# Apply all migrations
supabase db push
```

### Option 2: Manual Setup via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to "SQL Editor" 
3. Run the following SQL scripts **in order**:

#### Step 1: Create Forensic Reports Table
```sql
-- Copy and paste the content of:
-- supabase/migrations/20250828211008_add_forensic_reports_support.sql
```

#### Step 2: Create Privacy Control Tables  
```sql
-- Copy and paste the content of:
-- supabase/migrations/20250828224725_add_privacy_controls.sql
```

#### Step 3: Create Lifecycle Management Functions
```sql
-- Copy and paste the content of:
-- supabase/migrations/20250828225000_add_lifecycle_functions.sql
```

## What Gets Created

### Core Tables
- `dmarc_forensic_reports` - Stores individual failed email reports
- `user_privacy_settings` - User privacy preferences and masking levels
- `privacy_audit_log` - Compliance audit trail for data access
- `user_encryption_keys` - Encrypted key storage for client-side encryption
- `data_retention_policies` - Automated data lifecycle policies
- `privacy_compliance_events` - GDPR/CCPA compliance tracking

### Security Features
- Row Level Security (RLS) policies for all tables
- User-specific data isolation
- Automated timestamp triggers
- Compliance audit functions

### Database Functions
- `get_forensic_data_stats()` - Data inventory and statistics
- `delete_expired_forensic_data()` - Automated data cleanup
- `anonymize_old_forensic_data()` - Privacy-compliant data anonymization
- `get_data_inventory_summary()` - Comprehensive data overview

## Verification

After running the migrations, you can verify the setup by:

1. **Check Tables**: Go to Supabase Dashboard → Database → Tables
   - You should see the new tables listed
   
2. **Test Forensic Dashboard**: Navigate to `/forensics` in the app
   - Should load without "table not found" errors
   - Will show empty state until you have forensic data

3. **Test Privacy Features**: Navigate to `/privacy-test` in the app
   - Run the privacy test suite to validate all features

## Sample Data (Optional)

If you want to test with sample data, you can insert some test forensic reports:

```sql
INSERT INTO dmarc_forensic_reports (
    user_id, domain, report_id, arrival_date, source_ip, auth_failure,
    envelope_from, envelope_to, subject, spf_result, dkim_result, 
    dmarc_result, policy_evaluated
) VALUES (
    auth.uid(), -- Current user
    'example.com',
    'test-report-001',
    extract(epoch from now()),
    '192.168.1.100',
    'SPF/DKIM Failure',
    'sender@suspicious-domain.com',
    'user@example.com', 
    'Test DMARC Failure Report',
    'fail',
    'fail',
    'fail',
    'quarantine'
);
```

## Testing Forensic Upload

You can test the forensic upload functionality with this sample email content:

**File Upload Test (.eml or .txt file):**
```
From: attacker@malicious-domain.com
To: user@your-domain.com
Subject: Important: Account Verification Required
Message-ID: <abc123@malicious-domain.com>
Date: Wed, 25 Oct 2023 14:30:00 +0000
Received: from malicious-domain.com ([203.0.113.45])
    by mail.your-domain.com with SMTP; Wed, 25 Oct 2023 14:30:00 +0000
Authentication-Results: mail.your-domain.com;
    spf=fail smtp.mailfrom=malicious-domain.com;
    dkim=fail reason="signature verification failed";
    dmarc=fail action=quarantine

Dear User,

Your account requires immediate verification. Please click the link below:
http://phishing-site.com/verify

Best regards,
Security Team
```

**Manual Entry Test:**
1. Go to Forensic Dashboard → Upload tab
2. Select "Manual Entry"
3. Paste the sample content above
4. Optionally specify domain: "your-domain.com"
5. Click "Process Forensic Report"

The system will parse the email headers, extract authentication results, and create a forensic report entry in the database.

## Troubleshooting

### Permission Errors
If you get permission errors:
1. Make sure you're logged into the correct Supabase project
2. Check that your user has the required database permissions
3. Try running `supabase login` to re-authenticate

### Migration Conflicts
If migrations fail due to existing tables:
1. Check if tables already exist in Database → Tables
2. Drop existing tables if they're incomplete: `DROP TABLE table_name CASCADE;`
3. Re-run the migrations

### RLS Policy Issues
If you get RLS (Row Level Security) errors:
1. Make sure you're authenticated in the app
2. Check that `auth.uid()` returns a valid user ID
3. Verify RLS policies are applied correctly

## Next Steps

Once the database is set up:
1. **Privacy Features**: All privacy controls will be fully functional
2. **Forensic Reports**: Upload or import forensic (RUF) reports
3. **Compliance**: Use the privacy dashboard for compliance monitoring
4. **Data Export**: Use privacy-aware export for GDPR compliance