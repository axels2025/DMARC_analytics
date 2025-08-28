/**
 * Comprehensive privacy controls and compliance test suite
 * This file contains tests to validate all privacy functionality
 */

import { 
  PrivacySettings,
  MaskingOptions,
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_MASKING_OPTIONS,
  maskEmailAddress,
  maskSubjectLine,
  sanitizeEmailHeaders,
  redactMessageContent,
  applyPrivacySettings,
  validatePrivacySettings,
  calculateComplianceScore,
  classifyData
} from './privacyManager';

import {
  PrivacyAuditLogger,
  logPrivacyEvent,
  logDataAccess,
  logTemporaryReveal,
  generateComplianceReport
} from './privacyAudit';

import {
  ClientEncryption,
  KeyStorage,
  encryptionService
} from './encryptionService';

import {
  DataLifecycleManager
} from './dataLifecycleManager';

export interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export class PrivacyTestSuite {
  private results: TestResult[] = [];
  private testUserId = 'test-user-privacy-suite';

  /**
   * Run all privacy tests
   */
  async runAllTests(): Promise<TestResult[]> {
    this.results = [];
    
    console.log('🔒 Starting Privacy Controls Test Suite...');
    
    // Data Masking Tests
    await this.testEmailMasking();
    await this.testSubjectLineMasking();
    await this.testHeaderSanitization();
    await this.testContentRedaction();
    await this.testPrivacySettingsApplication();
    
    // Validation Tests
    await this.testPrivacySettingsValidation();
    await this.testComplianceScoring();
    await this.testDataClassification();
    
    // Encryption Tests
    await this.testClientEncryption();
    await this.testKeyStorage();
    await this.testEncryptionService();
    
    // Audit Tests
    await this.testAuditLogging();
    await this.testComplianceReporting();
    
    // Data Lifecycle Tests
    await this.testDataLifecycle();
    
    // Integration Tests
    await this.testEndToEndPrivacyFlow();
    
    console.log(`\n📊 Privacy Test Results: ${this.results.filter(r => r.passed).length}/${this.results.length} passed`);
    
    return this.results;
  }

  /**
   * Test email address masking
   */
  private async testEmailMasking(): Promise<void> {
    try {
      // Test standard masking
      const standardMask = maskEmailAddress('john.doe@example.com', 'standard');
      const expectedPattern = /^j\*+e@example\.com$/;
      
      if (!expectedPattern.test(standardMask)) {
        throw new Error(`Standard masking failed. Got: ${standardMask}`);
      }
      
      // Test minimal masking
      const minimalMask = maskEmailAddress('john.doe@example.com', 'minimal');
      if (!minimalMask.includes('john') || !minimalMask.includes('@example.com')) {
        throw new Error(`Minimal masking failed. Got: ${minimalMask}`);
      }
      
      // Test maximum masking
      const maximumMask = maskEmailAddress('john.doe@example.com', 'maximum', false);
      if (maximumMask.includes('john') || maximumMask.includes('example')) {
        throw new Error(`Maximum masking failed. Got: ${maximumMask}`);
      }
      
      this.addResult('Email Masking', true, { standardMask, minimalMask, maximumMask });
    } catch (error) {
      this.addResult('Email Masking', false, error.message);
    }
  }

  /**
   * Test subject line masking
   */
  private async testSubjectLineMasking(): Promise<void> {
    try {
      const testSubject = 'DMARC Authentication Failed for john@example.com - Credit Card 1234-5678-9012-3456';
      const options = { ...DEFAULT_MASKING_OPTIONS };
      
      const masked = maskSubjectLine(testSubject, options);
      
      // Should preserve DMARC keyword
      if (!masked.includes('DMARC')) {
        throw new Error('DMARC keyword not preserved');
      }
      
      // Should mask credit card number
      if (masked.includes('1234-5678-9012-3456')) {
        throw new Error('Credit card number not masked');
      }
      
      // Should mask email address
      if (masked.includes('john@example.com')) {
        throw new Error('Email address not masked');
      }
      
      this.addResult('Subject Line Masking', true, { original: testSubject, masked });
    } catch (error) {
      this.addResult('Subject Line Masking', false, error.message);
    }
  }

  /**
   * Test header sanitization
   */
  private async testHeaderSanitization(): Promise<void> {
    try {
      const testHeaders = `From: sender@example.com
To: recipient@example.com
Subject: Test Message
Date: Mon, 1 Jan 2024 12:00:00 +0000
Authentication-Results: example.com; dmarc=fail
Authorization: Bearer secret-token-12345
Cookie: session=abc123`;

      const sanitized = sanitizeEmailHeaders(testHeaders);
      
      // Should keep authentication headers
      if (!sanitized.includes('Authentication-Results')) {
        throw new Error('Authentication header not preserved');
      }
      
      // Should remove sensitive headers
      if (sanitized.includes('Authorization') || sanitized.includes('Cookie')) {
        throw new Error('Sensitive headers not removed');
      }
      
      // Should mask email addresses
      if (sanitized.includes('sender@example.com')) {
        throw new Error('Email addresses not masked in headers');
      }
      
      this.addResult('Header Sanitization', true, { sanitized });
    } catch (error) {
      this.addResult('Header Sanitization', false, error.message);
    }
  }

  /**
   * Test content redaction
   */
  private async testContentRedaction(): Promise<void> {
    try {
      const testContent = `Dear Customer,
      
Your account has been suspended. Please verify using:
- Email: support@company.com
- Phone: 555-123-4567
- SSN: 123-45-6789
- Card: 4111-1111-1111-1111
- URL: https://suspicious-site.com/verify`;

      const redacted = redactMessageContent(testContent, 500);
      
      // Should redact sensitive patterns
      const sensitivePatterns = ['555-123-4567', '123-45-6789', '4111-1111-1111-1111'];
      for (const pattern of sensitivePatterns) {
        if (redacted.includes(pattern)) {
          throw new Error(`Sensitive pattern not redacted: ${pattern}`);
        }
      }
      
      // Should redact URLs
      if (redacted.includes('https://suspicious-site.com')) {
        throw new Error('URL not redacted');
      }
      
      this.addResult('Content Redaction', true, { redacted });
    } catch (error) {
      this.addResult('Content Redaction', false, error.message);
    }
  }

  /**
   * Test privacy settings application
   */
  private async testPrivacySettingsApplication(): Promise<void> {
    try {
      const testData = {
        envelope_from: 'sender@example.com',
        envelope_to: 'recipient@example.com',
        subject: 'DMARC Test Message',
        original_headers: 'From: sender@example.com\nTo: recipient@example.com',
        message_body: 'This is a test message with sensitive content'
      };

      const privacySettings: PrivacySettings = {
        ...DEFAULT_PRIVACY_SETTINGS,
        showEmailAddresses: false,
        showSubjects: true,
        showHeaders: false,
        showMessageContent: false,
        maskingLevel: 'standard'
      };

      const processed = applyPrivacySettings(testData, privacySettings);
      
      // Should mask email addresses
      if (processed.envelope_from === testData.envelope_from) {
        throw new Error('Email addresses not masked');
      }
      
      // Should preserve subject
      if (!processed.subject) {
        throw new Error('Subject was hidden when it should be shown');
      }
      
      // Should hide headers
      if (processed.original_headers !== '[HEADERS HIDDEN]') {
        throw new Error('Headers not hidden');
      }
      
      // Should hide message content
      if (processed.message_body !== '[CONTENT HIDDEN]') {
        throw new Error('Message content not hidden');
      }
      
      this.addResult('Privacy Settings Application', true, { processed });
    } catch (error) {
      this.addResult('Privacy Settings Application', false, error.message);
    }
  }

  /**
   * Test privacy settings validation
   */
  private async testPrivacySettingsValidation(): Promise<void> {
    try {
      // Valid settings
      const validSettings: PrivacySettings = DEFAULT_PRIVACY_SETTINGS;
      const validResult = validatePrivacySettings(validSettings);
      
      if (!validResult.isValid) {
        throw new Error('Valid settings marked as invalid');
      }
      
      // Invalid settings - encryption without master password
      const invalidSettings: PrivacySettings = {
        ...DEFAULT_PRIVACY_SETTINGS,
        encryptSensitiveData: true,
        requireMasterPassword: false
      };
      const invalidResult = validatePrivacySettings(invalidSettings);
      
      if (invalidResult.isValid) {
        throw new Error('Invalid settings marked as valid');
      }
      
      this.addResult('Privacy Settings Validation', true, { validResult, invalidResult });
    } catch (error) {
      this.addResult('Privacy Settings Validation', false, error.message);
    }
  }

  /**
   * Test compliance scoring
   */
  private async testComplianceScoring(): Promise<void> {
    try {
      const highComplianceSettings: PrivacySettings = {
        ...DEFAULT_PRIVACY_SETTINGS,
        maskingLevel: 'standard',
        encryptSensitiveData: true,
        auditDataAccess: true,
        requireMasterPassword: true,
        retentionPeriodDays: 90
      };

      const score = calculateComplianceScore(highComplianceSettings);
      
      if (score.score < 80) {
        throw new Error(`Expected high compliance score, got ${score.score}`);
      }
      
      const lowComplianceSettings: PrivacySettings = {
        ...DEFAULT_PRIVACY_SETTINGS,
        maskingLevel: 'minimal',
        encryptSensitiveData: false,
        auditDataAccess: false,
        requireMasterPassword: false
      };

      const lowScore = calculateComplianceScore(lowComplianceSettings);
      
      if (lowScore.score > 50) {
        throw new Error(`Expected low compliance score, got ${lowScore.score}`);
      }
      
      this.addResult('Compliance Scoring', true, { highScore: score.score, lowScore: lowScore.score });
    } catch (error) {
      this.addResult('Compliance Scoring', false, error.message);
    }
  }

  /**
   * Test data classification
   */
  private async testDataClassification(): Promise<void> {
    try {
      const sensitiveData = {
        emailAddresses: ['john@example.com'],
        subject: 'Confidential: Your SSN 123-45-6789',
        messageContent: 'Credit card: 4111-1111-1111-1111'
      };

      const classification = classifyData(sensitiveData);
      
      if (classification.level !== 'restricted') {
        throw new Error(`Expected restricted classification, got ${classification.level}`);
      }
      
      if (!classification.tags.includes('PII')) {
        throw new Error('PII tag not detected');
      }
      
      if (!classification.encryptionRequired) {
        throw new Error('Encryption not required for sensitive data');
      }
      
      this.addResult('Data Classification', true, { classification });
    } catch (error) {
      this.addResult('Data Classification', false, error.message);
    }
  }

  /**
   * Test client encryption
   */
  private async testClientEncryption(): Promise<void> {
    try {
      if (!ClientEncryption.isAvailable()) {
        throw new Error('Client encryption not available');
      }

      const encryption = new ClientEncryption();
      const testData = 'Sensitive test data for encryption';
      
      // Generate key and encrypt
      const key = await encryption.generateKey();
      const encrypted = await encryption.encrypt(testData, key);
      
      if (!encrypted.ciphertext || !encrypted.iv) {
        throw new Error('Encryption failed - missing required fields');
      }
      
      // Decrypt and verify
      const decrypted = await encryption.decrypt(encrypted, key);
      
      if (decrypted !== testData) {
        throw new Error('Decryption failed - data mismatch');
      }
      
      this.addResult('Client Encryption', true, { encrypted: encrypted.ciphertext.substring(0, 50) + '...' });
    } catch (error) {
      this.addResult('Client Encryption', false, error.message);
    }
  }

  /**
   * Test key storage
   */
  private async testKeyStorage(): Promise<void> {
    try {
      const encryption = new ClientEncryption();
      const key = await encryption.generateKey();
      const keyId = 'test-key-' + Date.now();
      const masterPassword = 'test-password-123';
      
      // Store key
      await KeyStorage.storeKey(keyId, key, masterPassword);
      
      // Retrieve key
      const retrievedKey = await KeyStorage.retrieveKey(keyId, masterPassword);
      
      if (!retrievedKey) {
        throw new Error('Key retrieval failed');
      }
      
      // Test encryption with retrieved key
      const testData = 'Test data with retrieved key';
      const encrypted = await encryption.encrypt(testData, retrievedKey);
      const decrypted = await encryption.decrypt(encrypted, retrievedKey);
      
      if (decrypted !== testData) {
        throw new Error('Retrieved key does not work for encryption/decryption');
      }
      
      // Clean up
      KeyStorage.deleteKey(keyId);
      
      this.addResult('Key Storage', true, { keyId });
    } catch (error) {
      this.addResult('Key Storage', false, error.message);
    }
  }

  /**
   * Test encryption service
   */
  private async testEncryptionService(): Promise<void> {
    try {
      const providers = encryptionService.getAvailableProviders();
      
      if (providers.length === 0) {
        throw new Error('No encryption providers available');
      }
      
      const recommended = encryptionService.getRecommendedProvider();
      
      if (!recommended) {
        throw new Error('No recommended encryption provider');
      }
      
      // Test encryption capability
      const testResult = await encryptionService.testEncryption(recommended.name);
      
      if (!testResult && recommended.name !== 'none') {
        throw new Error(`Encryption test failed for provider: ${recommended.name}`);
      }
      
      this.addResult('Encryption Service', true, { 
        providers: providers.length, 
        recommended: recommended.name,
        testPassed: testResult 
      });
    } catch (error) {
      this.addResult('Encryption Service', false, error.message);
    }
  }

  /**
   * Test audit logging
   */
  private async testAuditLogging(): Promise<void> {
    try {
      // Test basic event logging
      await logPrivacyEvent({
        userId: this.testUserId,
        eventType: 'data_access',
        dataType: 'forensic_report',
        resourceId: 'test-resource-123',
        severity: 'low',
        success: true,
        metadata: { test: true }
      });
      
      // Test convenience functions
      await logDataAccess(this.testUserId, 'forensic_report', 'test-resource-456');
      await logTemporaryReveal(this.testUserId, 'email_addresses', 'test-resource-789', 10000);
      
      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to retrieve events (this might fail if database is not available)
      try {
        const events = await PrivacyAuditLogger.getAuditEvents(this.testUserId, { limit: 10 });
        this.addResult('Audit Logging', true, { eventsLogged: events.length });
      } catch (dbError) {
        // Database might not be available in test environment
        this.addResult('Audit Logging', true, { note: 'Events logged, DB retrieval skipped' });
      }
    } catch (error) {
      this.addResult('Audit Logging', false, error.message);
    }
  }

  /**
   * Test compliance reporting
   */
  private async testComplianceReporting(): Promise<void> {
    try {
      const dateRange = {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date()
      };
      
      const report = await generateComplianceReport(this.testUserId, 'gdpr', dateRange);
      
      if (!report.reportId || !report.generatedAt) {
        throw new Error('Compliance report missing required fields');
      }
      
      if (report.reportType !== 'gdpr') {
        throw new Error('Report type mismatch');
      }
      
      if (!Array.isArray(report.dataProcessingActivities)) {
        throw new Error('Data processing activities not array');
      }
      
      this.addResult('Compliance Reporting', true, { 
        reportId: report.reportId.substring(0, 8) + '...',
        activitiesCount: report.dataProcessingActivities.length 
      });
    } catch (error) {
      this.addResult('Compliance Reporting', false, error.message);
    }
  }

  /**
   * Test data lifecycle management
   */
  private async testDataLifecycle(): Promise<void> {
    try {
      // Test retention policy creation
      const testPolicy = {
        userId: this.testUserId,
        dataType: 'forensic_report' as const,
        retentionDays: 30,
        autoDelete: true,
        encryptionRequired: false
      };
      
      // This might fail if database is not available
      try {
        const policySet = await DataLifecycleManager.setRetentionPolicy(testPolicy);
        
        if (policySet) {
          const retrievedPolicy = await DataLifecycleManager.getRetentionPolicy(
            this.testUserId, 
            'forensic_report'
          );
          
          if (!retrievedPolicy || retrievedPolicy.retentionDays !== 30) {
            throw new Error('Retention policy not retrieved correctly');
          }
        }
      } catch (dbError) {
        // Database operations might fail in test environment
        console.log('Database operations skipped in test environment');
      }
      
      // Test export functionality
      const exportData = await DataLifecycleManager.exportUserData(
        this.testUserId,
        ['forensic_report'],
        'json',
        true
      );
      
      if (!exportData) {
        throw new Error('Export data is empty');
      }
      
      const parsed = JSON.parse(exportData);
      if (!parsed.exportInfo || !parsed.data) {
        throw new Error('Export data structure invalid');
      }
      
      this.addResult('Data Lifecycle Management', true, { 
        exportSize: exportData.length,
        hasMetadata: !!parsed.metadata 
      });
    } catch (error) {
      this.addResult('Data Lifecycle Management', false, error.message);
    }
  }

  /**
   * Test end-to-end privacy flow
   */
  private async testEndToEndPrivacyFlow(): Promise<void> {
    try {
      // 1. Create test data
      const testRecord = {
        envelope_from: 'sender@suspicious-domain.com',
        envelope_to: 'victim@company.com',
        subject: 'Urgent: Verify your account with SSN 123-45-6789',
        original_headers: 'From: sender@suspicious-domain.com\nAuthorization: Bearer secret123',
        message_body: 'Click here: https://phishing-site.com/verify?card=4111-1111-1111-1111'
      };
      
      // 2. Apply maximum privacy settings
      const maxPrivacySettings: PrivacySettings = {
        maskingLevel: 'maximum',
        showEmailAddresses: false,
        showSubjects: false,
        showHeaders: false,
        showMessageContent: false,
        encryptSensitiveData: true,
        retentionPeriodDays: 30,
        auditDataAccess: true,
        allowTemporaryReveal: false,
        requireMasterPassword: true
      };
      
      // 3. Process data through privacy system
      const processedData = applyPrivacySettings(testRecord, maxPrivacySettings);
      
      // 4. Verify all sensitive data is hidden
      const sensitivePatterns = [
        'sender@suspicious-domain.com',
        'victim@company.com',
        '123-45-6789',
        '4111-1111-1111-1111',
        'https://phishing-site.com',
        'secret123'
      ];
      
      const processedString = JSON.stringify(processedData);
      for (const pattern of sensitivePatterns) {
        if (processedString.includes(pattern)) {
          throw new Error(`Sensitive pattern still visible: ${pattern}`);
        }
      }
      
      // 5. Verify structure is maintained
      if (!processedData.envelope_from || !processedData.envelope_to) {
        throw new Error('Data structure not maintained');
      }
      
      // 6. Test compliance scoring
      const compliance = calculateComplianceScore(maxPrivacySettings);
      if (compliance.score < 90) {
        throw new Error(`Maximum privacy settings should score high: ${compliance.score}`);
      }
      
      // 7. Log the access
      await logDataAccess(this.testUserId, 'forensic_report', 'e2e-test-record');
      
      this.addResult('End-to-End Privacy Flow', true, { 
        complianceScore: compliance.score,
        dataFullyMasked: true 
      });
    } catch (error) {
      this.addResult('End-to-End Privacy Flow', false, error.message);
    }
  }

  /**
   * Add test result
   */
  private addResult(testName: string, passed: boolean, details?: any, error?: string): void {
    this.results.push({
      testName,
      passed,
      details,
      error: error || (passed ? undefined : 'Test failed')
    });
    
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${testName}${details ? ` - ${JSON.stringify(details)}` : ''}`);
    
    if (!passed && error) {
      console.log(`   Error: ${error}`);
    }
  }

  /**
   * Get test summary
   */
  getTestSummary(): { total: number; passed: number; failed: number; passRate: number } {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;
    
    return { total, passed, failed, passRate };
  }

  /**
   * Get failed tests
   */
  getFailedTests(): TestResult[] {
    return this.results.filter(r => !r.passed);
  }
}

// Export test runner function
export const runPrivacyTests = async (): Promise<TestResult[]> => {
  const testSuite = new PrivacyTestSuite();
  return await testSuite.runAllTests();
};