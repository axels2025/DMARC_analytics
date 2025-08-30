/**
 * Comprehensive validation script for SPF Macro functionality
 * Tests all components of the macro system end-to-end
 */

import { parseSPFMacros, expandSPFMacro, MacroExpansionContext } from './spfMacroParser';
import { analyzeSPFRecordMacros } from './spfMacroAnalysis';
import { parseSPFRecordFromString, analyzeSPFRecord } from './spfParser';

interface ValidationResult {
  testName: string;
  passed: boolean;
  error?: string;
  details?: any;
}

interface ValidationSuite {
  suiteName: string;
  results: ValidationResult[];
  passed: number;
  total: number;
}

/**
 * Run comprehensive validation of SPF Macro functionality
 */
export async function validateSPFMacroSystem(): Promise<ValidationSuite[]> {
  const suites: ValidationSuite[] = [];

  // Test SPF Macro Parser
  suites.push(await validateMacroParser());
  
  // Test SPF Macro Analysis Engine
  suites.push(await validateMacroAnalysis());
  
  // Test SPF Parser Integration
  suites.push(await validateSPFParserIntegration());
  
  // Test Real-world Scenarios
  suites.push(await validateRealWorldScenarios());

  return suites;
}

async function validateMacroParser(): Promise<ValidationSuite> {
  const results: ValidationResult[] = [];
  const testContext: MacroExpansionContext = {
    senderIP: '192.168.1.100',
    senderDomain: 'test.example.com',
    recipientDomain: 'recipient.com',
    localPart: 'testuser',
    validatedDomain: 'test.example.com'
  };

  // Test 1: Basic macro parsing
  try {
    const result = parseSPFMacros('include:_spf.%{d}');
    const passed = result.totalMacros === 1 && 
                  result.macros[0].type === 'd' && 
                  result.macros[0].securityRisk === 'low';
    results.push({
      testName: 'Basic Domain Macro Parsing',
      passed,
      details: result
    });
  } catch (error) {
    results.push({
      testName: 'Basic Domain Macro Parsing',
      passed: false,
      error: String(error)
    });
  }

  // Test 2: Complex macro parsing
  try {
    const result = parseSPFMacros('exists:%{ir}.%{l1r+-}.%{d2}');
    const passed = result.totalMacros === 3 &&
                  result.macros.some(m => m.type === 'i' && m.reverse === true) &&
                  result.macros.some(m => m.type === 'l' && m.digits === 1);
    results.push({
      testName: 'Complex Macro Parsing with Modifiers',
      passed,
      details: result
    });
  } catch (error) {
    results.push({
      testName: 'Complex Macro Parsing with Modifiers',
      passed: false,
      error: String(error)
    });
  }

  // Test 3: Macro expansion
  try {
    const macro = {
      raw: '%{d}',
      type: 'd' as const,
      digits: undefined,
      reverse: false,
      delimiters: [],
      securityRisk: 'low' as const
    };
    const expanded = expandSPFMacro(macro, testContext);
    const passed = expanded === 'test.example.com';
    results.push({
      testName: 'Domain Macro Expansion',
      passed,
      details: { expected: 'test.example.com', actual: expanded }
    });
  } catch (error) {
    results.push({
      testName: 'Domain Macro Expansion',
      passed: false,
      error: String(error)
    });
  }

  // Test 4: Reverse IP expansion
  try {
    const macro = {
      raw: '%{ir}',
      type: 'i' as const,
      digits: undefined,
      reverse: true,
      delimiters: [],
      securityRisk: 'medium' as const
    };
    const expanded = expandSPFMacro(macro, testContext);
    const passed = expanded === '100.1.168.192';
    results.push({
      testName: 'Reverse IP Macro Expansion',
      passed,
      details: { expected: '100.1.168.192', actual: expanded }
    });
  } catch (error) {
    results.push({
      testName: 'Reverse IP Macro Expansion',
      passed: false,
      error: String(error)
    });
  }

  // Test 5: Security risk assessment
  try {
    const result = parseSPFMacros('include:%{s}.unsafe.com');
    const passed = result.macros[0].securityRisk === 'high' &&
                  result.securityRisks.length > 0;
    results.push({
      testName: 'Security Risk Assessment',
      passed,
      details: result
    });
  } catch (error) {
    results.push({
      testName: 'Security Risk Assessment',
      passed: false,
      error: String(error)
    });
  }

  return {
    suiteName: 'SPF Macro Parser',
    results,
    passed: results.filter(r => r.passed).length,
    total: results.length
  };
}

async function validateMacroAnalysis(): Promise<ValidationSuite> {
  const results: ValidationResult[] = [];
  const testContext: MacroExpansionContext = {
    senderIP: '10.0.0.50',
    senderDomain: 'sender.org',
    recipientDomain: 'recipient.net',
    localPart: 'admin',
    validatedDomain: 'sender.org'
  };

  // Test 1: Basic macro analysis
  try {
    const spfRecord = parseSPFRecordFromString('v=spf1 include:_spf.%{d} ~all');
    const analysis = analyzeSPFRecordMacros(spfRecord, testContext);
    
    const passed = analysis.hasMacros === true &&
                  analysis.totalMacros === 1 &&
                  analysis.securityAssessment.riskLevel === 'low';
    
    results.push({
      testName: 'Basic Macro Analysis',
      passed,
      details: analysis
    });
  } catch (error) {
    results.push({
      testName: 'Basic Macro Analysis',
      passed: false,
      error: String(error)
    });
  }

  // Test 2: High-risk macro analysis
  try {
    const spfRecord = parseSPFRecordFromString('v=spf1 include:%{s}.malicious.com ~all');
    const analysis = analyzeSPFRecordMacros(spfRecord, testContext);
    
    const passed = analysis.securityAssessment.riskLevel === 'high' &&
                  analysis.securityAssessment.vulnerabilities.length > 0;
    
    results.push({
      testName: 'High-Risk Macro Analysis',
      passed,
      details: analysis
    });
  } catch (error) {
    results.push({
      testName: 'High-Risk Macro Analysis',
      passed: false,
      error: String(error)
    });
  }

  // Test 3: Performance impact analysis
  try {
    const spfRecord = parseSPFRecordFromString('v=spf1 exists:%{i}.%{d}.%{s}.perf-test.com ~all');
    const analysis = analyzeSPFRecordMacros(spfRecord, testContext);
    
    const passed = analysis.performanceImpact.dnsLookupsPerEmail > 0 &&
                  analysis.performanceImpact.processingOverhead !== 'low';
    
    results.push({
      testName: 'Performance Impact Analysis',
      passed,
      details: analysis
    });
  } catch (error) {
    results.push({
      testName: 'Performance Impact Analysis',
      passed: false,
      error: String(error)
    });
  }

  // Test 4: Optimization suggestions
  try {
    const spfRecord = parseSPFRecordFromString('v=spf1 exists:%{i}.%{i}.%{i}.redundant.com ~all');
    const analysis = analyzeSPFRecordMacros(spfRecord, testContext);
    
    const passed = analysis.optimizationSuggestions.length > 0;
    
    results.push({
      testName: 'Optimization Suggestions',
      passed,
      details: analysis.optimizationSuggestions
    });
  } catch (error) {
    results.push({
      testName: 'Optimization Suggestions',
      passed: false,
      error: String(error)
    });
  }

  return {
    suiteName: 'SPF Macro Analysis Engine',
    results,
    passed: results.filter(r => r.passed).length,
    total: results.length
  };
}

async function validateSPFParserIntegration(): Promise<ValidationSuite> {
  const results: ValidationResult[] = [];

  // Test 1: SPF record with macros integration
  try {
    const record = parseSPFRecordFromString('v=spf1 include:_spf.%{d} exists:%{i}.test.com ~all');
    
    const passed = record.hasMacros === true &&
                  record.macroCount === 2 &&
                  record.mechanisms.some(m => m.hasMacros) &&
                  record.macroSecurityRisk !== undefined;
    
    results.push({
      testName: 'SPF Parser Macro Integration',
      passed,
      details: {
        hasMacros: record.hasMacros,
        macroCount: record.macroCount,
        macroSecurityRisk: record.macroSecurityRisk
      }
    });
  } catch (error) {
    results.push({
      testName: 'SPF Parser Macro Integration',
      passed: false,
      error: String(error)
    });
  }

  // Test 2: SPF analysis with macro analysis
  try {
    const record = parseSPFRecordFromString('v=spf1 include:%{s}.risky.com ~all');
    const analysis = await analyzeSPFRecord(record);
    
    const passed = analysis.macroAnalysis !== undefined &&
                  analysis.riskLevel === 'high'; // Should be upgraded due to macro risk
    
    results.push({
      testName: 'SPF Analysis with Macro Analysis',
      passed,
      details: {
        hasMacroAnalysis: analysis.macroAnalysis !== undefined,
        riskLevel: analysis.riskLevel,
        macroRiskLevel: analysis.macroAnalysis?.securityAssessment.riskLevel
      }
    });
  } catch (error) {
    results.push({
      testName: 'SPF Analysis with Macro Analysis',
      passed: false,
      error: String(error)
    });
  }

  // Test 3: Macro warnings in SPF record
  try {
    const record = parseSPFRecordFromString('v=spf1 include:%{s}.%{l}.%{o}.dangerous.com ~all');
    
    const passed = record.warnings.length > 0 &&
                  record.warnings.some(w => w.includes('macro') || w.includes('security'));
    
    results.push({
      testName: 'Macro Security Warnings',
      passed,
      details: { warnings: record.warnings }
    });
  } catch (error) {
    results.push({
      testName: 'Macro Security Warnings',
      passed: false,
      error: String(error)
    });
  }

  return {
    suiteName: 'SPF Parser Integration',
    results,
    passed: results.filter(r => r.passed).length,
    total: results.length
  };
}

async function validateRealWorldScenarios(): Promise<ValidationSuite> {
  const results: ValidationResult[] = [];

  // Scenario 1: Google Workspace with custom domain macro
  try {
    const record = parseSPFRecordFromString('v=spf1 include:_spf.google.com include:_spf.%{d}.custom.com ~all');
    const analysis = await analyzeSPFRecord(record);
    
    const passed = record.hasMacros === true &&
                  record.macroSecurityRisk === 'low' &&
                  analysis.macroAnalysis !== undefined;
    
    results.push({
      testName: 'Google Workspace Custom Domain Scenario',
      passed,
      details: { 
        macroCount: record.macroCount,
        securityRisk: record.macroSecurityRisk 
      }
    });
  } catch (error) {
    results.push({
      testName: 'Google Workspace Custom Domain Scenario',
      passed: false,
      error: String(error)
    });
  }

  // Scenario 2: Anti-spam exists check
  try {
    const record = parseSPFRecordFromString('v=spf1 include:_spf.google.com exists:%{i}.zen.spamhaus.org ~all');
    const analysis = await analyzeSPFRecord(record);
    
    const passed = record.hasMacros === true &&
                  analysis.macroAnalysis?.mechanismAnalysis.some(m => 
                    m.mechanism.type === 'exists' && m.expandedValue.includes('zen.spamhaus.org')
                  );
    
    results.push({
      testName: 'Anti-spam Exists Check Scenario',
      passed,
      details: analysis.macroAnalysis?.mechanismAnalysis
    });
  } catch (error) {
    results.push({
      testName: 'Anti-spam Exists Check Scenario',
      passed: false,
      error: String(error)
    });
  }

  // Scenario 3: Complex enterprise SPF
  try {
    const record = parseSPFRecordFromString(
      'v=spf1 exists:%{ir}.%{v}.%{h}.enterprise.com include:_%{d}.spf.company.com redirect=%{d}.fallback.com'
    );
    const analysis = await analyzeSPFRecord(record);
    
    const passed = record.macroCount >= 4 &&
                  record.macroComplexityScore > 30 &&
                  analysis.macroAnalysis !== undefined;
    
    results.push({
      testName: 'Complex Enterprise SPF Scenario',
      passed,
      details: {
        macroCount: record.macroCount,
        complexityScore: record.macroComplexityScore,
        riskLevel: analysis.riskLevel
      }
    });
  } catch (error) {
    results.push({
      testName: 'Complex Enterprise SPF Scenario',
      passed: false,
      error: String(error)
    });
  }

  // Scenario 4: Malicious SPF with dangerous macros
  try {
    const record = parseSPFRecordFromString('v=spf1 include:%{s}.%{l}.%{c}.attacker.com ~all');
    
    const passed = record.macroSecurityRisk === 'high' &&
                  record.warnings.length > 0;
    
    results.push({
      testName: 'Malicious SPF Detection Scenario',
      passed,
      details: {
        securityRisk: record.macroSecurityRisk,
        warnings: record.warnings
      }
    });
  } catch (error) {
    results.push({
      testName: 'Malicious SPF Detection Scenario',
      passed: false,
      error: String(error)
    });
  }

  return {
    suiteName: 'Real-World Scenarios',
    results,
    passed: results.filter(r => r.passed).length,
    total: results.length
  };
}

/**
 * Generate a detailed validation report
 */
export function generateValidationReport(suites: ValidationSuite[]): string {
  let report = '# SPF Macro System Validation Report\n\n';
  
  const totalPassed = suites.reduce((sum, suite) => sum + suite.passed, 0);
  const totalTests = suites.reduce((sum, suite) => sum + suite.total, 0);
  const overallPercentage = Math.round((totalPassed / totalTests) * 100);
  
  report += `## Overall Results: ${totalPassed}/${totalTests} (${overallPercentage}%)\n\n`;
  
  suites.forEach(suite => {
    const percentage = Math.round((suite.passed / suite.total) * 100);
    report += `### ${suite.suiteName}: ${suite.passed}/${suite.total} (${percentage}%)\n\n`;
    
    suite.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      report += `${status} **${result.testName}**\n`;
      
      if (!result.passed && result.error) {
        report += `   Error: ${result.error}\n`;
      }
      
      report += '\n';
    });
  });
  
  return report;
}

/**
 * Run validation and log results
 */
export async function runValidation(): Promise<void> {
  console.log('🔍 Starting SPF Macro System Validation...\n');
  
  try {
    const suites = await validateSPFMacroSystem();
    const report = generateValidationReport(suites);
    
    console.log(report);
    
    const totalPassed = suites.reduce((sum, suite) => sum + suite.passed, 0);
    const totalTests = suites.reduce((sum, suite) => sum + suite.total, 0);
    
    if (totalPassed === totalTests) {
      console.log('🎉 All tests passed! SPF Macro system is fully functional.');
    } else {
      console.log(`⚠️  ${totalTests - totalPassed} test(s) failed. Review the results above.`);
    }
    
  } catch (error) {
    console.error('💥 Validation failed with error:', error);
  }
}

// Export for testing
export { validateMacroParser, validateMacroAnalysis, validateSPFParserIntegration, validateRealWorldScenarios };