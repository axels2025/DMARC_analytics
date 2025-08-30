import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Eye,
  Zap,
  Target,
  TrendingUp
} from 'lucide-react';
import { useSPFAnalysis, useSPFHistory } from '@/hooks/useSPFAnalysis';
import { SPFAnalysis, OptimizationSuggestion } from '@/utils/spfParser';
import { SPFMacroAnalysis } from '@/components/spf/SPFMacroAnalysis';

interface SPFAnalysisDashboardProps {
  initialDomain?: string;
}

const SPFAnalysisDashboard: React.FC<SPFAnalysisDashboardProps> = ({ initialDomain = '' }) => {
  const [domain, setDomain] = useState(initialDomain);
  const [inputDomain, setInputDomain] = useState(initialDomain);
  
  const { analysis, loading, error, analyzeRecord, refreshAnalysis } = useSPFAnalysis(domain);
  const { history } = useSPFHistory(domain);

  const handleAnalyze = async () => {
    if (!inputDomain.trim()) return;
    setDomain(inputDomain.trim());
    await analyzeRecord(inputDomain.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-yellow-600 bg-yellow-50';
      case 'medium': return 'text-blue-600 bg-blue-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getProgressColor = (lookupCount: number) => {
    if (lookupCount >= 10) return 'bg-red-500';
    if (lookupCount >= 8) return 'bg-yellow-500';
    if (lookupCount >= 6) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'medium': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'low': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      default: return <CheckCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">SPF Record Analysis Engine</h2>
          <p className="text-muted-foreground">
            Analyze SPF records for DNS lookup optimization and compliance
          </p>
        </div>
      </div>

      {/* Domain Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Domain Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter domain name (e.g., example.com)"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button 
              onClick={handleAnalyze}
              disabled={loading || !inputDomain.trim()}
              className="flex items-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Analyze
            </Button>
          </div>

          {error && (
            <Alert className="mt-4">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysis && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="mechanisms">Mechanisms</TabsTrigger>
            {analysis.record.hasMacros && <TabsTrigger value="macros">Macros</TabsTrigger>}
            <TabsTrigger value="optimization">Optimization</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Risk Level Overview */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Risk Level</p>
                      <p className={`text-2xl font-bold ${getRiskColor(analysis.riskLevel).split(' ')[0]}`}>
                        {analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)}
                      </p>
                    </div>
                    {analysis.riskLevel === 'critical' ? (
                      <XCircle className="w-8 h-8 text-red-500" />
                    ) : analysis.riskLevel === 'high' ? (
                      <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    ) : (
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">DNS Lookups</p>
                      <p className="text-2xl font-bold">{analysis.record.totalLookups}/10</p>
                    </div>
                    <Target className="w-8 h-8 text-primary" />
                  </div>
                  <div className="mt-2">
                    <Progress 
                      value={(analysis.record.totalLookups / 10) * 100} 
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Compliance</p>
                      <p className="text-2xl font-bold">
                        {analysis.complianceStatus === 'compliant' ? 'Pass' : 
                         analysis.complianceStatus === 'warning' ? 'Warning' : 'Fail'}
                      </p>
                    </div>
                    <Eye className="w-8 h-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Optimizations</p>
                      <p className="text-2xl font-bold">{analysis.optimizationSuggestions.length}</p>
                    </div>
                    <Zap className="w-8 h-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Macros</p>
                      <p className="text-2xl font-bold">{analysis.record.macroCount}</p>
                    </div>
                    <div className="text-primary">
                      {analysis.record.hasMacros ? '⚙️' : '✓'}
                    </div>
                  </div>
                  {analysis.record.hasMacros && (
                    <div className="mt-2">
                      <Badge variant={
                        analysis.record.macroSecurityRisk === 'critical' ? 'destructive' :
                        analysis.record.macroSecurityRisk === 'high' ? 'destructive' :
                        analysis.record.macroSecurityRisk === 'medium' ? 'secondary' : 'default'
                      }>
                        {analysis.record.macroSecurityRisk} risk
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* SPF Record Display */}
            <Card>
              <CardHeader>
                <CardTitle>Current SPF Record</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm break-all">
                  {analysis.record.raw}
                </div>
                {(analysis.record.errors.length > 0 || analysis.record.warnings.length > 0) && (
                  <div className="mt-4 space-y-2">
                    {analysis.record.errors.map((error, index) => (
                      <Alert key={index}>
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ))}
                    {analysis.record.warnings.map((warning, index) => (
                      <Alert key={index}>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lookup Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>DNS Lookup Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{analysis.lookupBreakdown.includeCount}</p>
                    <p className="text-sm text-muted-foreground">Includes</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{analysis.lookupBreakdown.aCount}</p>
                    <p className="text-sm text-muted-foreground">A Records</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{analysis.lookupBreakdown.mxCount}</p>
                    <p className="text-sm text-muted-foreground">MX Records</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{analysis.lookupBreakdown.ptrCount}</p>
                    <p className="text-sm text-muted-foreground">PTR Records</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mechanisms" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SPF Mechanisms</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <div className="space-y-3">
                    {analysis.record.mechanisms.map((mechanism, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{mechanism.type}</Badge>
                            <code className="text-sm">{mechanism.qualifier}{mechanism.type}{mechanism.value ? `:${mechanism.value}` : ''}</code>
                            {mechanism.hasMacros && (
                              <Badge variant="secondary" className="text-xs">
                                {mechanism.macroCount} macro{mechanism.macroCount !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          {mechanism.errors.length > 0 && (
                            <div className="mt-1">
                              {mechanism.errors.map((error, errorIndex) => (
                                <p key={errorIndex} className="text-sm text-red-600">{error}</p>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge variant={mechanism.lookupCount > 0 ? "default" : "secondary"}>
                            {mechanism.lookupCount} lookup{mechanism.lookupCount !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    
                    {analysis.record.modifiers.map((modifier, index) => (
                      <div key={`mod-${index}`} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">modifier</Badge>
                            <code className="text-sm">{modifier.type}={modifier.value}</code>
                            {modifier.hasMacros && (
                              <Badge variant="secondary" className="text-xs">
                                {modifier.macroCount} macro{modifier.macroCount !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={modifier.lookupCount > 0 ? "default" : "secondary"}>
                            {modifier.lookupCount} lookup{modifier.lookupCount !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {analysis.record.hasMacros && (
            <TabsContent value="macros" className="space-y-4">
              {analysis.macroAnalysis ? (
                <SPFMacroAnalysis 
                  analysis={analysis.macroAnalysis}
                  spfRecord={analysis.record}
                />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Macro Analysis Unavailable</h3>
                    <p className="text-muted-foreground">
                      Detailed macro analysis could not be loaded for this record.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}

          <TabsContent value="optimization" className="space-y-4">
            {analysis.optimizationSuggestions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Optimization Suggestions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-80">
                    <div className="space-y-4">
                      {analysis.optimizationSuggestions.map((suggestion, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-start gap-3">
                            {getSeverityIcon(suggestion.severity)}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">{suggestion.type.replace('_', ' ')}</Badge>
                                <Badge variant={
                                  suggestion.severity === 'high' ? 'destructive' :
                                  suggestion.severity === 'medium' ? 'secondary' : 'default'
                                }>
                                  {suggestion.severity}
                                </Badge>
                              </div>
                              <h4 className="font-semibold mb-1">{suggestion.description}</h4>
                              <p className="text-sm text-muted-foreground mb-2">
                                Mechanism: <code>{suggestion.mechanism}</code>
                              </p>
                              <p className="text-sm text-muted-foreground mb-2">
                                Estimated savings: <strong>{suggestion.estimatedSavings} lookup{suggestion.estimatedSavings !== 1 ? 's' : ''}</strong>
                              </p>
                              <div className="bg-muted p-3 rounded text-sm">
                                <strong>Implementation:</strong> {suggestion.implementation}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Optimizations Needed</h3>
                  <p className="text-muted-foreground">
                    Your SPF record is well-optimized and doesn't require immediate changes.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analysis History</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length > 0 ? (
                  <ScrollArea className="h-80">
                    <div className="space-y-3">
                      {history.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium">{entry.domain}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <Badge variant={
                              entry.riskLevel === 'critical' ? 'destructive' :
                              entry.riskLevel === 'high' ? 'destructive' :
                              entry.riskLevel === 'medium' ? 'secondary' : 'default'
                            }>
                              {entry.lookupCount}/10
                            </Badge>
                            <Badge className={getRiskColor(entry.riskLevel)}>
                              {entry.riskLevel}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No analysis history available for this domain.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default SPFAnalysisDashboard;