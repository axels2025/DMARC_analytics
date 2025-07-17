import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Calendar, 
  Mail, 
  Shield, 
  Globe, 
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Loader
} from "lucide-react";
import { useDmarcData } from "@/hooks/useDmarcData";
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
  Tooltip
} from "recharts";

const ReportDetail = () => {
  const { id } = useParams();
  const { fetchReportById } = useDmarcData();
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReport = async () => {
      if (!id) return;
      
      setLoading(true);
      try {
        const data = await fetchReportById(id);
        if (data) {
          const { report, records, authResults } = data;
          
          // Process the data for display
          const totalEmails = records.reduce((sum: number, r: any) => sum + r.count, 0);
          const passedEmails = records
            .filter((r: any) => r.dkim_result === "pass" && r.spf_result === "pass")
            .reduce((sum: number, r: any) => sum + r.count, 0);
          
          const successRate = totalEmails > 0 ? Math.round((passedEmails / totalEmails) * 100 * 10) / 10 : 0;
          
          // Group by source IP
          const ipGroups = records.reduce((acc: any, record: any) => {
            const ip = String(record.source_ip);
            if (!acc[ip]) {
              acc[ip] = { count: 0, pass: 0, fail: 0 };
            }
            acc[ip].count += record.count;
            if (record.dkim_result === "pass" && record.spf_result === "pass") {
              acc[ip].pass += record.count;
            } else {
              acc[ip].fail += record.count;
            }
            return acc;
          }, {});

          const sourceIPData = Object.entries(ipGroups).map(([ip, data]: [string, any]) => ({
            ip,
            provider: "Unknown Provider", // Could be enhanced with IP-to-provider mapping
            count: data.count,
            pass: data.pass,
            fail: data.fail,
            rate: data.count > 0 ? Math.round((data.pass / data.count) * 100 * 10) / 10 : 0
          }));

          // Auth results for charts
          const dkimPass = records.filter((r: any) => r.dkim_result === "pass").reduce((sum: number, r: any) => sum + r.count, 0);
          const dkimFail = records.filter((r: any) => r.dkim_result !== "pass").reduce((sum: number, r: any) => sum + r.count, 0);
          const spfPass = records.filter((r: any) => r.spf_result === "pass").reduce((sum: number, r: any) => sum + r.count, 0);
          const spfFail = records.filter((r: any) => r.spf_result !== "pass").reduce((sum: number, r: any) => sum + r.count, 0);

          const authResultsData = [
            { name: "DKIM Pass", value: dkimPass, color: "#10b981" },
            { name: "SPF Pass", value: spfPass, color: "#3b82f6" },
            { name: "DKIM Fail", value: dkimFail, color: "#ef4444" },
            { name: "SPF Fail", value: spfFail, color: "#f59e0b" }
          ];

          // Disposition data
          const dispositionGroups = records.reduce((acc: any, record: any) => {
            const disp = record.disposition || "none";
            if (!acc[disp]) acc[disp] = 0;
            acc[disp] += record.count;
            return acc;
          }, {});

          const dispositionData = Object.entries(dispositionGroups).map(([name, value]: [string, any]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value,
            color: name === "none" ? "#10b981" : name === "quarantine" ? "#f59e0b" : "#ef4444"
          }));

          setReportData({
            report,
            summary: {
              totalEmails,
              passedEmails,
              failedEmails: totalEmails - passedEmails,
              successRate,
              uniqueIPs: sourceIPData.length,
              topFailureReason: "Authentication failure"
            },
            sourceIPData,
            authResultsData,
            dispositionData
          });
        } else {
          setError("Report not found");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [id, fetchReportById]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading report details...</p>
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="text-center text-red-600 p-6">
        <p>Error: {error || "Report not found"}</p>
        <Link to="/">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{reportData.report.domain}</h1>
            <p className="text-gray-600 mt-1">
              DMARC Report from {reportData.report.org_name}
            </p>
          </div>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Emails</p>
                <p className="text-2xl font-bold text-gray-900">
                  {reportData.summary.totalEmails.toLocaleString()}
                </p>
              </div>
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {reportData.summary.successRate}%
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Failed Emails</p>
                <p className="text-2xl font-bold text-red-600">
                  {reportData.summary.failedEmails.toLocaleString()}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Source IPs</p>
                <p className="text-2xl font-bold text-gray-900">
                  {reportData.summary.uniqueIPs}
                </p>
              </div>
              <Globe className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Details Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-96">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sources">Source IPs</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="raw">Raw Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Authentication Results */}
            <Card>
              <CardHeader>
                <CardTitle>Authentication Results</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportData.authResultsData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {reportData.authResultsData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [value.toLocaleString(), "Emails"]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Disposition Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Email Disposition</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportData.dispositionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {reportData.dispositionData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [value.toLocaleString(), "Emails"]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Report Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Report Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Report Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Report ID:</span>
                      <span className="font-mono text-xs">{reportData.report.report_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Domain:</span>
                      <span className="font-medium">{reportData.report.domain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Organization:</span>
                      <span>{reportData.report.org_name}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Date Range</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start:</span>
                      <span>{new Date(reportData.report.date_range_begin * 1000).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">End:</span>
                      <span>{new Date(reportData.report.date_range_end * 1000).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Duration:</span>
                      <span>
                        {Math.round((reportData.report.date_range_end - reportData.report.date_range_begin) / 3600)} hours
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Key Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Success Rate:</span>
                      <Badge variant="default">{reportData.summary.successRate}%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Top Issue:</span>
                      <span className="text-red-600 text-xs">{reportData.summary.topFailureReason}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Source IP Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.sourceIPData.map((source: any, idx: number) => (
                  <div key={idx} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{source.ip}</h3>
                        <p className="text-sm text-gray-600">{source.provider}</p>
                      </div>
                      <Badge variant={source.rate > 95 ? "default" : source.rate > 90 ? "secondary" : "destructive"}>
                        {source.rate}% success
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Total: </span>
                        <span className="font-medium">{source.count.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Pass: </span>
                        <span className="font-medium text-green-600">{source.pass.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Fail: </span>
                        <span className="font-medium text-red-600">{source.fail.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy">
          <Card>
            <CardHeader>
              <CardTitle>DMARC Policy Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-4">Current Policy</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">Domain Policy (p):</span>
                      <Badge variant="secondary">{reportData.report.policy_p}</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">Subdomain Policy (sp):</span>
                      <Badge variant="secondary">{reportData.report.policy_sp || "Same as p"}</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">Percentage (pct):</span>
                      <Badge variant="default">{reportData.report.policy_pct}%</Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-4">Alignment Modes</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">DKIM Alignment:</span>
                      <Badge variant="outline">
                        {reportData.report.policy_dkim === 'r' ? 'Relaxed' : 'Strict'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">SPF Alignment:</span>
                      <Badge variant="outline">
                        {reportData.report.policy_spf === 'r' ? 'Relaxed' : 'Strict'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900">Policy Recommendations</h4>
                    <p className="text-sm text-blue-800 mt-1">
                      Your current policy is set to "{reportData.report.policy_p}" which is good for monitoring. 
                      Consider moving to "reject" once you achieve consistent 98%+ authentication rates.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardHeader>
              <CardTitle>Raw Report Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm whitespace-pre-wrap">
                  {reportData.report.raw_xml || "Raw XML data not available"}
                </pre>
              </div>
              {!reportData.report.raw_xml && (
                <p className="text-sm text-gray-600 mt-4">
                  Raw XML data was not stored for this report.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportDetail;