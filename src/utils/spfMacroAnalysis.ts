/**
 * SPF Macro Analysis Engine
 * 
 * Advanced analysis of SPF macros for security, performance, and optimization insights.
 * Integrates with existing SPF parsing to provide comprehensive macro intelligence.
 */

import { 
  SPFMacro, 
  MacroAnalysisResult, 
  MacroExpansionContext,
  parseSPFMacros,
  expandMacrosInText,
  DEFAULT_MACRO_CONTEXT
} from './spfMacroParser';
import { SPFRecord, SPFMechanism } from './spfParser';

export interface SPFMacroMechanism {
  mechanismIndex: number;
  mechanismType: string;
  originalValue: string;
  macros: SPFMacro[];
  expandedExample: string;
  securityAssessment: SecurityAssessment;
  performanceImpact: PerformanceImpact;
  optimizationNotes: string[];
}

export interface SecurityAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilities: SecurityVulnerability[];
  mitigationSuggestions: string[];
  threatVectors: string[];
}

export interface SecurityVulnerability {
  type: 'dns_amplification' | 'information_disclosure' | 'enumeration' | 'injection' | 'resource_exhaustion';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedMacros: string[];
  impact: string;
  remediation: string;
}

export interface PerformanceImpact {
  dnsLookupsPerEmail: number;
  processingOverhead: 'minimal' | 'moderate' | 'significant' | 'severe';
  scalabilityConcerns: string[];
  recommendedAlternatives: string[];
}

export interface MacroComplexityAnalysis {
  totalMacros: number;
  uniqueMacroTypes: number;
  averageModifiersPerMacro: number;
  complexityScore: number;
  readabilityScore: number;
  maintenanceRisk: 'low' | 'medium' | 'high';
}

export interface SPFRecordMacroAnalysis {
  record: SPFRecord;
  macroMechanisms: SPFMacroMechanism[];
  overallAnalysis: MacroAnalysisResult;
  securityAssessment: SecurityAssessment;
  performanceImpact: PerformanceImpact;
  complexityAnalysis: MacroComplexityAnalysis;
  optimizationRecommendations: OptimizationRecommendation[];
}

export interface OptimizationRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'security' | 'performance' | 'maintainability' | 'compliance';
  title: string;
  description: string;
  currentIssue: string;
  suggestedFix: string;
  impactEstimate: string;
  effortEstimate: 'low' | 'medium' | 'high';
}

/**
 * Analyze SPF record for macro usage and provide comprehensive insights
 */
export function analyzeSPFRecordMacros(
  record: SPFRecord,
  context?: MacroExpansionContext
): SPFRecordMacroAnalysis {
  const expansionContext = context || DEFAULT_MACRO_CONTEXT;
  const macroMechanisms: SPFMacroMechanism[] = [];
  let allMacros: SPFMacro[] = [];
  
  // Analyze each mechanism for macro usage
  record.mechanisms.forEach((mechanism, index) => {
    const mechanismMacros = findMacrosInMechanism(mechanism, index, expansionContext);
    if (mechanismMacros.macros.length > 0) {
      macroMechanisms.push(mechanismMacros);
      allMacros = [...allMacros, ...mechanismMacros.macros];
    }
  });
  
  // Analyze modifiers for macros
  record.modifiers.forEach((modifier, index) => {
    const modifierText = `${modifier.type}=${modifier.value}`;
    const macroAnalysis = parseSPFMacros(modifierText);
    
    if (macroAnalysis.macros.length > 0) {
      const modifierMacroMechanism: SPFMacroMechanism = {
        mechanismIndex: record.mechanisms.length + index,
        mechanismType: `modifier:${modifier.type}`,
        originalValue: modifier.value,
        macros: macroAnalysis.macros,
        expandedExample: expandMacrosInText(modifier.value, expansionContext),
        securityAssessment: assessMechanismSecurity(macroAnalysis.macros, modifier.type),
        performanceImpact: assessPerformanceImpact(macroAnalysis.macros, modifier.type),
        optimizationNotes: generateOptimizationNotes(macroAnalysis.macros, modifier.type)
      };
      
      macroMechanisms.push(modifierMacroMechanism);
      allMacros = [...allMacros, ...macroAnalysis.macros];
    }
  });
  
  // Generate overall analysis
  const overallAnalysis = parseSPFMacros(record.raw);
  const securityAssessment = generateSecurityAssessment(allMacros, macroMechanisms);
  const performanceImpact = generatePerformanceImpact(allMacros, macroMechanisms);
  const complexityAnalysis = generateComplexityAnalysis(allMacros, record);
  const optimizationRecommendations = generateOptimizationRecommendations(
    macroMechanisms, securityAssessment, performanceImpact, complexityAnalysis
  );
  
  return {
    record,
    macroMechanisms,
    overallAnalysis,
    securityAssessment,
    performanceImpact,
    complexityAnalysis,
    optimizationRecommendations
  };
}

/**
 * Find and analyze macros within a specific SPF mechanism
 */
function findMacrosInMechanism(
  mechanism: SPFMechanism, 
  index: number, 
  context: MacroExpansionContext
): SPFMacroMechanism {
  const mechanismValue = mechanism.value || '';
  const macroAnalysis = parseSPFMacros(mechanismValue);
  
  return {
    mechanismIndex: index,
    mechanismType: mechanism.type,
    originalValue: mechanismValue,
    macros: macroAnalysis.macros,
    expandedExample: expandMacrosInText(mechanismValue, context),
    securityAssessment: assessMechanismSecurity(macroAnalysis.macros, mechanism.type),
    performanceImpact: assessPerformanceImpact(macroAnalysis.macros, mechanism.type),
    optimizationNotes: generateOptimizationNotes(macroAnalysis.macros, mechanism.type)
  };
}

/**
 * Assess security implications of macros within a mechanism
 */
function assessMechanismSecurity(macros: SPFMacro[], mechanismType: string): SecurityAssessment {
  const vulnerabilities: SecurityVulnerability[] = [];
  const threatVectors: string[] = [];
  const mitigationSuggestions: string[] = [];
  let maxRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  macros.forEach(macro => {
    // DNS Amplification risks
    if (macro.type === 'p' && ['exists', 'a', 'mx'].includes(mechanismType)) {
      vulnerabilities.push({
        type: 'dns_amplification',
        severity: 'high',
        description: 'PTR macro in DNS lookup mechanism can cause amplification attacks',
        affectedMacros: [macro.raw],
        impact: 'Attackers can trigger multiple DNS queries per SPF check',
        remediation: 'Replace PTR macro with static IP ranges or trusted domains'
      });
      threatVectors.push('DNS amplification via PTR lookups');
      maxRiskLevel = 'high';
    }
    
    // Information disclosure
    if (['c', 't'].includes(macro.type)) {
      vulnerabilities.push({
        type: 'information_disclosure',
        severity: 'medium',
        description: 'Macro exposes sensitive system information',
        affectedMacros: [macro.raw],
        impact: 'Leakage of IP addresses, timestamps, or system details',
        remediation: 'Avoid using %{c} and %{t} macros in public SPF records'
      });
      threatVectors.push('Information leakage');
      if (maxRiskLevel === 'low') maxRiskLevel = 'medium';
    }
    
    // Enumeration attacks
    if (macro.type === 's' && mechanismType === 'exists') {
      vulnerabilities.push({
        type: 'enumeration',
        severity: 'medium',
        description: 'Sender macro in exists mechanism allows email enumeration',
        affectedMacros: [macro.raw],
        impact: 'Attackers can probe for valid email addresses',
        remediation: 'Implement rate limiting or use alternative validation methods'
      });
      threatVectors.push('Email address enumeration');
      if (maxRiskLevel === 'low') maxRiskLevel = 'medium';
    }
    
    // Resource exhaustion
    if (macro.modifiers.length > 3) {
      vulnerabilities.push({
        type: 'resource_exhaustion',
        severity: 'medium',
        description: 'Complex macro with many modifiers increases processing time',
        affectedMacros: [macro.raw],
        impact: 'Potential DoS through CPU-intensive macro processing',
        remediation: 'Simplify macro modifiers and add processing timeouts'
      });
      if (maxRiskLevel === 'low') maxRiskLevel = 'medium';
    }
    
    // Injection potential
    const delimiterModifier = macro.modifiers.find(m => m.type === 'delimiter');
    if (delimiterModifier && typeof delimiterModifier.value === 'string') {
      const suspiciousChars = /[<>'"&;|`$(){}[\]\\]/;
      if (suspiciousChars.test(delimiterModifier.value)) {
        vulnerabilities.push({
          type: 'injection',
          severity: 'high',
          description: 'Delimiter contains potentially dangerous characters',
          affectedMacros: [macro.raw],
          impact: 'Possible injection attacks in downstream systems',
          remediation: 'Use only safe delimiter characters (.-_/)'
        });
        maxRiskLevel = 'high';
      }
    }
  });
  
  // Generate mitigation suggestions
  if (vulnerabilities.length > 0) {
    mitigationSuggestions.push('Regular security audit of SPF macro usage');
    mitigationSuggestions.push('Implement DNS query rate limiting');
    mitigationSuggestions.push('Monitor for unusual SPF evaluation patterns');
  }
  
  if (vulnerabilities.some(v => v.type === 'dns_amplification')) {
    mitigationSuggestions.push('Replace PTR-based macros with static IP lists');
  }
  
  if (vulnerabilities.some(v => v.type === 'information_disclosure')) {
    mitigationSuggestions.push('Audit SPF records for information leakage');
  }
  
  return {
    riskLevel: maxRiskLevel,
    vulnerabilities,
    mitigationSuggestions,
    threatVectors
  };
}

/**
 * Assess performance impact of macros
 */
function assessPerformanceImpact(macros: SPFMacro[], mechanismType: string): PerformanceImpact {
  let dnsLookupsPerEmail = 0;
  const scalabilityConcerns: string[] = [];
  const recommendedAlternatives: string[] = [];
  
  // Calculate DNS lookups
  macros.forEach(macro => {
    if (macro.type === 'p') {
      dnsLookupsPerEmail += 1; // PTR lookup
      if (['exists', 'a', 'mx'].includes(mechanismType)) {
        dnsLookupsPerEmail += 1; // Additional forward lookup
      }
    }
    
    if (macro.type === 'i' && macro.modifiers.some(m => m.type === 'reverse')) {
      dnsLookupsPerEmail += 0.5; // Possible additional reverse lookup
    }
  });
  
  // Assess processing overhead
  let processingOverhead: 'minimal' | 'moderate' | 'significant' | 'severe' = 'minimal';
  
  const totalModifiers = macros.reduce((sum, macro) => sum + macro.modifiers.length, 0);
  const complexMacros = macros.filter(m => m.modifiers.length > 2);
  
  if (totalModifiers > 10 || complexMacros.length > 2) {
    processingOverhead = 'severe';
    scalabilityConcerns.push('Complex macro processing may not scale well under high load');
  } else if (totalModifiers > 5 || macros.length > 5) {
    processingOverhead = 'significant';
    scalabilityConcerns.push('Multiple complex macros increase per-email processing time');
  } else if (macros.length > 2) {
    processingOverhead = 'moderate';
  }
  
  // Performance concerns
  if (dnsLookupsPerEmail > 2) {
    scalabilityConcerns.push('High DNS lookup count may cause timeouts and delays');
  }
  
  const ptrMacros = macros.filter(m => m.type === 'p');
  if (ptrMacros.length > 0) {
    scalabilityConcerns.push('PTR lookups are slow and unreliable');
    recommendedAlternatives.push('Replace %{p} macros with static trusted domain lists');
  }
  
  // Recommendations
  if (macros.length > 3) {
    recommendedAlternatives.push('Consolidate multiple macros into fewer, simpler expressions');
  }
  
  if (complexMacros.length > 0) {
    recommendedAlternatives.push('Simplify macro modifiers to improve processing speed');
  }
  
  return {
    dnsLookupsPerEmail,
    processingOverhead,
    scalabilityConcerns,
    recommendedAlternatives
  };
}

/**
 * Generate optimization notes for macro usage
 */
function generateOptimizationNotes(macros: SPFMacro[], mechanismType: string): string[] {
  const notes: string[] = [];
  
  macros.forEach(macro => {
    if (macro.type === 'p') {
      notes.push('PTR macro causes DNS lookups that may fail or timeout');
    }
    
    if (macro.modifiers.length > 2) {
      notes.push(`Complex macro ${macro.raw} could be simplified for better performance`);
    }
    
    if (macro.type === 's' && mechanismType === 'exists') {
      notes.push('Sender macro in exists mechanism allows email enumeration attacks');
    }
    
    if (!macro.isValid) {
      notes.push(`Malformed macro ${macro.raw} should be corrected`);
    }
  });
  
  return notes;
}

/**
 * Generate overall security assessment
 */
function generateSecurityAssessment(
  allMacros: SPFMacro[], 
  mechanisms: SPFMacroMechanism[]
): SecurityAssessment {
  const allVulnerabilities: SecurityVulnerability[] = [];
  const allThreatVectors: string[] = [];
  const allMitigations: string[] = [];
  let maxRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  // Aggregate from all mechanisms
  mechanisms.forEach(mechanism => {
    allVulnerabilities.push(...mechanism.securityAssessment.vulnerabilities);
    allThreatVectors.push(...mechanism.securityAssessment.threatVectors);
    allMitigations.push(...mechanism.securityAssessment.mitigationSuggestions);
    
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    const currentIndex = riskLevels.indexOf(mechanism.securityAssessment.riskLevel);
    const maxIndex = riskLevels.indexOf(maxRiskLevel);
    if (currentIndex > maxIndex) {
      maxRiskLevel = mechanism.securityAssessment.riskLevel;
    }
  });
  
  // Critical risk if multiple high-risk vulnerabilities
  const highRiskVulns = allVulnerabilities.filter(v => v.severity === 'high');
  if (highRiskVulns.length > 1) {
    maxRiskLevel = 'critical';
  }
  
  // Deduplicate arrays
  const uniqueVulnerabilities = allVulnerabilities.filter((vuln, index, self) => 
    self.findIndex(v => v.type === vuln.type && v.description === vuln.description) === index
  );
  const uniqueThreatVectors = [...new Set(allThreatVectors)];
  const uniqueMitigations = [...new Set(allMitigations)];
  
  return {
    riskLevel: maxRiskLevel,
    vulnerabilities: uniqueVulnerabilities,
    mitigationSuggestions: uniqueMitigations,
    threatVectors: uniqueThreatVectors
  };
}

/**
 * Generate overall performance impact assessment
 */
function generatePerformanceImpact(
  allMacros: SPFMacro[], 
  mechanisms: SPFMacroMechanism[]
): PerformanceImpact {
  const totalDnsLookups = mechanisms.reduce((sum, m) => sum + m.performanceImpact.dnsLookupsPerEmail, 0);
  const allConcerns: string[] = [];
  const allAlternatives: string[] = [];
  
  mechanisms.forEach(mechanism => {
    allConcerns.push(...mechanism.performanceImpact.scalabilityConcerns);
    allAlternatives.push(...mechanism.performanceImpact.recommendedAlternatives);
  });
  
  // Determine overall processing overhead
  let overallOverhead: 'minimal' | 'moderate' | 'significant' | 'severe' = 'minimal';
  if (totalDnsLookups > 5 || allMacros.length > 8) {
    overallOverhead = 'severe';
  } else if (totalDnsLookups > 3 || allMacros.length > 5) {
    overallOverhead = 'significant';
  } else if (totalDnsLookups > 1 || allMacros.length > 2) {
    overallOverhead = 'moderate';
  }
  
  return {
    dnsLookupsPerEmail: Math.round(totalDnsLookups * 10) / 10,
    processingOverhead: overallOverhead,
    scalabilityConcerns: [...new Set(allConcerns)],
    recommendedAlternatives: [...new Set(allAlternatives)]
  };
}

/**
 * Generate complexity analysis
 */
function generateComplexityAnalysis(allMacros: SPFMacro[], record: SPFRecord): MacroComplexityAnalysis {
  const uniqueMacroTypes = new Set(allMacros.map(m => m.type)).size;
  const totalModifiers = allMacros.reduce((sum, macro) => sum + macro.modifiers.length, 0);
  const averageModifiersPerMacro = allMacros.length > 0 ? totalModifiers / allMacros.length : 0;
  
  // Calculate complexity score (0-100)
  let complexityScore = 0;
  complexityScore += allMacros.length * 8; // 8 points per macro
  complexityScore += totalModifiers * 3; // 3 points per modifier  
  complexityScore += uniqueMacroTypes * 2; // 2 points per unique type
  
  // Bonus complexity for risky patterns
  const highRiskMacros = allMacros.filter(m => m.securityRisk === 'high');
  complexityScore += highRiskMacros.length * 10;
  
  // Cap at 100
  complexityScore = Math.min(complexityScore, 100);
  
  // Calculate readability score (inverse of complexity, 0-100)
  const readabilityScore = Math.max(0, 100 - complexityScore);
  
  // Assess maintenance risk
  let maintenanceRisk: 'low' | 'medium' | 'high' = 'low';
  if (complexityScore > 70 || allMacros.length > 6) {
    maintenanceRisk = 'high';
  } else if (complexityScore > 40 || allMacros.length > 3) {
    maintenanceRisk = 'medium';
  }
  
  return {
    totalMacros: allMacros.length,
    uniqueMacroTypes,
    averageModifiersPerMacro: Math.round(averageModifiersPerMacro * 10) / 10,
    complexityScore,
    readabilityScore,
    maintenanceRisk
  };
}

/**
 * Generate comprehensive optimization recommendations
 */
function generateOptimizationRecommendations(
  mechanisms: SPFMacroMechanism[],
  securityAssessment: SecurityAssessment,
  performanceImpact: PerformanceImpact,
  complexityAnalysis: MacroComplexityAnalysis
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  
  // Security recommendations
  securityAssessment.vulnerabilities.forEach(vuln => {
    recommendations.push({
      priority: vuln.severity === 'critical' ? 'critical' : vuln.severity === 'high' ? 'high' : 'medium',
      category: 'security',
      title: `Fix ${vuln.type.replace('_', ' ')} vulnerability`,
      description: vuln.description,
      currentIssue: vuln.impact,
      suggestedFix: vuln.remediation,
      impactEstimate: 'Improves security posture and reduces attack surface',
      effortEstimate: vuln.type === 'dns_amplification' ? 'high' : 'medium'
    });
  });
  
  // Performance recommendations
  if (performanceImpact.dnsLookupsPerEmail > 3) {
    recommendations.push({
      priority: 'high',
      category: 'performance',
      title: 'Reduce DNS lookups per email',
      description: `Current: ${performanceImpact.dnsLookupsPerEmail} lookups per email`,
      currentIssue: 'High DNS lookup count causes delays and potential timeouts',
      suggestedFix: 'Replace dynamic macros with static IP ranges where possible',
      impactEstimate: 'Significantly faster SPF evaluation and better reliability',
      effortEstimate: 'medium'
    });
  }
  
  if (performanceImpact.processingOverhead === 'severe') {
    recommendations.push({
      priority: 'high',
      category: 'performance',
      title: 'Simplify complex macro processing',
      description: 'Current macro configuration causes severe processing overhead',
      currentIssue: 'Complex macros slow down email processing',
      suggestedFix: 'Reduce macro complexity and consolidate similar patterns',
      impactEstimate: 'Faster email processing and better scalability',
      effortEstimate: 'medium'
    });
  }
  
  // Complexity recommendations
  if (complexityAnalysis.maintenanceRisk === 'high') {
    recommendations.push({
      priority: 'medium',
      category: 'maintainability',
      title: 'Reduce SPF record complexity',
      description: `Complexity score: ${complexityAnalysis.complexityScore}/100`,
      currentIssue: 'High complexity makes the record difficult to maintain and debug',
      suggestedFix: 'Simplify macros, reduce modifier usage, and improve documentation',
      impactEstimate: 'Easier maintenance and reduced risk of configuration errors',
      effortEstimate: 'medium'
    });
  }
  
  // Compliance recommendations
  const malformedMacros = mechanisms.flatMap(m => m.macros).filter(m => !m.isValid);
  if (malformedMacros.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'compliance',
      title: 'Fix malformed macro syntax',
      description: `${malformedMacros.length} macro(s) have syntax errors`,
      currentIssue: 'Malformed macros may cause SPF evaluation failures',
      suggestedFix: 'Correct macro syntax according to RFC 7208 specification',
      impactEstimate: 'Ensures reliable SPF evaluation across all email receivers',
      effortEstimate: 'low'
    });
  }
  
  // Sort by priority
  const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
  recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  
  return recommendations;
}

/**
 * Utility function to check if SPF record contains macros
 */
export function hasSPFMacros(record: SPFRecord): boolean {
  const analysis = parseSPFMacros(record.raw);
  return analysis.totalMacros > 0;
}

/**
 * Get quick macro summary for dashboard display
 */
export function getMacroSummary(record: SPFRecord): {
  count: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hasHighRiskMacros: boolean;
  primaryConcerns: string[];
} {
  if (!hasSPFMacros(record)) {
    return {
      count: 0,
      riskLevel: 'low',
      hasHighRiskMacros: false,
      primaryConcerns: []
    };
  }
  
  const analysis = analyzeSPFRecordMacros(record);
  const primaryConcerns = [];
  
  if (analysis.securityAssessment.vulnerabilities.length > 0) {
    primaryConcerns.push('Security vulnerabilities detected');
  }
  
  if (analysis.performanceImpact.dnsLookupsPerEmail > 3) {
    primaryConcerns.push('High DNS lookup overhead');
  }
  
  if (analysis.complexityAnalysis.maintenanceRisk === 'high') {
    primaryConcerns.push('High maintenance complexity');
  }
  
  return {
    count: analysis.overallAnalysis.totalMacros,
    riskLevel: analysis.securityAssessment.riskLevel,
    hasHighRiskMacros: analysis.securityAssessment.riskLevel === 'high' || analysis.securityAssessment.riskLevel === 'critical',
    primaryConcerns: primaryConcerns.slice(0, 3) // Limit to top 3 concerns
  };
}