import { describe, test, expect } from 'vitest';
import { 
  parseSPFRecordFromString, 
  analyzeSPFRecord,
  SPFRecord 
} from './spfParser';

describe('SPF Parser with Macro Integration', () => {
  describe('parseSPFRecordFromString with macros', () => {
    test('should parse SPF record with simple macros', () => {
      const spfString = 'v=spf1 include:_spf.%{d} ip4:192.168.1.0/24 ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroCount).toBe(1);
      expect(record.macroSecurityRisk).toBe('low');
      expect(record.macroComplexityScore).toBe(10);

      // Check mechanism has macro information
      const includeMechanism = record.mechanisms.find(m => m.type === 'include');
      expect(includeMechanism).toBeDefined();
      expect(includeMechanism!.hasMacros).toBe(true);
      expect(includeMechanism!.macroCount).toBe(1);
      expect(includeMechanism!.macroPatterns).toEqual(['%{d}']);
    });

    test('should parse SPF record with complex macros', () => {
      const spfString = 'v=spf1 exists:%{ir}.%{l1r+-}.blacklist.com include:%{s}.spf.org ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroCount).toBe(3);
      expect(record.macroSecurityRisk).toBe('high'); // Due to %{s} macro
      expect(record.macroComplexityScore).toBeGreaterThan(30);

      // Check exists mechanism
      const existsMechanism = record.mechanisms.find(m => m.type === 'exists');
      expect(existsMechanism).toBeDefined();
      expect(existsMechanism!.hasMacros).toBe(true);
      expect(existsMechanism!.macroCount).toBe(2);
      expect(existsMechanism!.macroPatterns).toEqual(['%{ir}', '%{l1r+-}']);

      // Check include mechanism
      const includeMechanism = record.mechanisms.find(m => m.type === 'include');
      expect(includeMechanism).toBeDefined();
      expect(includeMechanism!.hasMacros).toBe(true);
      expect(includeMechanism!.macroCount).toBe(1);
      expect(includeMechanism!.macroPatterns).toEqual(['%{s}']);
    });

    test('should parse modifiers with macros', () => {
      const spfString = 'v=spf1 include:_spf.google.com redirect=%{d}.backup.com';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroCount).toBe(1);

      // Check redirect modifier
      const redirectModifier = record.modifiers.find(m => m.type === 'redirect');
      expect(redirectModifier).toBeDefined();
      expect(redirectModifier!.hasMacros).toBe(true);
      expect(redirectModifier!.macroCount).toBe(1);
      expect(redirectModifier!.macroPatterns).toEqual(['%{d}']);
    });

    test('should handle macro security warnings', () => {
      const spfString = 'v=spf1 include:%{s}.unsafe.com exists:%{l}.%{o}.risky.org ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.macroSecurityRisk).toBe('high');
      expect(record.warnings.length).toBeGreaterThan(0);

      // Should have macro-related warnings
      const hasMacroWarning = record.warnings.some(warning =>
        warning.includes('macro') || warning.includes('security')
      );
      expect(hasMacroWarning).toBe(true);
    });

    test('should handle performance warnings for many macros', () => {
      const spfString = 'v=spf1 exists:%{i}.%{d}.%{s}.%{l}.%{o}.%{h}.many-macros.com ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.macroCount).toBe(6);
      expect(record.warnings.length).toBeGreaterThan(0);

      // Should warn about high macro count
      const hasPerformanceWarning = record.warnings.some(warning =>
        warning.includes('performance') || warning.includes('number of macros')
      );
      expect(hasPerformanceWarning).toBe(true);
    });

    test('should handle complexity warnings', () => {
      const spfString = 'v=spf1 exists:%{ir}.%{l5r+-._}.%{d3}.%{h2r+/=}.complex.com ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.macroComplexityScore).toBeGreaterThan(70);
      expect(record.warnings.length).toBeGreaterThan(0);

      // Should warn about complexity
      const hasComplexityWarning = record.warnings.some(warning =>
        warning.includes('Complex') || warning.includes('maintain')
      );
      expect(hasComplexityWarning).toBe(true);
    });

    test('should handle records without macros', () => {
      const spfString = 'v=spf1 include:_spf.google.com include:mailgun.org ip4:192.168.1.0/24 ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(false);
      expect(record.macroCount).toBe(0);
      expect(record.macroComplexityScore).toBe(0);
      expect(record.macroSecurityRisk).toBe('low');

      // All mechanisms should have no macros
      record.mechanisms.forEach(mechanism => {
        expect(mechanism.hasMacros).toBe(false);
        expect(mechanism.macroCount).toBe(0);
        expect(mechanism.macroPatterns).toEqual([]);
      });

      // All modifiers should have no macros
      record.modifiers.forEach(modifier => {
        expect(modifier.hasMacros).toBe(false);
        expect(modifier.macroCount).toBe(0);
        expect(modifier.macroPatterns).toEqual([]);
      });
    });
  });

  describe('analyzeSPFRecord with macro analysis', () => {
    test('should include macro analysis for records with macros', async () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:_spf.%{d} exists:%{i}.blacklist.com ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'include',
            value: '_spf.%{d}',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 1,
            macroPatterns: ['%{d}']
          },
          {
            type: 'exists',
            value: '%{i}.blacklist.com',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 1,
            macroPatterns: ['%{i}']
          }
        ],
        modifiers: [],
        totalLookups: 2,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 2,
        macroComplexityScore: 25,
        macroSecurityRisk: 'medium'
      };

      const analysis = await analyzeSPFRecord(record);

      expect(analysis.macroAnalysis).toBeDefined();
      expect(analysis.macroAnalysis!.hasMacros).toBe(true);
      expect(analysis.macroAnalysis!.totalMacros).toBe(2);
      expect(analysis.macroAnalysis!.securityAssessment.riskLevel).toBe('medium');
    });

    test('should upgrade risk level based on macro analysis', async () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:%{s}.malicious.com ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'include',
            value: '%{s}.malicious.com',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 1,
            macroPatterns: ['%{s}']
          }
        ],
        modifiers: [],
        totalLookups: 1,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 1,
        macroComplexityScore: 30,
        macroSecurityRisk: 'high'
      };

      const analysis = await analyzeSPFRecord(record);

      // Risk level should be upgraded due to high-risk macro
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.macroAnalysis).toBeDefined();
      expect(analysis.macroAnalysis!.securityAssessment.riskLevel).toBe('high');
    });

    test('should not include macro analysis for records without macros', async () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:_spf.google.com ip4:192.168.1.0/24 ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'include',
            value: '_spf.google.com',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: false,
            macroCount: 0,
            macroPatterns: []
          },
          {
            type: 'ip4',
            value: '192.168.1.0/24',
            qualifier: '+',
            lookupCount: 0,
            resolvedIPs: [],
            errors: [],
            hasMacros: false,
            macroCount: 0,
            macroPatterns: []
          }
        ],
        modifiers: [],
        totalLookups: 1,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: false,
        macroCount: 0,
        macroComplexityScore: 0,
        macroSecurityRisk: 'low'
      };

      const analysis = await analyzeSPFRecord(record);

      expect(analysis.macroAnalysis).toBeUndefined();
      expect(analysis.riskLevel).toBe('low'); // Should be based on DNS lookups only
    });
  });

  describe('Real-world SPF records with macros', () => {
    test('should handle Google Workspace style macros', () => {
      const spfString = 'v=spf1 include:_spf.google.com include:_spf.%{d}.custom.com ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroSecurityRisk).toBe('low'); // Domain macro is low risk
    });

    test('should handle Microsoft 365 style exists checks', () => {
      const spfString = 'v=spf1 include:spf.protection.outlook.com exists:%{i}.spamhaus.org ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroSecurityRisk).toBe('medium'); // IP macro has medium risk
    });

    test('should handle complex enterprise SPF with multiple macro types', () => {
      const spfString = 'v=spf1 exists:%{ir}.%{v}.%{h}.enterprise.com include:_%{d}.spf.company.com redirect=%{d}.fallback.com';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroCount).toBe(4);
      expect(record.macroComplexityScore).toBeGreaterThan(30);

      // Should have macro information distributed across mechanisms and modifiers
      const existsMechanism = record.mechanisms.find(m => m.type === 'exists');
      expect(existsMechanism!.macroCount).toBe(3);

      const includeMechanism = record.mechanisms.find(m => m.type === 'include');
      expect(includeMechanism!.macroCount).toBe(1);

      const redirectModifier = record.modifiers.find(m => m.type === 'redirect');
      expect(redirectModifier!.macroCount).toBe(1);
    });

    test('should handle exp modifier with macros', () => {
      const spfString = 'v=spf1 include:_spf.google.com ~all exp=%{ir}.%{l}.explanation.%{d}';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroCount).toBe(3);

      const expModifier = record.modifiers.find(m => m.type === 'exp');
      expect(expModifier).toBeDefined();
      expect(expModifier!.hasMacros).toBe(true);
      expect(expModifier!.macroCount).toBe(3);
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle malformed macros gracefully', () => {
      const spfString = 'v=spf1 include:%{invalid}.test.com include:_spf.%{d} ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(true);
      expect(record.macroCount).toBe(1); // Only valid %{d} macro should be counted

      // Should have mechanism-level errors for invalid macros
      const invalidMechanism = record.mechanisms.find(m => m.value.includes('invalid'));
      expect(invalidMechanism!.errors.length).toBeGreaterThan(0);
    });

    test('should maintain backwards compatibility with non-macro records', () => {
      const spfString = 'v=spf1 include:_spf.google.com include:mailgun.org ip4:203.0.113.0/24 ~all';
      const record = parseSPFRecordFromString(spfString);

      expect(record.isValid).toBe(true);
      expect(record.hasMacros).toBe(false);
      expect(record.macroCount).toBe(0);
      expect(record.macroComplexityScore).toBe(0);
      expect(record.macroSecurityRisk).toBe('low');

      // Should still parse all mechanisms correctly
      expect(record.mechanisms).toHaveLength(3);
      expect(record.totalLookups).toBe(2);
    });
  });
});