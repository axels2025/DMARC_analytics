
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  LineChart, 
  Line,
  Legend
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDmarcData } from "@/hooks/useDmarcData";
import { Loader } from "lucide-react";
import { detectIPProviders } from "@/utils/ipProviderDetection";

interface OverviewChartsProps {
  selectedDomain?: string;
}

const OverviewCharts = ({ selectedDomain }: OverviewChartsProps) => {
  const { user } = useAuth();
  const { metrics } = useDmarcData(selectedDomain);
  const [authStatusData, setAuthStatusData] = useState<any[]>([]);
  const [providerData, setProviderData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChartData = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        // Fetch authentication status data - use client-side filtering approach
        // First get all reports for the user to filter by include_in_dashboard
        let reportsQuery = supabase
          .from("dmarc_reports")
          .select("*")
          .eq("user_id", user.id);

        if (selectedDomain) {
          reportsQuery = reportsQuery.eq("domain", selectedDomain);
        }

        const { data: allReports } = await reportsQuery;

        // Filter reports based on include_in_dashboard (client-side filtering)
        const includedReports = allReports?.filter(report => 
          report.include_in_dashboard === null || report.include_in_dashboard === true
        ) || [];

        // Get records from included reports only
        const includedReportIds = includedReports.map(r => r.id);
        
        let records: any[] = [];
        if (includedReportIds.length > 0) {
          const { data: recordsData } = await supabase
            .from("dmarc_records")
            .select(`
              count,
              dkim_result,
              spf_result,
              source_ip,
              disposition,
              report_id
            `)
            .in("report_id", includedReportIds);
          
          records = recordsData || [];
        }

        if (records && records.length > 0) {
          // Calculate authentication status
          const passCount = records
            .filter(r => r.dkim_result === "pass" && r.spf_result === "pass")
            .reduce((sum, r) => sum + r.count, 0);
          
          const failCount = records
            .filter(r => r.dkim_result !== "pass" || r.spf_result !== "pass")
            .reduce((sum, r) => sum + r.count, 0);

          setAuthStatusData([
            { name: "Pass", value: passCount, color: "#10b981" },
            { name: "Fail", value: failCount, color: "#ef4444" }
          ]);

          // Group by provider instead of IP
          const uniqueIPs = [...new Set(records.map(r => String(r.source_ip)))];
          const providerMap = await detectIPProviders(uniqueIPs);

          const providerGroups = records.reduce((acc: any, record) => {
            const ip = String(record.source_ip);
            const provider = providerMap.get(ip) || "Unknown Provider";
            
            if (!acc[provider]) {
              acc[provider] = { emails: 0, pass: 0 };
            }
            acc[provider].emails += record.count;
            if (record.dkim_result === "pass" && record.spf_result === "pass") {
              acc[provider].pass += record.count;
            }
            return acc;
          }, {});

          const topProviders = Object.entries(providerGroups)
            .map(([provider, data]: [string, any]) => ({
              provider,
              emails: data.emails,
              successRate: data.emails > 0 ? Math.round((data.pass / data.emails) * 100 * 10) / 10 : 0
            }))
            .sort((a, b) => b.emails - a.emails)
            .slice(0, 6); // Show top 6 providers instead of 4

          setProviderData(topProviders);
        }

        // Fetch trend data from included reports only
        const trendReports = includedReports
          .sort((a, b) => a.date_range_begin - b.date_range_begin)
          .slice(0, 10);

        if (trendReports && trendReports.length > 0) {
          const trendDataPromises = trendReports.map(async (report) => {
            const { data: reportRecords } = await supabase
              .from("dmarc_records")
              .select("count, dkim_result, spf_result")
              .eq("report_id", report.id);

            const total = reportRecords?.reduce((sum, r) => sum + r.count, 0) || 0;
            const pass = reportRecords?.filter(r => r.dkim_result === "pass" && r.spf_result === "pass")
              .reduce((sum, r) => sum + r.count, 0) || 0;
            
            const successRate = total > 0 ? Math.round((pass / total) * 100 * 10) / 10 : 0;
            const date = new Date(report.date_range_begin * 1000).toLocaleDateString("en-US", { 
              month: "short", 
              day: "numeric" 
            });

            return { date, success: successRate, total };
          });

          const resolvedTrendData = await Promise.all(trendDataPromises);
          setTrendData(resolvedTrendData);
        }
      } catch (error) {
        console.error("Error fetching chart data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [user, metrics?.lastUpdated]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className={i === 3 ? "lg:col-span-2" : ""}>
            <CardContent className="flex items-center justify-center h-64">
              <Loader className="w-8 h-8 animate-spin" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{`${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${entry.value}${entry.dataKey === 'success' ? '%' : ''}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Authentication Status Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={authStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {authStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value.toLocaleString(), "Emails"]} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Provider Performance Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Email Volume by Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={providerData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="provider" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
              />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'emails' ? value.toLocaleString() : `${value}%`,
                  name === 'emails' ? 'Emails' : 'Success Rate'
                ]}
              />
              <Bar dataKey="emails" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Success Rate Trend */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Authentication Success Rate Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" domain={[90, 100]} />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="success" 
                stroke="#10b981" 
                strokeWidth={3}
                name="Success Rate (%)"
                dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
              />
              <Bar 
                yAxisId="right"
                dataKey="total" 
                fill="#e5e7eb" 
                opacity={0.6}
                name="Total Emails"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewCharts;
