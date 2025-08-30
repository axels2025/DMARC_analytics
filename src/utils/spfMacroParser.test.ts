import { describe, test, expect } from 'vitest';
import { 
  parseSPFMacros, 
  expandSPFMacro, 
  MacroExpansionContext,
  SPFMacro 
} from './spfMacroParser';

describe('SPF Macro Parser', () => {
  describe('parseSPFMacros', () => {
    test('should parse simple macros correctly', () => {
      const result = parseSPFMacros('include:_spf.%{d}');
      
      expect(result.totalMacros).toBe(1);
      expect(result.macros).toHaveLength(1);
      expect(result.macros[0]).toEqual({
        raw: '%{d}',
        type: 'd',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'low'
      });
    });

    test('should parse macros with modifiers', () => {
      const result = parseSPFMacros('exists:%{ir}.%{l1r+-}.%{d2}');
      
      expect(result.totalMacros).toBe(3);
      
      // Test reverse IP macro
      expect(result.macros[0]).toEqual({
        raw: '%{ir}',
        type: 'i',
        digits: undefined,
        reverse: true,
        delimiters: [],
        securityRisk: 'medium'
      });

      // Test local part macro with modifiers  
      expect(result.macros[1]).toEqual({
        raw: '%{l1r+-}',
        type: 'l',
        digits: 1,
        reverse: true,
        delimiters: ['+', '-'],
        securityRisk: 'high'
      });

      // Test domain macro with digits
      expect(result.macros[2]).toEqual({
        raw: '%{d2}',
        type: 'd',
        digits: 2,
        reverse: false,
        delimiters: [],
        securityRisk: 'low'
      });
    });

    test('should handle security risk assessment', () => {
      const highRiskResult = parseSPFMacros('include:%{s}.%{l}.%{o}');
      expect(highRiskResult.securityRisks).toContain('Sender domain macro (%{s}) can be spoofed by attackers');
      expect(highRiskResult.securityRisks).toContain('Local part macro (%{l}) may expose email addresses');
      expect(highRiskResult.securityRisks).toContain('Sender domain macro (%{o}) can be spoofed by attackers');
    });

    test('should calculate complexity score', () => {
      const simpleResult = parseSPFMacros('include:_spf.%{d}');
      expect(simpleResult.complexityScore).toBe(10); // Base score for domain macro

      const complexResult = parseSPFMacros('exists:%{ir}.%{l1r+-}.%{d2}');
      expect(complexResult.complexityScore).toBeGreaterThan(30); // Multiple macros with modifiers
    });

    test('should identify performance warnings', () => {
      const result = parseSPFMacros('exists:%{i1}.%{i2}.%{i3}.%{i4}.%{i5}.%{i6}');
      expect(result.performanceWarnings).toContain('6 macros in single mechanism may impact DNS resolution performance');
    });

    test('should handle escaped characters', () => {
      const result = parseSPFMacros('exists:test%%literal%{d}');
      expect(result.totalMacros).toBe(1);
      expect(result.macros[0].raw).toBe('%{d}');
    });

    test('should handle invalid macro formats', () => {
      const result = parseSPFMacros('include:%{invalid}');
      expect(result.totalMacros).toBe(0);
      expect(result.errors).toContain('Invalid macro format: %{invalid}');
    });
  });

  describe('expandSPFMacro', () => {
    const context: MacroExpansionContext = {
      senderIP: '192.168.1.1',
      senderDomain: 'example.com',
      recipientDomain: 'recipient.com',
      localPart: 'user',
      validatedDomain: 'example.com'
    };

    test('should expand domain macro', () => {
      const macro: SPFMacro = {
        raw: '%{d}',
        type: 'd',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'low'
      };
      
      const result = expandSPFMacro(macro, context);
      expect(result).toBe('example.com');
    });

    test('should expand IP macro', () => {
      const macro: SPFMacro = {
        raw: '%{i}',
        type: 'i',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'low'
      };
      
      const result = expandSPFMacro(macro, context);
      expect(result).toBe('192.168.1.1');
    });

    test('should expand reversed IP macro', () => {
      const macro: SPFMacro = {
        raw: '%{ir}',
        type: 'i',
        digits: undefined,
        reverse: true,
        delimiters: [],
        securityRisk: 'medium'
      };
      
      const result = expandSPFMacro(macro, context);
      expect(result).toBe('1.1.168.192');
    });

    test('should apply digit limits', () => {
      const macro: SPFMacro = {
        raw: '%{d2}',
        type: 'd',
        digits: 2,
        reverse: false,
        delimiters: [],
        securityRisk: 'low'
      };
      
      const result = expandSPFMacro(macro, context);
      expect(result).toBe('example.com'); // Should return last 2 components
    });

    test('should handle sender domain macro', () => {
      const macro: SPFMacro = {
        raw: '%{s}',
        type: 's',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'high'
      };
      
      const result = expandSPFMacro(macro, context);
      expect(result).toBe('user@example.com');
    });

    test('should handle local part macro', () => {
      const macro: SPFMacro = {
        raw: '%{l}',
        type: 'l',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'medium'
      };
      
      const result = expandSPFMacro(macro, context);
      expect(result).toBe('user');
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle empty strings', () => {
      const result = parseSPFMacros('');
      expect(result.totalMacros).toBe(0);
      expect(result.macros).toHaveLength(0);
    });

    test('should handle strings without macros', () => {
      const result = parseSPFMacros('include:_spf.google.com');
      expect(result.totalMacros).toBe(0);
      expect(result.macros).toHaveLength(0);
    });

    test('should handle malformed macros', () => {
      const result = parseSPFMacros('include:%{d.test}');
      expect(result.totalMacros).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle context without required fields', () => {
      const incompleteMacro: SPFMacro = {
        raw: '%{s}',
        type: 's',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'high'
      };

      const incompleteContext: Partial<MacroExpansionContext> = {
        senderIP: '192.168.1.1'
      };

      const result = expandSPFMacro(incompleteMacro, incompleteContext as MacroExpansionContext);
      expect(result).toBe('unknown@unknown'); // Should handle missing context gracefully
    });
  });

  describe('Security risk assessment', () => {
    test('should identify high-risk macros', () => {
      const result = parseSPFMacros('include:%{s}.%{l}.%{c}');
      expect(result.securityRisks.length).toBeGreaterThan(0);
      
      // Check for specific security risks
      const hasSpoofiingRisk = result.securityRisks.some(risk => 
        risk.includes('spoofed') || risk.includes('expose')
      );
      expect(hasSpoofiingRisk).toBe(true);
    });

    test('should assess low risk for domain macros', () => {
      const result = parseSPFMacros('include:_spf.%{d}');
      expect(result.macros[0].securityRisk).toBe('low');
    });

    test('should assess high risk for sender macros', () => {
      const result = parseSPFMacros('include:%{s}');
      expect(result.macros[0].securityRisk).toBe('high');
    });
  });

  describe('Performance analysis', () => {
    test('should warn about excessive macro usage', () => {
      const manyMacros = 'exists:%{d}.%{i}.%{s}.%{l}.%{o}.%{h}';
      const result = parseSPFMacros(manyMacros);
      
      expect(result.performanceWarnings.length).toBeGreaterThan(0);
      const hasPerformanceWarning = result.performanceWarnings.some(warning =>
        warning.includes('performance') || warning.includes('DNS')
      );
      expect(hasPerformanceWarning).toBe(true);
    });

    test('should calculate appropriate complexity scores', () => {
      const simple = parseSPFMacros('include:%{d}');
      const complex = parseSPFMacros('exists:%{ir}.%{l1r+-}.%{d2}.%{h3r+_}');
      
      expect(complex.complexityScore).toBeGreaterThan(simple.complexityScore);
    });
  });
});