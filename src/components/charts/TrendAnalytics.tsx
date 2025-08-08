import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader, TrendingUp, Globe, Shield, AlertCircle } from "lucide-react";
import { detectIPProviders } from "@/utils/ipProviderDetection";

interface TrendData {
  date: string;
  successRate: number;
  totalEmails: number;
  failedEmails: number;
  reportCount: number;
  domain: string;
}

interface ProviderTrend {
  provider: string;
  data: Array<{
    date: string;
    successRate: number;
    emailCount: number;
  }>;
}

interface TopSourceIP {
  ip: string;
  provider: string;
  count: number;
  rate: number;
}

interface DispositionTrend {
  date: string;
  none: number;
  quarantine: number;
  reject: number;
  total: number;
}

interface TrendAnalyticsProps {
  selectedDomain?: string;
}

const TrendAnalytics = ({ selectedDomain }: TrendAnalyticsProps) => {
  const { user } = useAuth();
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [providerTrends, setProviderTrends] = useState<ProviderTrend[]>([]);
  const [topSourceIPs, setTopSourceIPs] = useState<TopSourceIP[]>([]);
  const [dispositionTrend, setDispositionTrend] = useState<DispositionTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportCount, setReportCount] = useState(0);
  const [activeTab, setActiveTab] = useState('success-trends');

  useEffect(() => {
    const fetchTrendData = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        // Fetch all reports ordered by date
        let reportsQuery = supabase
          .from("dmarc_reports")
          .select("*")
          .eq("user_id", user.id);

        if (selectedDomain) {
          reportsQuery = reportsQuery.eq("domain", selectedDomain);
        }

        const { data: reports } = await reportsQuery.order("date_range_begin", { ascending: true });

        if (!reports || reports.length === 0) {
          setReportCount(0);
          setLoading(false);
          return;
        }

        setReportCount(reports.length);

        // Process trend data for each report
        const trendPromises = reports.map(async (report) => {
          const { data: records } = await supabase
            .from("dmarc_records")
            .select("count, dkim_result, spf_result, source_ip, disposition")
            .eq("report_id", report.id);

          if (!records || records.length === 0) {
            const dateLabel = new Date(report.date_range_begin * 1000).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric' 
            });
            return {
              trend: {
                date: dateLabel,
                successRate: 0,
                totalEmails: 0,
                failedEmails: 0,
                reportCount: 1,
                domain: report.domain
              },
              disp: {
                date: dateLabel,
                none: 0,
                quarantine: 0,
                reject: 0,
                total: 0
              }
            };
          }

          const totalEmails = records.reduce((sum, r) => sum + r.count, 0);
          const passedEmails = records
            .filter(r => r.dkim_result === "pass" && r.spf_result === "pass")
            .reduce((sum, r) => sum + r.count, 0);
          const failedEmails = totalEmails - passedEmails;
          const successRate = totalEmails > 0 ? Math.round((passedEmails / totalEmails) * 100 * 10) / 10 : 0;

          const dispCounts = records.reduce((acc: any, r: any) => {
            const d = (r.disposition || 'none').toLowerCase();
            if (!acc[d]) acc[d] = 0;
            acc[d] += r.count;
            return acc;
          }, { none: 0, quarantine: 0, reject: 0 } as Record<string, number>);

          const dateLabel = new Date(report.date_range_begin * 1000).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          });

          return {
            trend: {
              date: dateLabel,
              successRate,
              totalEmails,
              failedEmails,
              reportCount: 1,
              domain: report.domain
            },
            disp: {
              date: dateLabel,
              none: dispCounts.none || 0,
              quarantine: dispCounts.quarantine || 0,
              reject: dispCounts.reject || 0,
              total: totalEmails
            }
          };
        });

        const resolved = await Promise.all(trendPromises);
        setTrendData(resolved.map(r => r.trend));
        setDispositionTrend(resolved.map(r => r.disp));

        // Process provider trends
        if (reports.length >= 2) {
          await processProviderTrends(reports);
        }

        // Process top source IPs from latest reports
        await processTopSourceIPs(reports.slice(-5)); // Use last 5 reports

      } catch (error) {
        console.error("Error fetching trend data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendData();
  }, [user, selectedDomain]);

  const processProviderTrends = async (reports: Array<{ id: string; date_range_begin: number }>) => {
    const providerTrendMap = new Map<string, Array<{ date: string; successRate: number; emailCount: number }>>();

    for (const report of reports) {
      const { data: records } = await supabase
        .from("dmarc_records")
        .select("count, dkim_result, spf_result, source_ip")
        .eq("report_id", report.id);

      if (!records || records.length === 0) continue;

      // Get unique IPs and their providers
      const uniqueIPs = [...new Set(records.map(r => String(r.source_ip)))];
      const providerMap = await detectIPProviders(uniqueIPs);

      // Group by provider
      const providerGroups = records.reduce((acc: Record<string, { total: number; passed: number }>, record) => {
        const provider = providerMap.get(String(record.source_ip)) || "Unknown Provider";
        if (!acc[provider]) {
          acc[provider] = { total: 0, passed: 0 };
        }
        acc[provider].total += record.count;
        if (record.dkim_result === "pass" && record.spf_result === "pass") {
          acc[provider].passed += record.count;
        }
        return acc;
      }, {});

      // Add to trend data
      const reportDate = new Date(report.date_range_begin * 1000).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      Object.entries(providerGroups).forEach(([provider, data]: [string, { total: number; passed: number }]) => {
        if (!providerTrendMap.has(provider)) {
          providerTrendMap.set(provider, []);
        }
        
        const successRate = data.total > 0 ? Math.round((data.passed / data.total) * 100 * 10) / 10 : 0;
        providerTrendMap.get(provider)!.push({
          date: reportDate,
          successRate,
          emailCount: data.total
        });
      });
    }

    // Convert to array and keep top 5 providers by total volume
    const providerTrends = Array.from(providerTrendMap.entries())
      .map(([provider, data]) => ({
        provider,
        data,
        totalVolume: data.reduce((sum, d) => sum + d.emailCount, 0)
      }))
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 5)
      .map(({ provider, data }) => ({ provider, data }));

    setProviderTrends(providerTrends);
  };

  const processTopSourceIPs = async (reports: Array<{ id: string }>) => {
    const ipAggregates = new Map<string, { total: number; passed: number }>();

    for (const report of reports) {
      const { data: records } = await supabase
        .from("dmarc_records")
        .select("count, dkim_result, spf_result, source_ip")
        .eq("report_id", report.id);

      if (!records) continue;

      records.forEach(record => {
        const ip = String(record.source_ip);
        if (!ipAggregates.has(ip)) {
          ipAggregates.set(ip, { total: 0, passed: 0 });
        }
        
        const aggregate = ipAggregates.get(ip)!;
        aggregate.total += record.count;
        if (record.dkim_result === "pass" && record.spf_result === "pass") {
          aggregate.passed += record.count;
        }
      });
    }

    // Get providers for top IPs
    const topIPs = Array.from(ipAggregates.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 6)
      .map(([ip]) => ip);

    const providerMap = await detectIPProviders(topIPs);

    const topSourceIPsData = Array.from(ipAggregates.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 6)
      .map(([ip, data]) => ({
        ip,
        provider: providerMap.get(ip) || "Unknown Provider",
        count: data.total,
        rate: data.total > 0 ? Math.round((data.passed / data.total) * 100 * 10) / 10 : 0
      }));

    setTopSourceIPs(topSourceIPsData);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center justify-center h-64">
              <Loader className="w-8 h-8 animate-spin" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (reportCount < 2) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Upload more reports to see trends</p>
                <p className="text-sm mt-2">Need at least 2 reports for trend analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Source IPs</CardTitle>
          </CardHeader>
          <CardContent>
            {topSourceIPs.length > 0 ? (
              <div className="space-y-3">
                {topSourceIPs.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">{item.ip}</div>
                      <div className="text-sm text-gray-600">{item.provider}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{item.count.toLocaleString()}</div>
                      <Badge variant={item.rate > 95 ? "default" : "secondary"}>
                        {item.rate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Globe className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>No source IP data available</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number; dataKey: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry: { color: string; name: string; value: number; dataKey: string }, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value}${entry.dataKey === 'successRate' ? '%' : ''}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="success-trends">Success Trends</TabsTrigger>
          <TabsTrigger value="provider-trends">Provider Trends</TabsTrigger>
          <TabsTrigger value="source-analysis">Source Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="success-trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Success Rate Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="successRate" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      name="Success Rate (%)"
                      dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email Volume Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="totalEmails" fill="#3b82f6" name="Total Emails" />
                    <Bar dataKey="failedEmails" fill="#ef4444" name="Failed Emails" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>DMARC Disposition Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dispositionTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="none" stackId="a" fill="#10b981" name="p=none (delivered)" />
                  <Bar dataKey="quarantine" stackId="a" fill="#f59e0b" name="p=quarantine" />
                  <Bar dataKey="reject" stackId="a" fill="#ef4444" name="p=reject" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="provider-trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Provider Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {providerTrends.map((trend, index) => (
                    <Line
                      key={trend.provider}
                      type="monotone"
                      dataKey="successRate"
                      data={trend.data}
                      stroke={`hsl(${index * 360 / providerTrends.length}, 70%, 50%)`}
                      strokeWidth={2}
                      name={trend.provider}
                      dot={{ strokeWidth: 2, r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="source-analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Source IPs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topSourceIPs.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">{item.ip}</div>
                      <div className="text-sm text-gray-600">{item.provider}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{item.count.toLocaleString()}</div>
                      <Badge variant={item.rate > 95 ? "default" : item.rate > 90 ? "secondary" : "destructive"}>
                        {item.rate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TrendAnalytics;