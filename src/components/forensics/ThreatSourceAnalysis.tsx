import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { 
  Globe, 
  MapPin, 
  Server, 
  TrendingUp, 
  AlertTriangle,
  Eye,
  Shield,
  Loader
} from 'lucide-react';
import { ForensicMetrics } from '@/hooks/useForensicData';

interface ThreatSourceAnalysisProps {
  metrics: ForensicMetrics | null;
  loading?: boolean;
  onIPClick?: (ip: string) => void;
}

const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const ThreatSourceAnalysis = ({ metrics, loading, onIPClick }: ThreatSourceAnalysisProps) => {
  const [selectedView, setSelectedView] = useState<'top-sources' | 'provider-analysis' | 'timeline'>('top-sources');

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader className="h-6 w-6 animate-spin mr-2" />
          Loading threat source analysis...
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.topThreatSources.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Threat Source Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-muted-foreground">No threat sources detected in the selected period.</p>
        </CardContent>
      </Card>
    );
  }

  const topSources = metrics.topThreatSources.slice(0, 10);
  
  // Prepare chart data
  const chartData = topSources.map((source, index) => ({
    ip: source.ip.length > 15 ? `${source.ip.substring(0, 15)}...` : source.ip,
    fullIp: source.ip,
    count: source.count,
    provider: source.provider,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  // Group by provider for provider analysis
  const providerGroups = topSources.reduce((acc, source) => {
    const provider = source.provider || 'Unknown';
    if (!acc[provider]) {
      acc[provider] = { provider, count: 0, ips: [] as string[] };
    }
    acc[provider].count += source.count;
    acc[provider].ips.push(source.ip);
    return acc;
  }, {} as Record<string, { provider: string; count: number; ips: string[] }>);

  const providerData = Object.values(providerGroups)
    .sort((a, b) => b.count - a.count)
    .map((group, index) => ({
      ...group,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));

  const getThreatLevelBadge = (count: number) => {
    if (count >= 100) return <Badge variant="destructive">High Risk</Badge>;
    if (count >= 10) return <Badge className="bg-orange-500">Medium Risk</Badge>;
    return <Badge variant="secondary">Low Risk</Badge>;
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Threat Source Analysis
          <Badge variant="outline">{metrics.uniqueSources} unique sources</Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant={selectedView === 'top-sources' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('top-sources')}
          >
            Top Sources
          </Button>
          <Button
            variant={selectedView === 'provider-analysis' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('provider-analysis')}
          >
            Provider Analysis
          </Button>
          <Button
            variant={selectedView === 'timeline' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('timeline')}
          >
            Attack Timeline
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {selectedView === 'top-sources' && (
          <div className="space-y-6">
            {/* Top Sources Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="ip" 
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    fontSize={12}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name, props) => [
                      `${value} attacks`,
                      `IP: ${props.payload.fullIp}`
                    ]}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#8884d8"
                    onClick={(data) => onIPClick?.(data.fullIp)}
                    style={{ cursor: onIPClick ? 'pointer' : 'default' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top Sources Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source IP</TableHead>
                    <TableHead>Attack Count</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Threat Level</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSources.map((source) => (
                    <TableRow key={source.ip}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{source.ip}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{source.count}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{source.provider}</span>
                      </TableCell>
                      <TableCell>
                        {getThreatLevelBadge(source.count)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatLastSeen(source.lastSeen)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {onIPClick && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onIPClick(source.ip)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {/* TODO: Implement geolocation */}}
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {selectedView === 'provider-analysis' && (
          <div className="space-y-6">
            {/* Provider Distribution Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={providerData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="count"
                      nameKey="provider"
                    >
                      {providerData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [`${value} attacks`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Provider Statistics */}
              <div className="space-y-3">
                <h4 className="font-medium">Provider Breakdown</h4>
                {providerData.map((provider) => (
                  <div key={provider.provider} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <span className="font-medium">{provider.provider}</span>
                      <p className="text-sm text-muted-foreground">
                        {provider.ips.length} unique IPs
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{provider.count}</span>
                      <p className="text-sm text-muted-foreground">attacks</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedView === 'timeline' && (
          <div className="space-y-6">
            {/* Timeline Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.timelineCounts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value) => [`${value} attacks`, 'Total']}
                  />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Timeline Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <span className="font-medium">Peak Day</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {Math.max(...metrics.timelineCounts.map(d => d.count))}
                  </p>
                  <p className="text-sm text-muted-foreground">attacks</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Daily Average</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {Math.round(metrics.totalFailedEmails / metrics.timelineCounts.length)}
                  </p>
                  <p className="text-sm text-muted-foreground">attacks/day</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Active Today</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {metrics.recentActivityCount}
                  </p>
                  <p className="text-sm text-muted-foreground">in 24h</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ThreatSourceAnalysis;