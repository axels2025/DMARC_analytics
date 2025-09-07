import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, 
  Database, 
  Zap, 
  Clock, 
  BarChart3, 
  RefreshCw, 
  Trash2,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useIPIntelligence, IPIntelligenceConfig } from '@/hooks/useIPIntelligence';
import { formatDistanceToNow } from 'date-fns';

export const IPIntelligenceSettings: React.FC = () => {
  const {
    stats,
    config,
    loading,
    error,
    refreshStats,
    clearCache,
    updateConfig,
    clearError
  } = useIPIntelligence();
  
  const [tempConfig, setTempConfig] = useState<IPIntelligenceConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);

  const handleConfigChange = (key: keyof IPIntelligenceConfig, value: any) => {
    const newConfig = { ...tempConfig, [key]: value };
    setTempConfig(newConfig);
    setHasChanges(JSON.stringify(newConfig) !== JSON.stringify(config));
  };

  const saveConfig = () => {
    updateConfig(tempConfig);
    setHasChanges(false);
  };

  const resetConfig = () => {
    setTempConfig(config);
    setHasChanges(false);
  };

  const formatCacheHitRate = (rate: number): string => {
    if (rate === 0) return '0%';
    return `${rate.toFixed(1)}%`;
  };

  const getCacheHitRateColor = (rate: number): string => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCacheHitRateVariant = (rate: number): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (rate >= 80) return 'outline';
    if (rate >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">IP Intelligence Settings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure IP geolocation and threat intelligence settings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={refreshStats}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Stats
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Enable/Disable */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="enabled">Enable IP Intelligence</Label>
                <p className="text-sm text-gray-600">
                  Enable or disable IP geolocation and threat intelligence
                </p>
              </div>
              <Switch
                id="enabled"
                checked={tempConfig.enabled}
                onCheckedChange={(checked) => handleConfigChange('enabled', checked)}
              />
            </div>

            <Separator />

            {/* Batch Size */}
            <div className="space-y-2">
              <Label htmlFor="batchSize">Batch Size</Label>
              <Input
                id="batchSize"
                type="number"
                min="1"
                max="20"
                value={tempConfig.batchSize}
                onChange={(e) => handleConfigChange('batchSize', parseInt(e.target.value) || 10)}
                disabled={!tempConfig.enabled}
              />
              <p className="text-sm text-gray-600">
                Number of IPs to process simultaneously (1-20)
              </p>
            </div>

            {/* Show Cache Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="showCacheStatus">Show Cache Status</Label>
                <p className="text-sm text-gray-600">
                  Display cache hit/miss information in console
                </p>
              </div>
              <Switch
                id="showCacheStatus"
                checked={tempConfig.showCacheStatus}
                onCheckedChange={(checked) => handleConfigChange('showCacheStatus', checked)}
                disabled={!tempConfig.enabled}
              />
            </div>

            {/* Auto Refresh */}
            <div className="space-y-2">
              <Label htmlFor="autoRefresh">Auto Refresh (minutes)</Label>
              <Input
                id="autoRefresh"
                type="number"
                min="0"
                max="60"
                value={tempConfig.autoRefreshInterval}
                onChange={(e) => handleConfigChange('autoRefreshInterval', parseInt(e.target.value) || 0)}
                disabled={!tempConfig.enabled}
              />
              <p className="text-sm text-gray-600">
                Auto-refresh statistics interval (0 = disabled)
              </p>
            </div>

            {/* Save/Reset Buttons */}
            {hasChanges && (
              <div className="flex gap-2 pt-4">
                <Button onClick={saveConfig} size="sm">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
                <Button variant="outline" onClick={resetConfig} size="sm">
                  Reset
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Statistics
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                <span>Loading statistics...</span>
              </div>
            ) : stats ? (
              <>
                {/* Cache Overview */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {stats.total_cached_ips.toLocaleString()}
                    </div>
                    <div className="text-sm text-blue-800">Total Cached IPs</div>
                  </div>
                  
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {stats.active_cache_entries.toLocaleString()}
                    </div>
                    <div className="text-sm text-green-800">Active Entries</div>
                  </div>
                </div>

                {/* Cache Hit Rate */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Cache Hit Rate</span>
                    <Badge variant={getCacheHitRateVariant(stats.cache_hit_rate)}>
                      {formatCacheHitRate(stats.cache_hit_rate)}
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(stats.cache_hit_rate, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Most Common Countries */}
                {stats.most_common_countries.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Top Countries</h4>
                    <div className="flex flex-wrap gap-1">
                      {stats.most_common_countries.slice(0, 5).map((country, index) => (
                        <Badge key={country} variant="outline" className="text-xs">
                          {country}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Provider Usage */}
                {Object.keys(stats.provider_usage).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Provider Usage</h4>
                    <div className="space-y-1">
                      {Object.entries(stats.provider_usage)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 3)
                        .map(([provider, count]) => (
                          <div key={provider} className="flex justify-between text-sm">
                            <span className="capitalize">{provider}</span>
                            <span className="font-medium">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Expired Entries */}
                {stats.expired_entries > 0 && (
                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertDescription>
                      {stats.expired_entries} cache entries have expired and can be cleaned up.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No statistics available</p>
                <p className="text-sm">Enable IP intelligence to see stats</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cache Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Cache Management
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-medium">Clear Cache</h4>
              <p className="text-sm text-gray-600">
                Remove all cached IP intelligence data. This will force fresh lookups for all IPs.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={clearCache}
              disabled={loading || !stats?.total_cached_ips}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear Cache
            </Button>
          </div>

          {stats && stats.cache_hit_rate > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Current cache provides {formatCacheHitRate(stats.cache_hit_rate)} hit rate, 
                improving performance and reducing API costs.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};