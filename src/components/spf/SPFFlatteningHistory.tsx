import React, { useState } from 'react';
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
  GitCompare
} from 'lucide-react';

interface FlatteningHistoryEntry {
  id: string;
  domain: string;
  timestamp: string;
  originalRecord: string;
  flattenedRecord: string;
  includesFlattened: string[];
  lookupsBefore: number;
  lookupsAfter: number;
  ipCountBefore: number;
  ipCountAfter: number;
  status: 'active' | 'reverted' | 'outdated';
}

interface SPFFlatteningHistoryProps {
  domain?: string;
  onRevert?: (entry: FlatteningHistoryEntry) => void;
  onViewDetails?: (entry: FlatteningHistoryEntry) => void;
}

// Mock data - in real implementation this would come from the database
const mockHistory: FlatteningHistoryEntry[] = [
  {
    id: '1',
    domain: 'example.com',
    timestamp: '2024-03-15T10:30:00Z',
    originalRecord: 'v=spf1 include:_spf.google.com include:mailgun.org include:sendgrid.net mx ~all',
    flattenedRecord: 'v=spf1 ip4:108.177.8.0/24 ip4:173.194.0.0/16 ip4:192.30.252.0/22 ip4:198.37.147.0/24 ip4:167.89.0.0/17 mx ~all',
    includesFlattened: ['_spf.google.com', 'mailgun.org', 'sendgrid.net'],
    lookupsBefore: 4,
    lookupsAfter: 1,
    ipCountBefore: 0,
    ipCountAfter: 5,
    status: 'active'
  },
  {
    id: '2',
    domain: 'example.com',
    timestamp: '2024-03-10T14:20:00Z',
    originalRecord: 'v=spf1 include:_spf.google.com include:mailgun.org mx a ~all',
    flattenedRecord: 'v=spf1 ip4:108.177.8.0/24 ip4:173.194.0.0/16 ip4:198.37.147.0/24 mx a ~all',
    includesFlattened: ['_spf.google.com', 'mailgun.org'],
    lookupsBefore: 4,
    lookupsAfter: 2,
    ipCountBefore: 0,
    ipCountAfter: 3,
    status: 'reverted'
  },
  {
    id: '3',
    domain: 'test.com',
    timestamp: '2024-03-08T09:15:00Z',
    originalRecord: 'v=spf1 include:_spf.google.com include:_spf.salesforce.com mx ~all',
    flattenedRecord: 'v=spf1 ip4:108.177.8.0/24 ip4:136.147.0.0/16 ip4:96.43.144.0/20 mx ~all',
    includesFlattened: ['_spf.google.com', '_spf.salesforce.com'],
    lookupsBefore: 3,
    lookupsAfter: 1,
    ipCountBefore: 0,
    ipCountAfter: 3,
    status: 'outdated'
  }
];

const SPFFlatteningHistory: React.FC<SPFFlatteningHistoryProps> = ({ 
  domain, 
  onRevert, 
  onViewDetails 
}) => {
  const [selectedEntry, setSelectedEntry] = useState<FlatteningHistoryEntry | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'comparison'>('timeline');

  // Filter history by domain if specified
  const filteredHistory = domain 
    ? mockHistory.filter(entry => entry.domain === domain)
    : mockHistory;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'reverted': return 'bg-gray-500';
      case 'outdated': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'reverted': return <RotateCcw className="w-4 h-4 text-gray-600" />;
      case 'outdated': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
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

  if (filteredHistory.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Flattening History</h3>
          <p className="text-muted-foreground">
            {domain 
              ? `No flattening operations have been performed for ${domain}`
              : 'No SPF flattening operations have been performed yet'
            }
          </p>
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
                                {formatDate(entry.timestamp)}
                              </div>
                            </div>
                            
                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="font-medium">DNS Lookups</p>
                                <p className="text-muted-foreground">
                                  {entry.lookupsBefore} → {entry.lookupsAfter}
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
                                  {entry.ipCountBefore} → {entry.ipCountAfter}
                                  {savings.ipAddition > 0 && (
                                    <span className="text-blue-600 ml-1">
                                      (+{savings.ipAddition})
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium">Flattened Includes</p>
                                <p className="text-muted-foreground">
                                  {entry.includesFlattened.length} domains
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
                                {entry.status === 'active' && onRevert && (
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
                            
                            {/* Flattened includes */}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {entry.includesFlattened.map((include) => (
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
                          {selectedEntry.lookupsBefore}
                        </p>
                      </div>
                      <div className="p-3 border rounded">
                        <p className="font-semibold text-gray-700">IP Addresses</p>
                        <p className="text-2xl font-bold text-gray-600">
                          {selectedEntry.ipCountBefore}
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
                      onClick={() => copyToClipboard(selectedEntry.flattenedRecord)}
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
                        {selectedEntry.flattenedRecord}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 border rounded">
                        <p className="font-semibold text-green-700">DNS Lookups</p>
                        <p className="text-2xl font-bold text-green-600">
                          {selectedEntry.lookupsAfter}
                        </p>
                        <p className="text-sm text-green-600">
                          -{selectedEntry.lookupsBefore - selectedEntry.lookupsAfter} saved
                        </p>
                      </div>
                      <div className="p-3 border rounded">
                        <p className="font-semibold text-blue-700">IP Addresses</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {selectedEntry.ipCountAfter}
                        </p>
                        <p className="text-sm text-blue-600">
                          +{selectedEntry.ipCountAfter - selectedEntry.ipCountBefore} added
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold mb-2">Flattened Includes:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedEntry.includesFlattened.map((include) => (
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
                  .filter(entry => entry.status === 'active')
                  .reduce((total, entry) => total + (entry.lookupsBefore - entry.lookupsAfter), 0);
                
                const totalOperations = filteredHistory.length;
                const activeOperations = filteredHistory.filter(entry => entry.status === 'active').length;

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
                        <span className="font-semibold text-blue-800">Active Flattenings</span>
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
                        {new Set(filteredHistory.filter(e => e.status === 'active').map(e => e.domain)).size}
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