import { describe, test, expect } from 'vitest';
import { analyzeSPFRecordMacros, MacroExpansionContext } from './spfMacroAnalysis';
import { SPFRecord } from './spfParser';

describe('SPF Macro Analysis Engine', () => {
  const mockContext: MacroExpansionContext = {
    senderIP: '192.168.1.100',
    senderDomain: 'test.com',
    recipientDomain: 'example.com',
    localPart: 'testuser',
    validatedDomain: 'test.com'
  };

  describe('analyzeSPFRecordMacros', () => {
    test('should analyze record without macros', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:_spf.google.com include:mailgun.org ip4:192.168.1.0/24 ~all',
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
            type: 'include',
            value: 'mailgun.org',
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
        totalLookups: 2,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: false,
        macroCount: 0,
        macroComplexityScore: 0,
        macroSecurityRisk: 'low'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.hasMacros).toBe(false);
      expect(analysis.totalMacros).toBe(0);
      expect(analysis.securityAssessment.riskLevel).toBe('low');
      expect(analysis.performanceImpact.dnsLookupsPerEmail).toBe(0);
      expect(analysis.mechanismAnalysis).toHaveLength(0);
    });

    test('should analyze record with simple macros', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:_spf.%{d} exists:%{i}.blacklist.example.com ~all',
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
            value: '%{i}.blacklist.example.com',
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
        macroComplexityScore: 20,
        macroSecurityRisk: 'medium'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.hasMacros).toBe(true);
      expect(analysis.totalMacros).toBe(2);
      expect(analysis.securityAssessment.riskLevel).toBe('medium');
      expect(analysis.performanceImpact.dnsLookupsPerEmail).toBe(2);
      expect(analysis.mechanismAnalysis).toHaveLength(2);
      
      // Check mechanism-specific analysis
      const includeMechanism = analysis.mechanismAnalysis.find(m => m.mechanism.type === 'include');
      expect(includeMechanism).toBeDefined();
      expect(includeMechanism!.expandedValue).toBe('_spf.test.com');
      
      const existsMechanism = analysis.mechanismAnalysis.find(m => m.mechanism.type === 'exists');
      expect(existsMechanism).toBeDefined();
      expect(existsMechanism!.expandedValue).toBe('192.168.1.100.blacklist.example.com');
    });

    test('should analyze high-risk macros', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:%{s}.spammer.com exists:%{l}.%{o}.malicious.org ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'include',
            value: '%{s}.spammer.com',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 1,
            macroPatterns: ['%{s}']
          },
          {
            type: 'exists',
            value: '%{l}.%{o}.malicious.org',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 2,
            macroPatterns: ['%{l}', '%{o}']
          }
        ],
        modifiers: [],
        totalLookups: 2,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 3,
        macroComplexityScore: 70,
        macroSecurityRisk: 'high'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.securityAssessment.riskLevel).toBe('high');
      expect(analysis.securityAssessment.vulnerabilities.length).toBeGreaterThan(0);
      expect(analysis.securityAssessment.recommendations.length).toBeGreaterThan(0);
      
      // Should identify spoofing risks
      const hasSpoofingRisk = analysis.securityAssessment.vulnerabilities.some(vuln =>
        vuln.includes('spoof') || vuln.includes('forge')
      );
      expect(hasSpoofingRisk).toBe(true);
    });

    test('should analyze complex macros with modifiers', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 exists:%{ir}.%{l1r+-}.%{d2}.complex.example.com ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'exists',
            value: '%{ir}.%{l1r+-}.%{d2}.complex.example.com',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 3,
            macroPatterns: ['%{ir}', '%{l1r+-}', '%{d2}']
          }
        ],
        modifiers: [],
        totalLookups: 1,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 3,
        macroComplexityScore: 85,
        macroSecurityRisk: 'high'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.complexityAnalysis.overallComplexity).toBeGreaterThan(50);
      expect(analysis.complexityAnalysis.maintenanceConcerns.length).toBeGreaterThan(0);
      
      // Check expanded value with complex modifiers
      const mechanism = analysis.mechanismAnalysis[0];
      expect(mechanism.expandedValue).toContain('100.1.168.192'); // Reversed IP
      expect(mechanism.macros.length).toBe(3);
    });

    test('should provide optimization recommendations', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 exists:%{i}.%{i}.%{i}.redundant.example.com include:%{s}.unsafe.com ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'exists',
            value: '%{i}.%{i}.%{i}.redundant.example.com',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 3,
            macroPatterns: ['%{i}', '%{i}', '%{i}']
          },
          {
            type: 'include',
            value: '%{s}.unsafe.com',
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
        totalLookups: 2,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 4,
        macroComplexityScore: 90,
        macroSecurityRisk: 'high'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.optimizationSuggestions.length).toBeGreaterThan(0);
      
      // Should suggest reducing redundant macros
      const hasRedundancyRecommendation = analysis.optimizationSuggestions.some(suggestion =>
        suggestion.includes('redundant') || suggestion.includes('simplify')
      );
      expect(hasRedundancyRecommendation).toBe(true);

      // Should suggest addressing security concerns
      const hasSecurityRecommendation = analysis.optimizationSuggestions.some(suggestion =>
        suggestion.includes('security') || suggestion.includes('safe')
      );
      expect(hasSecurityRecommendation).toBe(true);
    });

    test('should analyze performance impact correctly', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 exists:%{i}.check1.com exists:%{d}.check2.com exists:%{s}.check3.com ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'exists',
            value: '%{i}.check1.com',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 1,
            macroPatterns: ['%{i}']
          },
          {
            type: 'exists',
            value: '%{d}.check2.com',
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
            value: '%{s}.check3.com',
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
        totalLookups: 3,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 3,
        macroComplexityScore: 45,
        macroSecurityRisk: 'high'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.performanceImpact.dnsLookupsPerEmail).toBe(3);
      expect(analysis.performanceImpact.processingOverhead).toBe('medium');
      expect(analysis.performanceImpact.cachingEffectiveness).toBe('low');
      expect(analysis.performanceImpact.concerns.length).toBeGreaterThan(0);
    });

    test('should handle modifier macros', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:_spf.google.com redirect=%{d}.backup.com',
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
          }
        ],
        modifiers: [
          {
            type: 'redirect',
            value: '%{d}.backup.com',
            lookupCount: 1,
            hasMacros: true,
            macroCount: 1,
            macroPatterns: ['%{d}']
          }
        ],
        totalLookups: 2,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 1,
        macroComplexityScore: 10,
        macroSecurityRisk: 'low'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.hasMacros).toBe(true);
      expect(analysis.totalMacros).toBe(1);
      expect(analysis.modifierAnalysis).toHaveLength(1);
      expect(analysis.modifierAnalysis[0].expandedValue).toBe('test.com.backup.com');
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle records with no mechanisms or modifiers', () => {
      const record: SPFRecord = {
        raw: 'v=spf1',
        version: 'v=spf1',
        mechanisms: [],
        modifiers: [],
        totalLookups: 0,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: false,
        macroCount: 0,
        macroComplexityScore: 0,
        macroSecurityRisk: 'low'
      };

      const analysis = analyzeSPFRecordMacros(record, mockContext);

      expect(analysis.hasMacros).toBe(false);
      expect(analysis.totalMacros).toBe(0);
      expect(analysis.mechanismAnalysis).toHaveLength(0);
      expect(analysis.modifierAnalysis).toHaveLength(0);
    });

    test('should handle missing context gracefully', () => {
      const record: SPFRecord = {
        raw: 'v=spf1 include:%{d} ~all',
        version: 'v=spf1',
        mechanisms: [
          {
            type: 'include',
            value: '%{d}',
            qualifier: '+',
            lookupCount: 1,
            resolvedIPs: [],
            errors: [],
            hasMacros: true,
            macroCount: 1,
            macroPatterns: ['%{d}']
          }
        ],
        modifiers: [],
        totalLookups: 1,
        isValid: true,
        errors: [],
        warnings: [],
        hasMacros: true,
        macroCount: 1,
        macroComplexityScore: 10,
        macroSecurityRisk: 'low'
      };

      // Test with undefined context
      const analysis = analyzeSPFRecordMacros(record);

      expect(analysis.hasMacros).toBe(true);
      expect(analysis.mechanismAnalysis[0].expandedValue).toBe('unknown');
    });
  });
});