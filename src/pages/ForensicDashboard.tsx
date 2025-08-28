import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AlertTriangle, 
  Shield, 
  Globe, 
  Clock, 
  TrendingUp,
  RefreshCw,
  Download,
  Settings
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import useForensicData, { ForensicFilters, ForensicRecord } from '@/hooks/useForensicData';
import ForensicFiltersComponent from '@/components/forensics/ForensicFilters';
import ForensicReportsList from '@/components/forensics/ForensicReportsList';
import ForensicDetailModal from '@/components/forensics/ForensicDetailModal';
import ThreatSourceAnalysis from '@/components/forensics/ThreatSourceAnalysis';
import FailurePatternAnalysis from '@/components/forensics/FailurePatternAnalysis';
import MetricCard from '@/components/MetricCard';

const ForensicDashboard = () => {
  const { user } = useAuth();
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [filters, setFilters] = useState<Partial<ForensicFilters>>({
    dateRange: {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      end: new Date(),
    },
  });
  const [selectedRecord, setSelectedRecord] = useState<ForensicRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const { 
    records, 
    metrics, 
    loading, 
    error, 
    totalCount, 
    hasMore, 
    refetch, 
    loadMore 
  } = useForensicData(selectedDomain === 'all' ? undefined : selectedDomain, filters);

  // Fetch available domains
  useEffect(() => {
    const fetchDomains = async () => {
      if (!user) return;

      try {
        const { data } = await supabase
          .from('dmarc_forensic_reports')
          .select('domain')
          .eq('user_id', user.id);

        if (data) {
          const uniqueDomains = Array.from(new Set(data.map(r => r.domain)));
          setAvailableDomains(uniqueDomains);
        }
      } catch (error) {
        console.error('Failed to fetch domains:', error);
      }
    };

    fetchDomains();
  }, [user]);

  const handleRecordClick = (record: ForensicRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  const handleIPClick = (ip: string) => {
    setFilters(prev => ({
      ...prev,
      sourceIp: ip,
    }));
  };

  const formatMetricValue = (value: number | undefined): string => {
    if (value === undefined) return '0';
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  const getMetricTrend = (current: number, previous: number): 'up' | 'down' | 'stable' => {
    if (current > previous * 1.1) return 'up';
    if (current < previous * 0.9) return 'down';
    return 'stable';
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="text-center py-8">
            <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-red-700 mb-2">Error Loading Forensic Data</h3>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={refetch}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forensic Analysis</h1>
          <p className="text-muted-foreground">
            Detailed analysis of individual email authentication failures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {availableDomains.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={refetch}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Failed Emails"
          value={formatMetricValue(metrics?.totalFailedEmails)}
          icon={AlertTriangle}
          trend={getMetricTrend(metrics?.totalFailedEmails || 0, 0)}
          trendValue={metrics?.totalFailedEmails || 0}
          loading={loading}
          className="border-red-200"
        />
        <MetricCard
          title="Unique Threat Sources"
          value={formatMetricValue(metrics?.uniqueSources)}
          icon={Globe}
          trend={getMetricTrend(metrics?.uniqueSources || 0, 0)}
          trendValue={metrics?.uniqueSources || 0}
          loading={loading}
          className="border-orange-200"
        />
        <MetricCard
          title="Most Common Failure"
          value={metrics?.commonFailureType || 'None'}
          icon={Shield}
          loading={loading}
          className="border-yellow-200"
        />
        <MetricCard
          title="Recent Activity (24h)"
          value={formatMetricValue(metrics?.recentActivityCount)}
          icon={Clock}
          trend={getMetricTrend(metrics?.recentActivityCount || 0, 0)}
          trendValue={metrics?.recentActivityCount || 0}
          loading={loading}
          className="border-blue-200"
        />
      </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Forensic Reports
          </TabsTrigger>
          <TabsTrigger value="threat-sources" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Threat Sources
          </TabsTrigger>
          <TabsTrigger value="patterns" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Failure Patterns
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Activity Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filters */}
            <div className="lg:col-span-1">
              <ForensicFiltersComponent
                filters={filters}
                onFiltersChange={setFilters}
                availableDomains={availableDomains}
              />
            </div>

            {/* Reports List */}
            <div className="lg:col-span-3">
              <ForensicReportsList
                records={records}
                loading={loading}
                totalCount={totalCount}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onRecordClick={handleRecordClick}
                onRefresh={refetch}
                privacySettings={privacySettings}
                maskingOptions={maskingOptions}
                onPrivacySettingsChange={handlePrivacySettingsChange}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="threat-sources" className="space-y-6">
          <ThreatSourceAnalysis
            metrics={metrics}
            loading={loading}
            onIPClick={handleIPClick}
          />
        </TabsContent>

        <TabsContent value="patterns" className="space-y-6">
          <FailurePatternAnalysis
            metrics={metrics}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="timeline" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Activity Timeline
                <Badge variant="outline">Coming Soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Timeline View Coming Soon</h3>
              <p className="text-gray-500">
                Interactive timeline showing forensic events over time with filtering capabilities.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      <ForensicDetailModalPrivacy
        record={selectedRecord}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedRecord(null);
        }}
        privacySettings={privacySettings}
        maskingOptions={maskingOptions}
        onPrivacySettingsChange={handlePrivacySettingsChange}
      />
    </div>
  );
};

export default ForensicDashboard;