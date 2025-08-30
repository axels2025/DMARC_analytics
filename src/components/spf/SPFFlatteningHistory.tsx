import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  History,
  TrendingDown,
  TrendingUp,
  Copy,
  RotateCcw,
  Calendar,
  Network,
  AlertTriangle,
  CheckCircle,
  Eye,
  GitCompare,
  FileSearch
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useSPFFlatteningHistory, SPFFlatteningOperation } from '@/hooks/useSPFAnalysis';

// Using SPFFlatteningOperation from the hook instead of FlatteningHistoryEntry

interface SPFFlatteningHistoryProps {
  domain?: string;
  onRevert?: (entry: SPFFlatteningOperation) => void;
  onViewDetails?: (entry: SPFFlatteningOperation) => void;
}

// Removed mock data - now using real database queries via useSPFFlatteningHistory hook

const SPFFlatteningHistory: React.FC<SPFFlatteningHistoryProps> = ({ 
  domain, 
  onRevert, 
  onViewDetails 
}) => {
  const [selectedEntry, setSelectedEntry] = useState<SPFFlatteningOperation | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'comparison'>('timeline');
  
  // Use the proper database hook
  const { operations: filteredHistory, loading, error, fetchOperations } = useSPFFlatteningHistory(domain);
  
  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'reverted': return 'bg-gray-500';
      case 'failed': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'reverted': return <RotateCcw className="w-4 h-4 text-gray-600" />;
      case 'failed': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'pending': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const calculateSavings = (entry: FlatteningHistoryEntry) => {
    const lookupSavings = entry.lookupsBefore - entry.lookupsAfter;
    const ipAddition = entry.ipCountAfter - entry.ipCountBefore;
    return { lookupSavings, ipAddition };
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getDiffStats = () => {
    if (filteredHistory.length < 2) return null;
    
    const latest = filteredHistory[0];
    const previous = filteredHistory[1];
    
    return {
      lookupDiff: latest.lookupsAfter - previous.lookupsAfter,
      ipDiff: latest.ipCountAfter - previous.ipCountAfter,
      includesDiff: latest.includesFlattened.length - previous.includesFlattened.length
    };
  };

  const diffStats = getDiffStats();

  // Show loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold mb-2">Loading History</h3>
          <p className="text-muted-foreground">
            Fetching your SPF flattening operations...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2 text-red-600">Error Loading History</h3>
          <p className="text-muted-foreground mb-4">
            {error}
          </p>
          <Button onClick={fetchOperations} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show empty state
  if (filteredHistory.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileSearch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No SPF Flattening Operations Found</h3>
          <p className="text-muted-foreground mb-4">
            {domain 
              ? `No flattening operations have been performed for ${domain}.`
              : 'No SPF flattening operations have been performed yet.'
            }
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Perform your first SPF analysis to see flattening history here. SPF flattening helps reduce DNS lookups by replacing include mechanisms with direct IP addresses.
          </p>
          <div className="space-y-2 text-sm text-left bg-gray-50 p-4 rounded-lg max-w-md mx-auto">
            <h4 className="font-medium">Getting Started:</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Analyze a domain's SPF record</li>
              <li>• Select includes to flatten</li>
              <li>• Review and apply changes</li>
              <li>• Monitor results here</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            SPF Flattening History
            {domain && <Badge variant="outline">{domain}</Badge>}
          </h3>
          <p className="text-sm text-muted-foreground">
            Track changes and monitor flattening impact over time
          </p>
        </div>
        
        {diffStats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <TrendingDown className="w-4 h-4 text-green-600" />
              <span className="text-green-600">
                {diffStats.lookupDiff <= 0 ? diffStats.lookupDiff : `+${diffStats.lookupDiff}`} lookups
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Network className="w-4 h-4 text-blue-600" />
              <span className="text-blue-600">
                {diffStats.ipDiff >= 0 ? `+${diffStats.ipDiff}` : diffStats.ipDiff} IPs
              </span>
            </div>
          </div>
        )}
      </div>

      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'timeline' | 'comparison')}>
        <TabsList>
          <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          <TabsTrigger value="comparison">Comparison View</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flattening Operations</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-4">
                  {filteredHistory.map((entry, index) => {
                    const savings = calculateSavings(entry);
                    
                    return (
                      <div key={entry.id} className="relative">
                        {/* Timeline connector */}
                        {index < filteredHistory.length - 1 && (
                          <div className="absolute left-4 top-12 bottom-0 w-0.5 bg-gray-200" />
                        )}
                        
                        <div className="flex items-start gap-4">
                          {/* Status indicator */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getStatusColor(entry.status)}`}>
                            <div className="w-3 h-3 bg-white rounded-full" />
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{entry.domain}</h4>
                                {getStatusIcon(entry.status)}
                                <Badge variant="outline" className="text-xs">
                                  {entry.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="w-4 h-4" />
                                {formatDate(entry.createdAt)}
                              </div>
                            </div>
                            
                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="font-medium">DNS Lookups</p>
                                <p className="text-muted-foreground">
                                  {entry.originalLookupCount} → {entry.newLookupCount || 0}
                                  {savings.lookupSavings > 0 && (
                                    <span className="text-green-600 ml-1">
                                      (-{savings.lookupSavings})
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium">IP Addresses</p>
                                <p className="text-muted-foreground">
                                  0 → {entry.ipCount || 0}
                                  {savings.ipAddition > 0 && (
                                    <span className="text-blue-600 ml-1">
                                      (+{savings.ipAddition})
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium">Target Includes</p>
                                <p className="text-muted-foreground">
                                  {entry.targetIncludes.length} domains
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedEntry(entry)}
                                  className="flex items-center gap-1"
                                >
                                  <Eye className="w-3 h-3" />
                                  View
                                </Button>
                                {entry.status === 'completed' && onRevert && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRevert(entry)}
                                    className="flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Revert
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            {/* Target includes */}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {entry.targetIncludes.map((include) => (
                                <Badge key={include} variant="secondary" className="text-xs">
                                  {include}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          {selectedEntry ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitCompare className="w-5 h-5" />
                    Before Flattening
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label>Original SPF Record:</Label>
                      <div className="mt-2 p-3 bg-gray-100 rounded border font-mono text-sm break-all">
                        {selectedEntry.originalRecord}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 border rounded">
                        <p className="font-semibold text-gray-700">DNS Lookups</p>
                        <p className="text-2xl font-bold text-red-600">
                          {selectedEntry.originalLookupCount}
                        </p>
                      </div>
                      <div className="p-3 border rounded">
                        <p className="font-semibold text-gray-700">IP Addresses</p>
                        <p className="text-2xl font-bold text-gray-600">
                          0
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <GitCompare className="w-5 h-5" />
                      After Flattening
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedEntry.flattenedRecord || '')}
                      className="flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label>Flattened SPF Record:</Label>
                      <div className="mt-2 p-3 bg-green-100 rounded border font-mono text-sm break-all">
                        {selectedEntry.flattenedRecord || 'No flattened record available'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 border rounded">
                        <p className="font-semibold text-green-700">DNS Lookups</p>
                        <p className="text-2xl font-bold text-green-600">
                          {selectedEntry.newLookupCount || 0}
                        </p>
                        <p className="text-sm text-green-600">
                          -{selectedEntry.originalLookupCount - (selectedEntry.newLookupCount || 0)} saved
                        </p>
                      </div>
                      <div className="p-3 border rounded">
                        <p className="font-semibold text-blue-700">IP Addresses</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {selectedEntry.ipCount || 0}
                        </p>
                        <p className="text-sm text-blue-600">
                          +{selectedEntry.ipCount || 0} added
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold mb-2">Target Includes:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedEntry.targetIncludes.map((include) => (
                          <Badge key={include} variant="outline" className="text-xs">
                            {include}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select an Entry</h3>
                <p className="text-muted-foreground">
                  Choose a flattening operation from the timeline to see detailed comparison
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Impact Analysis */}
      {filteredHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Impact Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(() => {
                const totalLookupSavings = filteredHistory
                  .filter(entry => entry.status === 'completed')
                  .reduce((total, entry) => total + (entry.originalLookupCount - (entry.newLookupCount || 0)), 0);
                
                const totalOperations = filteredHistory.length;
                const activeOperations = filteredHistory.filter(entry => entry.status === 'completed').length;

                return (
                  <>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-5 h-5 text-green-600" />
                        <span className="font-semibold text-green-800">Total DNS Savings</span>
                      </div>
                      <p className="text-3xl font-bold text-green-600">{totalLookupSavings}</p>
                      <p className="text-sm text-green-600">lookups eliminated</p>
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                        <span className="font-semibold text-blue-800">Completed Flattenings</span>
                      </div>
                      <p className="text-3xl font-bold text-blue-600">{activeOperations}</p>
                      <p className="text-sm text-blue-600">of {totalOperations} operations</p>
                    </div>

                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Network className="w-5 h-5 text-purple-600" />
                        <span className="font-semibold text-purple-800">Domains Optimized</span>
                      </div>
                      <p className="text-3xl font-bold text-purple-600">
                        {new Set(filteredHistory.filter(e => e.status === 'completed').map(e => e.domain)).size}
                      </p>
                      <p className="text-sm text-purple-600">unique domains</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monitoring Alert */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Monitoring Reminder:</strong> Flattened SPF records should be monitored regularly. 
          ESP IP ranges can change without notice. Set up automated checks or manual reviews 
          monthly for major ESPs, weekly for custom domains.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default SPFFlatteningHistory;