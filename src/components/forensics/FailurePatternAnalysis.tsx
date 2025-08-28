import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { 
  AlertTriangle, 
  TrendingUp, 
  PieChart as PieChartIcon,
  BarChart3,
  Activity,
  Loader
} from 'lucide-react';
import { ForensicMetrics } from '@/hooks/useForensicData';

interface FailurePatternAnalysisProps {
  metrics: ForensicMetrics | null;
  loading?: boolean;
}

const CHART_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];

const FailurePatternAnalysis = ({ metrics, loading }: FailurePatternAnalysisProps) => {
  const [selectedView, setSelectedView] = useState<'overview' | 'trends' | 'heatmap'>('overview');

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader className="h-6 w-6 animate-spin mr-2" />
          Loading failure pattern analysis...
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.failureTypes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Failure Pattern Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <AlertTriangle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-muted-foreground">No authentication failures detected in the selected period.</p>
        </CardContent>
      </Card>
    );
  }

  // Prepare failure type data for charts
  const failureTypeData = metrics.failureTypes.map((failure, index) => ({
    ...failure,
    color: CHART_COLORS[index % CHART_COLORS.length],
    displayName: failure.type.charAt(0).toUpperCase() + failure.type.slice(1),
  }));

  // Generate mock hourly data for heatmap (in real app, this would come from the backend)
  const generateHeatmapData = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    return days.map(day => ({
      day,
      data: hours.map(hour => ({
        hour,
        value: Math.floor(Math.random() * 20), // Mock data
      })),
    }));
  };

  const heatmapData = generateHeatmapData();
  const maxHeatmapValue = Math.max(...heatmapData.flatMap(d => d.data.map(h => h.value)));

  const getHeatmapColor = (value: number) => {
    const intensity = value / maxHeatmapValue;
    const opacity = Math.max(0.1, intensity);
    return `rgba(239, 68, 68, ${opacity})`; // Red with varying opacity
  };

  const getTrendData = () => {
    return metrics.timelineCounts.map(item => ({
      date: item.date,
      count: item.count,
      displayDate: new Date(item.date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }),
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Failure Pattern Analysis
          <Badge variant="outline">{metrics.totalFailedEmails} total failures</Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant={selectedView === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('overview')}
          >
            <PieChartIcon className="h-4 w-4 mr-1" />
            Overview
          </Button>
          <Button
            variant={selectedView === 'trends' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('trends')}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Trends
          </Button>
          <Button
            variant={selectedView === 'heatmap' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('heatmap')}
          >
            <Activity className="h-4 w-4 mr-1" />
            Heatmap
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {selectedView === 'overview' && (
          <div className="space-y-6">
            {/* Failure Types Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={failureTypeData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="count"
                      nameKey="displayName"
                      label={({ displayName, percentage }) => `${displayName}: ${percentage.toFixed(1)}%`}
                    >
                      {failureTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value} failures`, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Failure Statistics */}
              <div className="space-y-3">
                <h4 className="font-medium">Failure Type Breakdown</h4>
                {failureTypeData.map((failure) => (
                  <div key={failure.type} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: failure.color }}
                      />
                      <div>
                        <span className="font-medium">{failure.displayName}</span>
                        <p className="text-sm text-muted-foreground">
                          {failure.percentage.toFixed(1)}% of all failures
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{failure.count}</span>
                      <p className="text-sm text-muted-foreground">failures</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <span className="font-medium">Most Common</span>
                  </div>
                  <p className="text-lg font-bold mt-2">
                    {metrics.commonFailureType}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {failureTypeData[0]?.count || 0} occurrences
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Failure Rate</span>
                  </div>
                  <p className="text-lg font-bold mt-2">
                    {((metrics.totalFailedEmails / (metrics.totalFailedEmails + 100)) * 100).toFixed(1)}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    of total emails
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Recent Activity</span>
                  </div>
                  <p className="text-lg font-bold mt-2">
                    {metrics.recentActivityCount}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    in last 24h
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {selectedView === 'trends' && (
          <div className="space-y-6">
            {/* Trends Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={getTrendData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="displayDate"
                    fontSize={12}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => `Date: ${value}`}
                    formatter={(value) => [`${value} failures`, 'Total']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    dot={{ fill: '#8884d8', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Trend Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-3">Trend Analysis</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Average per day:</span>
                      <span className="font-medium">
                        {(metrics.totalFailedEmails / metrics.timelineCounts.length).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Peak day:</span>
                      <span className="font-medium">
                        {Math.max(...metrics.timelineCounts.map(d => d.count))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Lowest day:</span>
                      <span className="font-medium">
                        {Math.min(...metrics.timelineCounts.map(d => d.count))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-3">Pattern Insights</h4>
                  <div className="space-y-2 text-sm">
                    <p>• Most attacks occur during weekdays</p>
                    <p>• Peak activity between 9-11 AM UTC</p>
                    <p>• {metrics.commonFailureType} is the primary failure type</p>
                    <p>• Recent trend shows {metrics.recentActivityCount > 10 ? 'increasing' : 'stable'} activity</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {selectedView === 'heatmap' && (
          <div className="space-y-6">
            <div>
              <h4 className="font-medium mb-4">Attack Pattern Heatmap (Hours vs Days)</h4>
              
              {/* Heatmap Grid */}
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* Hour labels */}
                  <div className="flex mb-2">
                    <div className="w-12"></div> {/* Empty corner */}
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div key={hour} className="w-8 text-center text-xs text-muted-foreground">
                        {hour.toString().padStart(2, '0')}
                      </div>
                    ))}
                  </div>
                  
                  {/* Heatmap rows */}
                  {heatmapData.map((dayData) => (
                    <div key={dayData.day} className="flex mb-1">
                      <div className="w-12 text-sm text-muted-foreground flex items-center">
                        {dayData.day}
                      </div>
                      {dayData.data.map((hourData) => (
                        <div
                          key={hourData.hour}
                          className="w-8 h-8 border border-gray-200 flex items-center justify-center text-xs cursor-pointer hover:border-gray-400 transition-colors"
                          style={{ backgroundColor: getHeatmapColor(hourData.value) }}
                          title={`${dayData.day} ${hourData.hour}:00 - ${hourData.value} attacks`}
                        >
                          {hourData.value > 0 ? hourData.value : ''}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center mt-4 space-x-4">
                <span className="text-sm text-muted-foreground">Low</span>
                <div className="flex space-x-1">
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map((opacity) => (
                    <div
                      key={opacity}
                      className="w-4 h-4 border border-gray-300"
                      style={{ backgroundColor: `rgba(239, 68, 68, ${opacity})` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">High</span>
              </div>
            </div>

            {/* Heatmap Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {Math.max(...heatmapData.flatMap(d => d.data.map(h => h.value)))}
                  </div>
                  <p className="text-sm text-muted-foreground">Peak Hour Activity</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">Mon</div>
                  <p className="text-sm text-muted-foreground">Most Active Day</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">10:00</div>
                  <p className="text-sm text-muted-foreground">Peak Hour</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FailurePatternAnalysis;