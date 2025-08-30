import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  Zap, 
  Eye, 
  Copy, 
  TrendingUp,
  Clock,
  Activity,
  Target,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  Settings,
  BarChart3
} from 'lucide-react';
import { 
  SPFRecordMacroAnalysis, 
  analyzeSPFRecordMacros,
  OptimizationRecommendation,
  SecurityVulnerability 
} from '@/utils/spfMacroAnalysis';
import { SPFRecord } from '@/utils/spfParser';
import { MacroExpansionContext, DEFAULT_MACRO_CONTEXT, expandMacrosInText } from '@/utils/spfMacroParser';

interface SPFMacroAnalysisProps {
  record: SPFRecord;
  context?: MacroExpansionContext;
  onOptimizationApply?: (recommendation: OptimizationRecommendation) => void;
}

const SPFMacroAnalysis: React.FC<SPFMacroAnalysisProps> = ({ 
  record, 
  context = DEFAULT_MACRO_CONTEXT,
  onOptimizationApply 
}) => {
  const [selectedMechanism, setSelectedMechanism] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Analyze the SPF record for macros
  const analysis = useMemo(() => {
    return analyzeSPFRecordMacros(record, context);
  }, [record, context]);

  const hasMacros = analysis.macroMechanisms.length > 0;

  // Get risk level styling
  const getRiskLevelColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'critical': return <XCircle className="w-4 h-4" />;
      case 'high': return <AlertCircle className="w-4 h-4" />;
      case 'medium': return <AlertTriangle className="w-4 h-4" />;
      case 'low': return <CheckCircle2 className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!hasMacros) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No SPF Macros Detected</h3>
          <p className="text-muted-foreground mb-4">
            This SPF record does not contain any macro expressions. Macros allow dynamic 
            IP address validation using variables like sender IP, domain, and timestamp.
          </p>
          <div className="text-sm text-left bg-gray-50 p-4 rounded-lg max-w-md mx-auto">
            <h4 className="font-medium mb-2">Common SPF Macro Examples:</h4>
            <ul className="space-y-1 text-muted-foreground font-mono">
              <li>• %{'{i}'} - Sender IP address</li>
              <li>• %{'{s}'} - Sender email address</li>
              <li>• %{'{d}'} - Current domain</li>
              <li>• %{'{l}'} - Local part of sender email</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Macros</p>
                <p className="text-2xl font-bold">{analysis.overallAnalysis.totalMacros}</p>
              </div>
              <Target className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Security Risk</p>
                <div className="flex items-center gap-1 mt-1">
                  {getRiskIcon(analysis.securityAssessment.riskLevel)}
                  <span className="text-sm font-semibold capitalize">
                    {analysis.securityAssessment.riskLevel}
                  </span>
                </div>
              </div>
              <Shield className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">DNS Lookups/Email</p>
                <p className="text-2xl font-bold">{analysis.performanceImpact.dnsLookupsPerEmail}</p>
              </div>
              <Activity className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Complexity Score</p>
                <p className="text-2xl font-bold">{analysis.complexityAnalysis.complexityScore}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analysis Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="mechanisms">Mechanisms</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Risk Assessment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${getRiskLevelColor(analysis.securityAssessment.riskLevel)}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getRiskIcon(analysis.securityAssessment.riskLevel)}
                      <span className="font-semibold capitalize">
                        {analysis.securityAssessment.riskLevel} Risk Level
                      </span>
                    </div>
                    <Badge variant={analysis.securityAssessment.riskLevel === 'high' || analysis.securityAssessment.riskLevel === 'critical' ? 'destructive' : 'secondary'}>
                      {analysis.securityAssessment.vulnerabilities.length} vulnerabilities
                    </Badge>
                  </div>
                  
                  {analysis.securityAssessment.threatVectors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-2">Primary Threat Vectors:</p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.securityAssessment.threatVectors.map((threat, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {threat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Performance Impact */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-blue-800">Processing Overhead</span>
                    </div>
                    <p className="text-sm text-blue-700 capitalize mb-2">
                      {analysis.performanceImpact.processingOverhead}
                    </p>
                    <Progress 
                      value={
                        analysis.performanceImpact.processingOverhead === 'minimal' ? 10 :
                        analysis.performanceImpact.processingOverhead === 'moderate' ? 35 :
                        analysis.performanceImpact.processingOverhead === 'significant' ? 65 : 90
                      } 
                      className="h-2" 
                    />
                  </div>

                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-purple-600" />
                      <span className="font-semibold text-purple-800">Maintenance Risk</span>
                    </div>
                    <p className="text-sm text-purple-700 capitalize mb-2">
                      {analysis.complexityAnalysis.maintenanceRisk}
                    </p>
                    <Progress 
                      value={
                        analysis.complexityAnalysis.maintenanceRisk === 'low' ? 20 :
                        analysis.complexityAnalysis.maintenanceRisk === 'medium' ? 50 : 85
                      } 
                      className="h-2" 
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Optimization Recommendations */}
          {analysis.optimizationRecommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Top Optimization Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysis.optimizationRecommendations.slice(0, 3).map((rec, index) => (
                    <div key={index} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={
                            rec.priority === 'critical' ? 'destructive' :
                            rec.priority === 'high' ? 'destructive' :
                            rec.priority === 'medium' ? 'default' : 'secondary'
                          }>
                            {rec.priority}
                          </Badge>
                          <span className="text-sm font-medium">{rec.title}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.description}</p>
                      </div>
                      {onOptimizationApply && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOptimizationApply(rec)}
                          className="ml-2"
                        >
                          Apply
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security Vulnerabilities
              </CardTitle>
              <CardDescription>
                Detailed analysis of security risks in your SPF macro usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.securityAssessment.vulnerabilities.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Security Vulnerabilities</h3>
                  <p className="text-muted-foreground">
                    Your SPF macros follow security best practices.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {analysis.securityAssessment.vulnerabilities.map((vuln, index) => (
                    <Alert key={index} className={getRiskLevelColor(vuln.severity)}>
                      <div className="flex items-start gap-3">
                        {getRiskIcon(vuln.severity)}
                        <div className="flex-1">
                          <AlertTitle className="flex items-center gap-2">
                            {vuln.description}
                            <Badge variant="outline">{vuln.type.replace('_', ' ')}</Badge>
                          </AlertTitle>
                          <AlertDescription className="mt-2">
                            <div className="space-y-2">
                              <div>
                                <strong>Impact:</strong> {vuln.impact}
                              </div>
                              <div>
                                <strong>Affected Macros:</strong> {vuln.affectedMacros.join(', ')}
                              </div>
                              <div>
                                <strong>Remediation:</strong> {vuln.remediation}
                              </div>
                            </div>
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>
                  ))}
                </div>
              )}

              {analysis.securityAssessment.mitigationSuggestions.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Mitigation Strategies</h4>
                  <ul className="space-y-2">
                    {analysis.securityAssessment.mitigationSuggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Performance Analysis
              </CardTitle>
              <CardDescription>
                Impact of macros on SPF processing speed and scalability
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* DNS Lookups */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">DNS Lookups per Email</h4>
                    <Badge variant={analysis.performanceImpact.dnsLookupsPerEmail > 3 ? 'destructive' : 'secondary'}>
                      {analysis.performanceImpact.dnsLookupsPerEmail}
                    </Badge>
                  </div>
                  
                  <Progress 
                    value={Math.min((analysis.performanceImpact.dnsLookupsPerEmail / 10) * 100, 100)} 
                    className="h-2" 
                  />
                  
                  <p className="text-sm text-muted-foreground">
                    Each additional DNS lookup adds latency and potential failure points.
                    Recommended: ≤ 3 lookups per email.
                  </p>
                </div>

                {/* Processing Overhead */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Processing Overhead</h4>
                    <Badge variant={
                      analysis.performanceImpact.processingOverhead === 'severe' ? 'destructive' :
                      analysis.performanceImpact.processingOverhead === 'significant' ? 'default' : 'secondary'
                    }>
                      {analysis.performanceImpact.processingOverhead}
                    </Badge>
                  </div>
                  
                  <Progress 
                    value={
                      analysis.performanceImpact.processingOverhead === 'minimal' ? 10 :
                      analysis.performanceImpact.processingOverhead === 'moderate' ? 35 :
                      analysis.performanceImpact.processingOverhead === 'significant' ? 65 : 90
                    } 
                    className="h-2" 
                  />
                  
                  <p className="text-sm text-muted-foreground">
                    Complex macro processing can slow down email delivery and consume CPU resources.
                  </p>
                </div>
              </div>

              {/* Scalability Concerns */}
              {analysis.performanceImpact.scalabilityConcerns.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Scalability Concerns</h4>
                  <div className="space-y-2">
                    {analysis.performanceImpact.scalabilityConcerns.map((concern, index) => (
                      <Alert key={index} className="bg-yellow-50 border-yellow-200">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-yellow-800">
                          {concern}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {analysis.performanceImpact.recommendedAlternatives.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Performance Recommendations</h4>
                  <ul className="space-y-2">
                    {analysis.performanceImpact.recommendedAlternatives.map((rec, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mechanisms Tab */}
        <TabsContent value="mechanisms" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Macro-Enabled Mechanisms
              </CardTitle>
              <CardDescription>
                Detailed breakdown of each mechanism containing macros
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analysis.macroMechanisms.map((mechanism, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{mechanism.mechanismType}</Badge>
                        <Badge variant={
                          mechanism.securityAssessment.riskLevel === 'high' ? 'destructive' :
                          mechanism.securityAssessment.riskLevel === 'medium' ? 'default' : 'secondary'
                        }>
                          {mechanism.securityAssessment.riskLevel} risk
                        </Badge>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMechanism(selectedMechanism === index ? null : index)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {selectedMechanism === index ? 'Hide' : 'Details'}
                      </Button>
                    </div>

                    {/* Original vs Expanded */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-sm font-medium mb-2">Original Value:</p>
                        <div className="relative">
                          <code className="text-sm bg-gray-100 p-2 rounded block break-all">
                            {mechanism.originalValue}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(mechanism.originalValue)}
                            className="absolute top-1 right-1 h-6 w-6 p-0"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium mb-2">Expanded Example:</p>
                        <div className="relative">
                          <code className="text-sm bg-green-100 p-2 rounded block break-all">
                            {mechanism.expandedExample}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(mechanism.expandedExample)}
                            className="absolute top-1 right-1 h-6 w-6 p-0"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Macro Details */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {mechanism.macros.map((macro, macroIndex) => (
                        <Badge key={macroIndex} variant="secondary" className="font-mono text-xs">
                          {macro.raw}
                        </Badge>
                      ))}
                    </div>

                    {/* Expanded Details */}
                    {selectedMechanism === index && (
                      <div className="mt-4 pt-4 border-t space-y-4">
                        {/* Performance Impact */}
                        <div>
                          <h5 className="font-medium mb-2">Performance Impact</h5>
                          <div className="text-sm space-y-1">
                            <p><strong>DNS Lookups per Email:</strong> {mechanism.performanceImpact.dnsLookupsPerEmail}</p>
                            <p><strong>Processing Overhead:</strong> {mechanism.performanceImpact.processingOverhead}</p>
                          </div>
                        </div>

                        {/* Security Assessment */}
                        {mechanism.securityAssessment.vulnerabilities.length > 0 && (
                          <div>
                            <h5 className="font-medium mb-2">Security Issues</h5>
                            <div className="space-y-2">
                              {mechanism.securityAssessment.vulnerabilities.map((vuln, vulnIndex) => (
                                <Alert key={vulnIndex} className="text-sm">
                                  <AlertTriangle className="h-4 w-4" />
                                  <AlertDescription>
                                    <strong>{vuln.type.replace('_', ' ')}:</strong> {vuln.description}
                                  </AlertDescription>
                                </Alert>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Optimization Notes */}
                        {mechanism.optimizationNotes.length > 0 && (
                          <div>
                            <h5 className="font-medium mb-2">Optimization Notes</h5>
                            <ul className="space-y-1">
                              {mechanism.optimizationNotes.map((note, noteIndex) => (
                                <li key={noteIndex} className="text-sm flex items-start gap-2">
                                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-500" />
                                  {note}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SPFMacroAnalysis;