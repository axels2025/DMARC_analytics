# Privacy & Compliance Features

This DMARC Analytics application now includes comprehensive privacy and compliance controls designed for enterprise security requirements.

## Accessing Privacy Features

### 1. Privacy Test Suite
Navigate to `/privacy-test` (e.g., `http://localhost:8080/privacy-test`) to run comprehensive privacy tests.

### 2. Privacy Components Available

#### Core Privacy Utils
- **Privacy Manager** (`src/utils/privacyManager.ts`): Data masking, classification, compliance scoring
- **Encryption Service** (`src/utils/encryptionService.ts`): Client-side AES-GCM encryption
- **Privacy Audit** (`src/utils/privacyAudit.ts`): GDPR/CCPA compliance logging
- **Data Lifecycle** (`src/utils/dataLifecycleManager.ts`): Retention policies, automated cleanup

#### Privacy UI Components
- **Privacy Settings** (`src/components/privacy/PrivacySettings.tsx`): Full privacy configuration
- **Data Masking Controls** (`src/components/privacy/DataMaskingControls.tsx`): Real-time masking preview
- **Privacy Dashboard** (`src/components/privacy/PrivacyDashboard.tsx`): Compliance monitoring
- **Privacy-Aware Export** (`src/components/privacy/PrivacyAwareExport.tsx`): GDPR-compliant exports

## Key Features

### ✅ Data Protection
- Three-tier masking system (Minimal/Standard/Maximum)
- Intelligent email address masking with domain preservation
- Subject line protection with keyword preservation
- PII detection and redaction (SSN, credit cards, phone numbers)
- Email header sanitization

### ✅ Encryption & Security
- Browser-native AES-GCM encryption (Web Crypto API)
- Master password-protected key storage
- Client-side encryption with no server-side key access
- Secure key rotation and management

### ✅ Compliance & Audit
- GDPR compliance (Article 6, 7, 17, 20)
- CCPA compliance and privacy rights
- Comprehensive audit logging
- Compliance scoring and recommendations
- Data breach detection and reporting

### ✅ Data Lifecycle
- Automated retention policy enforcement
- Data anonymization and deletion
- Privacy-compliant data export
- Data inventory and classification

## Database Schema

The system includes privacy-focused database extensions:

- `user_privacy_settings` - User privacy preferences
- `privacy_audit_log` - Comprehensive audit trail
- `user_encryption_keys` - Secure key management
- `data_retention_policies` - Automated data lifecycle
- `privacy_compliance_events` - GDPR/CCPA tracking

## Testing

Run the privacy test suite to validate all features:
1. Navigate to `/privacy-test` in the application
2. Click "Run Privacy Tests"
3. Review test results for compliance validation

The test suite validates:
- Data masking algorithms
- Encryption/decryption cycles
- Audit logging functionality
- Compliance reporting
- Data lifecycle management
- End-to-end privacy workflows

## For Developers

### Adding Privacy to New Components

```typescript
import { 
  PrivacySettings, 
  applyPrivacySettings, 
  logDataAccess 
} from '@/utils/privacyManager';
import { logDataAccess } from '@/utils/privacyAudit';

// Apply privacy masking
const maskedData = applyPrivacySettings(rawData, userPrivacySettings);

// Log data access for compliance
await logDataAccess(userId, 'forensic_report', recordId);
```

### Encryption Integration

```typescript
import { ClientEncryption } from '@/utils/encryptionService';

const encryption = new ClientEncryption();
const key = await encryption.generateKey();
const encrypted = await encryption.encrypt(sensitiveData, key);
```

## Compliance Notes

This privacy system is designed to meet:
- **GDPR** (General Data Protection Regulation)
- **CCPA** (California Consumer Privacy Act)
- **HIPAA** (Healthcare data protection)
- **SOC 2** (Security audit requirements)

All privacy operations are logged for audit purposes, and the system provides built-in compliance reporting capabilities.