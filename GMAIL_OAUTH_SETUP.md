# Gmail OAuth Integration Setup

This document explains how to set up Gmail OAuth integration for automatic DMARC report syncing.

## Prerequisites

1. Google Cloud Console project with Gmail API enabled
2. OAuth 2.0 client credentials configured
3. Supabase database with email integration tables

## Setup Steps

### 1. Google Cloud Console Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add your domain to authorized origins (e.g., `https://yourdomain.com`)
   - Save the Client ID

### 2. Environment Variables

Add the following environment variable to your `.env` file:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
```

### 3. Database Migration

The required database tables have been created with the following migration:

```sql
-- Table: user_email_configs
-- Stores encrypted OAuth tokens and sync configuration

-- Table: email_sync_logs  
-- Tracks sync operations and results
```

Run the migration in your Supabase database to create these tables.

### 4. Security Features

- **Token Encryption**: OAuth tokens are encrypted using AES-256 before storage
- **Read-Only Access**: Only requests `gmail.readonly` scope
- **Selective Email Access**: Only processes emails with DMARC report attachments
- **User Control**: Users can disconnect accounts at any time

### 5. How It Works

1. **OAuth Flow**: User clicks "Connect Gmail" → Google OAuth consent → Tokens stored encrypted
2. **Email Search**: System searches for emails with DMARC report attachments using specific queries
3. **Report Processing**: Downloads and processes XML attachments, avoiding duplicates
4. **Database Storage**: Uses existing DMARC report database schema

### 6. User Interface

The integration includes:

- **GmailOAuthButton**: Connect/disconnect Gmail accounts
- **EmailConfigModal**: Manage email configurations and view sync history
- **SyncStatusIndicator**: Real-time sync progress and status
- **Settings Page**: Comprehensive email integration management

### 7. Navigation Integration

Gmail sync functionality is accessible via:

- Top navigation bar (desktop and mobile)
- Dashboard header (next to Upload button)
- Settings page (`/settings`)
- Account dropdown menu

### 8. Testing

To test the integration:

1. Set up Google OAuth credentials
2. Add the `VITE_GOOGLE_CLIENT_ID` environment variable
3. Build and run the application
4. Navigate to Settings → Connect Gmail Account
5. Complete OAuth flow
6. Use "Test Connection" to verify setup
7. Run "Sync Now" to fetch DMARC reports

### 9. Troubleshooting

**Common Issues:**

- **Google API not loaded**: Ensure internet connection and check browser console
- **OAuth errors**: Verify Client ID and authorized domains in Google Console  
- **Sync failures**: Check Gmail credentials and re-authenticate if needed
- **Encryption errors**: Ensure browser supports Web Crypto API

**Debug Steps:**

1. Check browser console for errors
2. Verify environment variables are loaded
3. Test connection using the built-in test functionality
4. Review sync logs in the Settings page

### 10. Production Considerations

For production deployment:

- Use HTTPS for OAuth redirect URIs
- Implement server-side token encryption for enhanced security
- Set up monitoring for sync failures
- Configure rate limiting for Gmail API calls
- Implement proper error handling and user notifications

## API Limits

Gmail API has the following limits:
- 1 billion quota units per day
- 250 quota units per user per second
- Each API call consumes different quota units

The integration is designed to be efficient and respect these limits through:
- Targeted email searches
- Batch processing
- Error handling and retry logic
- Progress tracking and user feedback