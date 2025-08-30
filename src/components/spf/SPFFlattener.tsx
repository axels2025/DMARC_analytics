import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  RefreshCw,
  Eye,
  Target,
  Network,
  TrendingDown,
  Save
} from 'lucide-react';
import { SPFRecord, SPFAnalysis, OptimizationSuggestion } from '@/utils/spfParser';
import { SPFOptimizer, FlatteningResult } from '@/utils/spfOptimizer';
import { FlatteningOptions, validateFlattenedRecord } from '@/utils/spfFlattening';
import { useSPFAnalysis } from '@/hooks/useSPFAnalysis';

interface SPFFlattenerProps {
  selectedDomain?: string;
  onSave?: (flattenedRecord: string, metadata: any) => void;
}

interface FlatteningSelection {
  domain: string;
  selected: boolean;
  espType: 'common' | 'custom';
  risk: 'low' | 'medium' | 'high';
  estimatedIPs: number;
}

const SPFFlattener: React.FC<SPFFlattenerProps> = ({ selectedDomain, onSave }) => {
  const { analysis, loading: analysisLoading, error: analysisError, analyzeRecord } = useSPFAnalysis(selectedDomain);
  const [selections, setSelections] = useState<FlatteningSelection[]>([]);
  const [flatteningOptions, setFlatteningOptions] = useState<FlatteningOptions>({
    includeSubdomains: false,
    consolidateCIDR: true,
    preserveOrder: true,
    maxIPsPerRecord: 50
  });
  
  const [flatteningResult, setFlatteningResult] = useState<FlatteningResult | null>(null);
  const [flattening, setFlattening] = useState(false);
  const [previewMode, setPreviewMode] = useState<'before' | 'after'>('before');
  const [error, setError] = useState<string | null>(null);

  const optimizer = new SPFOptimizer();

  // Initialize selections from analysis
  useEffect(() => {
    if (!analysis?.optimizationSuggestions) {
      setSelections([]);
      return;
    }

    const flatteningSuggestions = analysis.optimizationSuggestions.filter(
      s => s.type === 'flatten_include'
    );

    const initialSelections: FlatteningSelection[] = flatteningSuggestions.map(suggestion => ({
      domain: suggestion.mechanism,
      selected: suggestion.severity === 'high', // Auto-select high priority
      espType: isCommonESP(suggestion.mechanism) ? 'common' : 'custom',
      risk: suggestion.severity === 'high' ? 'high' : suggestion.severity === 'medium' ? 'medium' : 'low',
      estimatedIPs: estimateIPCount(suggestion.mechanism)
    }));

    setSelections(initialSelections);
  }, [analysis]);

  const isCommonESP = (domain: string): boolean => {
    const commonESPs = [
      '_spf.google.com', 'spf.protection.outlook.com', 'include.mailgun.org',
      '_spf.salesforce.com', 'sendgrid.net', '_spf.mandrillapp.com'
    ];
    return commonESPs.some(esp => domain.includes(esp));
  };

  const estimateIPCount = (domain: string): number => {
    // Rough estimates based on common ESP patterns
    const estimates: Record<string, number> = {
      '_spf.google.com': 8,
      'spf.protection.outlook.com': 12,
      'include.mailgun.org': 6,
      '_spf.salesforce.com': 15,
      'sendgrid.net': 10,
      '_spf.mandrillapp.com': 8
    };

    for (const [espDomain, count] of Object.entries(estimates)) {
      if (domain.includes(espDomain)) {
        return count;
      }
    }

    return 5; // Default estimate
  };

  const handleSelectionChange = (domain: string, selected: boolean) => {
    setSelections(prev => 
      prev.map(s => s.domain === domain ? { ...s, selected } : s)
    );
    setFlatteningResult(null); // Clear previous results
  };

  const calculateLookupReduction = (): { current: number; estimated: number } => {
    const selectedDomains = selections.filter(s => s.selected);
    const current = analysis?.record?.totalLookups || 0;
    const reduction = selectedDomains.length; // Each include = 1 lookup reduction
    return {
      current,
      estimated: Math.max(0, current - reduction)
    };
  };

  const performFlattening = async () => {
    setFlattening(true);
    setError(null);

    try {
      if (!analysis?.optimizationSuggestions || !analysis?.record) {
        throw new Error('Analysis data not available');
      }

      const selectedSuggestions = analysis.optimizationSuggestions.filter(
        s => s.type === 'flatten_include' && 
        selections.some(sel => sel.domain === s.mechanism && sel.selected)
      );

      const result = await optimizer.flattenSPFRecord(analysis.record, selectedSuggestions);
      setFlatteningResult(result);
      
      if (!result.success) {
        setError(result.errors.join(', '));
      } else {
        setPreviewMode('after');
      }
    } catch (err) {
      setError(`Flattening failed: ${err}`);
    } finally {
      setFlattening(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  };

  const handleSave = () => {
    if (flatteningResult && flatteningResult.success && onSave) {
      onSave(flatteningResult.flattenedRecord, {
        originalLookups: flatteningResult.originalLookups,
        newLookups: flatteningResult.newLookups,
        ipCount: flatteningResult.ipCount,
        selections: selections.filter(s => s.selected),
        options: flatteningOptions
      });
    }
  };

  const lookupReduction = calculateLookupReduction();
  const selectedCount = selections.filter(s => s.selected).length;
  const totalEstimatedIPs = selections.filter(s => s.selected)
    .reduce((total, s) => total + s.estimatedIPs, 0);

  // Handle loading and error states
  if (analysisLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5" />
              SPF Record Flattening
            </h3>
            <p className="text-sm text-muted-foreground">
              Replace include mechanisms with direct IP addresses to reduce DNS lookups
            </p>
          </div>
        </div>
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (analysisError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5" />
              SPF Record Flattening
            </h3>
            <p className="text-sm text-muted-foreground">
              Replace include mechanisms with direct IP addresses to reduce DNS lookups
            </p>
          </div>
        </div>
        <Alert>
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            Error loading SPF analysis: {analysisError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!analysis?.record) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5" />
              SPF Record Flattening
            </h3>
            <p className="text-sm text-muted-foreground">
              Replace include mechanisms with direct IP addresses to reduce DNS lookups
            </p>
          </div>
        </div>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No SPF record found for the selected domain. Please ensure a valid domain is selected.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            SPF Record Flattening
          </h3>
          <p className="text-sm text-muted-foreground">
            Replace include mechanisms with direct IP addresses to reduce DNS lookups
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-3 py-1">
          {lookupReduction.current} → {lookupReduction.estimated} lookups
        </Badge>
      </div>

      {/* Warning Banner */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Important:</strong> Flattened SPF records require regular monitoring. 
          ESP IP ranges may change without notice, potentially breaking email delivery.
          Set up monitoring for flattened domains, especially major ESPs.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Selection Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Include Mechanisms to Flatten</span>
                <Badge variant="secondary">{selectedCount} selected</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selections.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No flattening opportunities found in this SPF record.
                  </p>
                ) : (
                  selections.map((selection) => (
                    <div 
                      key={selection.domain} 
                      className={`p-3 border rounded-lg ${
                        selection.selected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={selection.selected}
                              onCheckedChange={(checked) => 
                                handleSelectionChange(selection.domain, checked)
                              }
                            />
                            <Label className="font-mono text-sm">
                              include:{selection.domain}
                            </Label>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge 
                              variant={selection.espType === 'common' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {selection.espType === 'common' ? 'Common ESP' : 'Custom Domain'}
                            </Badge>
                            <Badge 
                              variant={
                                selection.risk === 'high' ? 'destructive' : 
                                selection.risk === 'medium' ? 'secondary' : 'default'
                              }
                              className="text-xs"
                            >
                              {selection.risk} risk
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ~{selection.estimatedIPs} IPs
                            </span>
                          </div>
                          {selection.espType === 'common' && (
                            <p className="text-xs text-blue-600 mt-1">
                              Monitor monthly for IP changes
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedCount > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-semibold">Lookup Reduction:</p>
                      <p className="text-muted-foreground">-{selectedCount} DNS queries</p>
                    </div>
                    <div>
                      <p className="font-semibold">Estimated IPs:</p>
                      <p className="text-muted-foreground">+{totalEstimatedIPs} IP mechanisms</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Flattening Options */}
          <Card>
            <CardHeader>
              <CardTitle>Flattening Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Consolidate CIDR Blocks</Label>
                  <p className="text-xs text-muted-foreground">
                    Group similar IPs into /24 ranges
                  </p>
                </div>
                <Switch
                  checked={flatteningOptions.consolidateCIDR}
                  onCheckedChange={(checked) => 
                    setFlatteningOptions(prev => ({ ...prev, consolidateCIDR: checked }))
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Preserve Mechanism Order</Label>
                  <p className="text-xs text-muted-foreground">
                    Keep original SPF mechanism sequence
                  </p>
                </div>
                <Switch
                  checked={flatteningOptions.preserveOrder}
                  onCheckedChange={(checked) => 
                    setFlatteningOptions(prev => ({ ...prev, preserveOrder: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={performFlattening}
              disabled={selectedCount === 0 || flattening}
              className="flex-1 flex items-center gap-2"
            >
              {flattening ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {flattening ? 'Flattening...' : 'Flatten Selected'}
            </Button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>SPF Record Preview</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant={previewMode === 'before' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewMode('before')}
                  >
                    Before
                  </Button>
                  <Button
                    variant={previewMode === 'after' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewMode('after')}
                    disabled={!flatteningResult}
                  >
                    After
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={previewMode} onValueChange={(value) => setPreviewMode(value as 'before' | 'after')}>
                <TabsContent value="before" className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold">Current SPF Record:</Label>
                    <div className="mt-2 p-3 bg-gray-100 rounded border font-mono text-sm break-all">
                      {analysis.record?.raw}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <Target className="w-4 h-4" />
                        {analysis.record?.totalLookups || 0} DNS lookups
                      </span>
                      <span className="flex items-center gap-1">
                        <Network className="w-4 h-4" />
                        {analysis.record?.mechanisms?.filter(m => m.type === 'include').length || 0} includes
                      </span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="after" className="space-y-4">
                  {flatteningResult && flatteningResult.success ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Flattened SPF Record:</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(flatteningResult.flattenedRecord)}
                          className="flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </Button>
                      </div>
                      <div className="mt-2 p-3 bg-green-100 rounded border font-mono text-sm break-all">
                        {flatteningResult.flattenedRecord}
                      </div>
                      
                      {/* Metrics */}
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div className="p-3 bg-blue-50 rounded border">
                          <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-blue-600" />
                            <span className="font-semibold text-blue-800">Lookup Reduction</span>
                          </div>
                          <p className="text-2xl font-bold text-blue-600">
                            {flatteningResult.originalLookups} → {flatteningResult.newLookups}
                          </p>
                          <p className="text-sm text-blue-600">
                            -{flatteningResult.originalLookups - flatteningResult.newLookups} DNS queries saved
                          </p>
                        </div>
                        
                        <div className="p-3 bg-purple-50 rounded border">
                          <div className="flex items-center gap-2">
                            <Network className="w-4 h-4 text-purple-600" />
                            <span className="font-semibold text-purple-800">IP Addresses</span>
                          </div>
                          <p className="text-2xl font-bold text-purple-600">
                            {flatteningResult.ipCount}
                          </p>
                          <p className="text-sm text-purple-600">
                            resolved IP addresses
                          </p>
                        </div>
                      </div>

                      {/* Validation Results */}
                      {(() => {
                        const validation = validateFlattenedRecord(flatteningResult.flattenedRecord);
                        return (
                          <div className="mt-4">
                            <div className="flex items-center gap-2 mb-2">
                              {validation.isValid ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-600" />
                              )}
                              <span className="font-semibold">
                                {validation.isValid ? 'Valid SPF Record' : 'Invalid SPF Record'}
                              </span>
                            </div>
                            
                            <div className="text-sm space-y-1">
                              <p>Record size: {validation.recordSize} characters</p>
                              <p>DNS lookups: {validation.lookupCount}</p>
                              
                              {validation.warnings.length > 0 && (
                                <div className="mt-2">
                                  <p className="font-semibold text-yellow-700">Warnings:</p>
                                  {validation.warnings.map((warning, index) => (
                                    <p key={index} className="text-yellow-600">• {warning}</p>
                                  ))}
                                </div>
                              )}
                              
                              {validation.errors.length > 0 && (
                                <div className="mt-2">
                                  <p className="font-semibold text-red-700">Errors:</p>
                                  {validation.errors.map((error, index) => (
                                    <p key={index} className="text-red-600">• {error}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Implementation Notes */}
                      {flatteningResult.implementationNotes.length > 0 && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="font-semibold text-yellow-800 mb-2">Implementation Notes:</p>
                          <ul className="text-sm text-yellow-700 space-y-1">
                            {flatteningResult.implementationNotes.map((note, index) => (
                              <li key={index}>• {note}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Warnings */}
                      {flatteningResult.warnings.length > 0 && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                          <p className="font-semibold text-red-800 mb-2">Warnings:</p>
                          <ul className="text-sm text-red-700 space-y-1">
                            {flatteningResult.warnings.map((warning, index) => (
                              <li key={index}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Save Button */}
                      <div className="mt-4 flex gap-2">
                        <Button onClick={handleSave} className="flex items-center gap-2">
                          <Save className="w-4 h-4" />
                          Save Flattened Record
                        </Button>
                      </div>
                    </div>
                  ) : flatteningResult && !flatteningResult.success ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded">
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span className="font-semibold text-red-800">Flattening Failed</span>
                      </div>
                      <ul className="text-sm text-red-700 space-y-1">
                        {flatteningResult.errors.map((error, index) => (
                          <li key={index}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Eye className="w-8 h-8 mx-auto mb-2" />
                      <p>Select includes to flatten and click "Flatten Selected" to see results</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <Alert>
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default SPFFlattener;