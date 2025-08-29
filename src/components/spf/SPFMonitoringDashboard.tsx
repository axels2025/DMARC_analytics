import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Monitor, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Settings,
  TrendingUp,
  Zap,
  Shield,
  RefreshCw,
  Bell,
  Play,
  Pause,
  Info,
  Calendar,
  Mail,
  Workflow
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  useSPFFlattening, 
  useSPFFlatteningHistory, 
  useESPClassifications 
} from '@/hooks/useSPFAnalysis';

interface MonitoringDomain {
  domain: string;
  monitorEnabled: boolean;
  autoUpdate: boolean;
  updateStrategy: 'immediate' | 'scheduled' | 'manual_approval';
  confidenceThreshold: number;
  checkInterval: 'hourly' | 'daily' | 'weekly';
  lastChecked?: string;
  lastChangeDetected?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recentChangesCount: number;
  pendingChangesCount: number;
  activeIncludesCount: number;
}

interface ChangeEvent {
  id: string;
  domain: string;
  includeDomain: string;
  espName?: string;
  changeType: 'added' | 'removed' | 'modified';
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  autoUpdated: boolean;
  createdAt: string;
  autoUpdateSafe: boolean;
  riskFactors: string[];
}

interface UpdateOperation {
  id: string;
  domain: string;
  operationType: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  riskAssessment: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  requiresApproval: boolean;
  createdAt: string;
  scheduledFor?: string;
}

interface SPFMonitoringDashboardProps {
  selectedDomain?: string;
}

const SPFMonitoringDashboard: React.FC<SPFMonitoringDashboardProps> = ({ selectedDomain }) => {
  const { user } = useAuth();
  const [monitoredDomains, setMonitoredDomains] = useState<MonitoringDomain[]>([]);
  const [recentChanges, setRecentChanges] = useState<ChangeEvent[]>([]);
  const [pendingOperations, setPendingOperations] = useState<UpdateOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDomainForConfig, setSelectedDomainForConfig] = useState<string>('');

  // Load monitoring data
  const loadMonitoringData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Load monitored domains with aggregated data
      const { data: monitoringData, error: monitoringError } = await supabase
        .from('spf_monitoring_dashboard')
        .select('*')
        .eq('user_id', user.id)
        .eq('monitor_enabled', true);

      if (monitoringError) throw monitoringError;

      const domains: MonitoringDomain[] = (monitoringData || []).map(item => ({
        domain: item.domain,
        monitorEnabled: item.monitor_enabled,
        autoUpdate: item.auto_update,
        updateStrategy: item.update_strategy,
        confidenceThreshold: item.confidence_threshold,
        checkInterval: item.check_interval,
        lastChecked: item.last_checked_at,
        lastChangeDetected: item.last_change_detected,
        riskLevel: item.current_risk_level,
        recentChangesCount: item.recent_changes_count || 0,
        pendingChangesCount: item.pending_changes_count || 0,
        activeIncludesCount: item.active_includes_count || 0
      }));

      setMonitoredDomains(domains);

      // Load recent changes
      let changesQuery = supabase
        .from('spf_change_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (selectedDomain) {
        changesQuery = changesQuery.eq('domain', selectedDomain);
      }

      const { data: changesData, error: changesError } = await changesQuery;
      if (changesError) throw changesError;

      const changes: ChangeEvent[] = (changesData || []).map(item => ({
        id: item.id,
        domain: item.domain,
        includeDomain: item.include_domain,
        espName: item.esp_name,
        changeType: item.change_type,
        impactLevel: item.impact_level,
        autoUpdated: item.auto_updated,
        createdAt: item.created_at,
        autoUpdateSafe: item.auto_update_safe || false,
        riskFactors: item.risk_factors || []
      }));

      setRecentChanges(changes);

      // Load pending operations
      let operationsQuery = supabase
        .from('spf_dynamic_update_operations')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (selectedDomain) {
        operationsQuery = operationsQuery.eq('domain', selectedDomain);
      }

      const { data: operationsData, error: operationsError } = await operationsQuery;
      if (operationsError) throw operationsError;

      const operations: UpdateOperation[] = (operationsData || []).map(item => ({
        id: item.id,
        domain: item.domain,
        operationType: item.operation_type,
        status: item.status,
        riskAssessment: item.risk_assessment,
        confidenceScore: item.confidence_score,
        requiresApproval: item.requires_approval,
        createdAt: item.created_at,
        scheduledFor: item.scheduled_for
      }));

      setPendingOperations(operations);

    } catch (err) {
      console.error('Failed to load monitoring data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, [user, selectedDomain]);

  useEffect(() => {
    loadMonitoringData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadMonitoringData, 30000);
    return () => clearInterval(interval);
  }, [loadMonitoringData]);

  // Toggle monitoring for a domain
  const toggleDomainMonitoring = async (domain: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('user_spf_monitoring')
        .update({ monitor_enabled: enabled })
        .eq('user_id', user?.id)
        .eq('domain', domain);

      if (error) throw error;

      await loadMonitoringData();
    } catch (err) {
      console.error('Failed to toggle monitoring:', err);
      setError(err instanceof Error ? err.message : 'Failed to update monitoring settings');
    }
  };

  // Update domain configuration
  const updateDomainConfig = async (
    domain: string, 
    config: Partial<MonitoringDomain>
  ) => {
    try {
      const updateData: any = {};
      
      if (config.autoUpdate !== undefined) updateData.auto_update = config.autoUpdate;
      if (config.updateStrategy !== undefined) updateData.update_strategy = config.updateStrategy;
      if (config.confidenceThreshold !== undefined) updateData.confidence_threshold = config.confidenceThreshold;
      if (config.checkInterval !== undefined) updateData.check_interval = config.checkInterval;

      const { error } = await supabase
        .from('user_spf_monitoring')
        .update(updateData)
        .eq('user_id', user?.id)
        .eq('domain', domain);

      if (error) throw error;

      await loadMonitoringData();
    } catch (err) {
      console.error('Failed to update domain config:', err);
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    }
  };

  // Approve or reject pending operation
  const handleOperationAction = async (operationId: string, action: 'approve' | 'reject') => {
    try {
      const updateData = {
        status: action === 'approve' ? 'approved' : 'rejected',
        approved_by: action === 'approve' ? user?.id : null,
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        rejection_reason: action === 'reject' ? 'User rejected' : null
      };

      const { error } = await supabase
        .from('spf_dynamic_update_operations')
        .update(updateData)
        .eq('id', operationId)
        .eq('user_id', user?.id);

      if (error) throw error;

      await loadMonitoringData();
    } catch (err) {
      console.error('Failed to update operation:', err);
      setError(err instanceof Error ? err.message : 'Failed to update operation');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Loading monitoring dashboard...
        </div>
      </div>
    );
  }

  const totalDomains = monitoredDomains.length;
  const domainsWithAutoUpdate = monitoredDomains.filter(d => d.autoUpdate).length;
  const pendingChanges = recentChanges.filter(c => !c.autoUpdated).length;
  const criticalIssues = monitoredDomains.filter(d => d.riskLevel === 'critical').length;
  const pendingApprovals = pendingOperations.filter(o => o.requiresApproval && o.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="w-6 h-6" />
            SPF Monitoring Dashboard
          </h2>
          <p className="text-gray-600 mt-1">
            Real-time monitoring and automated management of SPF records
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadMonitoringData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monitored Domains</p>
                <p className="text-2xl font-bold">{totalDomains}</p>
              </div>
              <Monitor className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Auto-Update</p>
                <p className="text-2xl font-bold">{domainsWithAutoUpdate}</p>
              </div>
              <Zap className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Changes</p>
                <p className="text-2xl font-bold">{pendingChanges}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Need Approval</p>
                <p className="text-2xl font-bold">{pendingApprovals}</p>
              </div>
              <Bell className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Critical Issues</p>
                <p className="text-2xl font-bold">{criticalIssues}</p>
              </div>
              <AlertTriangle className={`w-8 h-8 ${criticalIssues > 0 ? 'text-red-500' : 'text-gray-400'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="changes">Recent Changes</TabsTrigger>
          <TabsTrigger value="operations">Pending Operations</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Domain Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Domain Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {monitoredDomains.map((domain) => (
                      <div key={domain.domain} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{domain.domain}</span>
                            <Badge variant={
                              domain.riskLevel === 'critical' ? 'destructive' :
                              domain.riskLevel === 'high' ? 'destructive' :
                              domain.riskLevel === 'medium' ? 'secondary' : 'default'
                            }>
                              {domain.riskLevel}
                            </Badge>
                            {domain.autoUpdate && (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <Zap className="w-3 h-3 mr-1" />
                                Auto
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 space-x-3">
                            <span>{domain.activeIncludesCount} includes</span>
                            <span>{domain.recentChangesCount} recent changes</span>
                            {domain.lastChecked && (
                              <span>Checked: {new Date(domain.lastChecked).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={domain.monitorEnabled}
                            onCheckedChange={(checked) => toggleDomainMonitoring(domain.domain, checked)}
                          />
                          <div className={`w-3 h-3 rounded-full ${
                            domain.riskLevel === 'critical' ? 'bg-red-500' :
                            domain.riskLevel === 'high' ? 'bg-orange-500' :
                            domain.riskLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                          }`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* ESP Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  ESP Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* This would show ESP-specific health information */}
                  <div className="text-sm text-gray-600">
                    ESP monitoring status and recent stability information would be displayed here.
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm font-medium">Stable ESPs</p>
                      <p className="text-lg font-bold">8</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                      <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                      <p className="text-sm font-medium">Unstable ESPs</p>
                      <p className="text-lg font-bold">2</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Recent Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {recentChanges.map((change) => (
                    <div key={change.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{change.domain}</span>
                            <Badge variant={
                              change.impactLevel === 'critical' ? 'destructive' :
                              change.impactLevel === 'high' ? 'destructive' :
                              change.impactLevel === 'medium' ? 'secondary' : 'default'
                            }>
                              {change.impactLevel} impact
                            </Badge>
                            {change.autoUpdated && (
                              <Badge variant="outline" className="text-green-600">
                                Auto-updated
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {change.changeType} in {change.includeDomain}
                            {change.espName && ` (${change.espName})`}
                          </p>
                          {change.riskFactors.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-red-600">
                                Risk factors: {change.riskFactors.join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(change.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {recentChanges.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No recent changes detected</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="w-5 h-5" />
                Pending Operations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingOperations.map((operation) => (
                  <div key={operation.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{operation.domain}</span>
                          <Badge variant={operation.status === 'pending' ? 'secondary' : 'default'}>
                            {operation.status}
                          </Badge>
                          <Badge variant={
                            operation.riskAssessment === 'critical' ? 'destructive' :
                            operation.riskAssessment === 'high' ? 'destructive' :
                            operation.riskAssessment === 'medium' ? 'secondary' : 'default'
                          }>
                            {operation.riskAssessment} risk
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {operation.operationType} • Confidence: {operation.confidenceScore}%
                        </p>
                        {operation.scheduledFor && (
                          <p className="text-xs text-gray-500">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            Scheduled for: {new Date(operation.scheduledFor).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(operation.createdAt).toLocaleString()}
                      </div>
                    </div>
                    
                    {operation.requiresApproval && operation.status === 'pending' && (
                      <div className="flex gap-2 pt-3 border-t">
                        <Button 
                          size="sm" 
                          onClick={() => handleOperationAction(operation.id, 'approve')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleOperationAction(operation.id, 'reject')}
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                {pendingOperations.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Workflow className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No pending operations</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Monitoring Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Domain Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Configure Domain</label>
                <Select value={selectedDomainForConfig} onValueChange={setSelectedDomainForConfig}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a domain to configure" />
                  </SelectTrigger>
                  <SelectContent>
                    {monitoredDomains.map((domain) => (
                      <SelectItem key={domain.domain} value={domain.domain}>
                        {domain.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedDomainForConfig && (
                <div className="space-y-4 p-4 border rounded-lg">
                  {(() => {
                    const domain = monitoredDomains.find(d => d.domain === selectedDomainForConfig);
                    if (!domain) return null;

                    return (
                      <>
                        <h4 className="font-medium">{domain.domain} Settings</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Auto-Update</label>
                            <Switch
                              checked={domain.autoUpdate}
                              onCheckedChange={(checked) => 
                                updateDomainConfig(domain.domain, { autoUpdate: checked })
                              }
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2">Update Strategy</label>
                            <Select 
                              value={domain.updateStrategy} 
                              onValueChange={(value: 'immediate' | 'scheduled' | 'manual_approval') => 
                                updateDomainConfig(domain.domain, { updateStrategy: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="immediate">Immediate</SelectItem>
                                <SelectItem value="scheduled">Scheduled</SelectItem>
                                <SelectItem value="manual_approval">Manual Approval</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2">Check Interval</label>
                            <Select 
                              value={domain.checkInterval} 
                              onValueChange={(value: 'hourly' | 'daily' | 'weekly') => 
                                updateDomainConfig(domain.domain, { checkInterval: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hourly">Hourly</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Confidence Threshold: {domain.confidenceThreshold}%
                            </label>
                            <input
                              type="range"
                              min="50"
                              max="100"
                              value={domain.confidenceThreshold}
                              onChange={(e) => 
                                updateDomainConfig(domain.domain, { 
                                  confidenceThreshold: parseInt(e.target.value) 
                                })
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SPFMonitoringDashboard;