import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TestTube,
  Play,
  CheckCircle,
  AlertTriangle,
  Globe,
  MapPin,
  Shield,
  Clock,
  Database
} from 'lucide-react';
import { useIPIntelligence } from '@/hooks/useIPIntelligence';
import { IPIntelligenceData } from '@/services/ipIntelligenceService';

export const IPIntelligenceTest: React.FC = () => {
  const {
    getIPIntelligence,
    getIPIntelligenceBatch,
    processingIPs,
    error,
    clearError,
    getThreatLevelColor,
    formatLocation,
    formatOrganization
  } = useIPIntelligence();

  const [singleIP, setSingleIP] = useState('8.8.8.8');
  const [batchIPs, setBatchIPs] = useState('8.8.8.8\n1.1.1.1\n208.67.222.222');
  const [singleResult, setSingleResult] = useState<IPIntelligenceData | null>(null);
  const [batchResults, setBatchResults] = useState<IPIntelligenceData[]>([]);
  const [testLog, setTestLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    setTestLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleTestSingle = async () => {
    if (!singleIP.trim()) return;
    
    setSingleResult(null);
    clearError();
    addLog(`Testing single IP: ${singleIP}`);
    
    try {
      const result = await getIPIntelligence(singleIP.trim());
      if (result) {
        setSingleResult(result);
        addLog(`✓ Single IP test successful - ${result.cached ? 'cached' : 'fresh'} data`);
      } else {
        addLog(`✗ Single IP test failed - no data returned`);
      }
    } catch (error) {
      addLog(`✗ Single IP test error: ${error}`);
    }
  };

  const handleTestBatch = async () => {
    const ips = batchIPs.split('\n').map(ip => ip.trim()).filter(ip => ip);
    if (ips.length === 0) return;

    setBatchResults([]);
    clearError();
    addLog(`Testing batch of ${ips.length} IPs: ${ips.join(', ')}`);
    
    try {
      const response = await getIPIntelligenceBatch(ips);
      if (response && response.success) {
        setBatchResults(response.data);
        addLog(`✓ Batch test successful - processed ${response.data.length}/${ips.length} IPs`);
        addLog(`  Cache hits: ${response.metadata.cache_hits}, misses: ${response.metadata.cache_misses}`);
        addLog(`  Processing time: ${response.metadata.processing_time_ms}ms`);
        if (response.metadata.providers_used.length > 0) {
          addLog(`  Providers: ${response.metadata.providers_used.join(', ')}`);
        }
      } else {
        addLog(`✗ Batch test failed - ${response?.errors.join(', ') || 'unknown error'}`);
      }
    } catch (error) {
      addLog(`✗ Batch test error: ${error}`);
    }
  };

  const clearTests = () => {
    setSingleResult(null);
    setBatchResults([]);
    setTestLog([]);
    clearError();
  };

  const getThreatBadgeVariant = (level: string) => {
    switch (level) {
      case 'low': return 'outline';
      case 'medium': return 'secondary';
      case 'high': case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  const renderIPResult = (data: IPIntelligenceData, index?: number) => (
    <div key={data.ip_address} className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-lg">{data.ip_address}</h4>
        <div className="flex items-center gap-2">
          <Badge variant={getThreatBadgeVariant(data.threat_level)}>
            {data.threat_level}
          </Badge>
          {data.cached && (
            <Badge variant="secondary" className="text-xs">
              <Database className="w-3 h-3 mr-1" />
              Cached {data.cache_age_hours}h
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-500" />
            <span>{formatLocation(data)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-500" />
            <span>{formatOrganization(data)}</span>
          </div>
          {data.provider && (
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-500" />
              <span>Provider: {data.provider}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {data.is_vpn && <Badge variant="outline" className="text-xs">VPN</Badge>}
            {data.is_proxy && <Badge variant="outline" className="text-xs">Proxy</Badge>}
            {data.is_tor && <Badge variant="outline" className="text-xs">Tor</Badge>}
            {data.is_hosting && <Badge variant="outline" className="text-xs">Hosting</Badge>}
          </div>
          
          {(data.latitude && data.longitude) && (
            <div className="text-xs text-gray-500">
              Coordinates: {data.latitude.toFixed(4)}, {data.longitude.toFixed(4)}
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            Confidence: {Math.round(data.provider_confidence * 100)}%
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">IP Intelligence Testing</h2>
          <p className="text-sm text-gray-600 mt-1">
            Test the IP intelligence service with single IPs and batches
          </p>
        </div>
        <Button variant="outline" onClick={clearTests} disabled={processingIPs}>
          Clear Tests
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Single IP Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="w-5 h-5" />
              Single IP Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter IP address (e.g., 8.8.8.8)"
                value={singleIP}
                onChange={(e) => setSingleIP(e.target.value)}
              />
              <Button 
                onClick={handleTestSingle} 
                disabled={processingIPs || !singleIP.trim()}
                className="flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Test
              </Button>
            </div>

            {singleResult && (
              <div className="space-y-3">
                <h4 className="font-medium text-green-600 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Result
                </h4>
                {renderIPResult(singleResult)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Batch IP Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="w-5 h-5" />
              Batch IP Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <textarea
                className="w-full h-24 p-2 border rounded-md text-sm font-mono"
                placeholder="Enter IP addresses (one per line)"
                value={batchIPs}
                onChange={(e) => setBatchIPs(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                One IP per line, maximum 20 IPs per batch
              </p>
            </div>

            <Button 
              onClick={handleTestBatch} 
              disabled={processingIPs || !batchIPs.trim()}
              className="flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Test Batch
            </Button>

            {batchResults.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-green-600 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Results ({batchResults.length})
                </h4>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {batchResults.map((result, index) => renderIPResult(result, index))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Test Log */}
      {testLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Test Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-sm font-mono whitespace-pre-wrap">
                {testLog.join('\n')}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading Indicator */}
      {processingIPs && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          Processing IPs...
        </div>
      )}
    </div>
  );
};