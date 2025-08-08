import { useState, useEffect } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Loader,
  HelpCircle
} from "lucide-react";
import { useDmarcData } from "@/hooks/useDmarcData";
import { detectIPProviders } from "@/utils/ipProviderDetection";
import { exportReportAsXML, exportReportAsCSV, exportReportAsPDF } from "@/utils/exportService";
import { migrateEnvelopeToData } from "@/utils/migrateEnvelopeTo";
import ExportModal from "@/components/ExportModal";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
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
  const location = useLocation();
  const navigate = useNavigate();
  const { fetchReportById } = useDmarcData();
  const { user } = useAuth();
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Check if user came from manage reports page
  const cameFromManageReports = location.state?.from === 'manage-reports' || 
                               document.referrer.includes('/manage-reports');

  const getBackPath = () => cameFromManageReports ? '/manage-reports' : '/dashboard';
  const getBackLabel = () => cameFromManageReports ? 'Back to Manage Reports' : 'Back to Dashboard';

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

          // Get unique IPs for provider detection
          const uniqueIPs = Object.keys(ipGroups);
          const providerMap = await detectIPProviders(uniqueIPs);

          const sourceIPData = Object.entries(ipGroups).map(([ip, data]: [string, any]) => ({
            ip,
            provider: providerMap.get(ip) || "Unknown Provider",
            count: data.count,
            pass: data.pass,
            fail: data.fail,
            rate: data.count > 0 ? Math.round((data.pass / data.count) * 100 * 10) / 10 : 0
          }));

          // Auth results for bar chart - separate SPF and DKIM results
          const dkimPass = records.filter((r: any) => r.dkim_result === "pass").reduce((sum: number, r: any) => sum + r.count, 0);
          const dkimFail = records.filter((r: any) => r.dkim_result !== "pass").reduce((sum: number, r: any) => sum + r.count, 0);
          const spfPass = records.filter((r: any) => r.spf_result === "pass").reduce((sum: number, r: any) => sum + r.count, 0);
          const spfFail = records.filter((r: any) => r.spf_result !== "pass").reduce((sum: number, r: any) => sum + r.count, 0);

          // Data for bar chart showing pass/fail for each authentication method
          const authResultsData = [
            {
              name: "DKIM",
              pass: dkimPass,
              fail: dkimFail,
              passRate: totalEmails > 0 ? Math.round((dkimPass / totalEmails) * 100 * 10) / 10 : 0
            },
            {
              name: "SPF",
              pass: spfPass,
              fail: spfFail,
              passRate: totalEmails > 0 ? Math.round((spfPass / totalEmails) * 100 * 10) / 10 : 0
            }
          ];

          // Disposition data
          const dispositionGroups = records.reduce((acc: any, record: any) => {
            const disp = record.disposition || "none";
            if (!acc[disp]) acc[disp] = 0;
            acc[disp] += record.count;
            return acc;
          }, {});

          const dispositionData = Object.entries(dispositionGroups)
            .map(([name, value]: [string, any]) => ({
              name: name === "none" ? "Policy: p=none" : 
                    name === "quarantine" ? "Policy: p=quarantine" : 
                    name === "reject" ? "Policy: p=reject" : 
                    name.charAt(0).toUpperCase() + name.slice(1),
              value,
              color: name === "none" ? "#10b981" : name === "quarantine" ? "#f59e0b" : "#ef4444"
            }))
            .filter(item => item.value > 0);

          // Calculate actual top failure reason
          const calculateTopFailureReason = () => {
            if (totalEmails - passedEmails === 0) {
              return "No issues detected";
            }

            const failureTypes = {
              "DKIM authentication failure": 0,
              "SPF authentication failure": 0,
              "Both DKIM and SPF failure": 0
            };

            records.forEach((record: any) => {
              if (record.dkim_result !== "pass" || record.spf_result !== "pass") {
                const dkimFailed = record.dkim_result !== "pass";
                const spfFailed = record.spf_result !== "pass";
                
                if (dkimFailed && spfFailed) {
                  failureTypes["Both DKIM and SPF failure"] += record.count;
                } else if (dkimFailed) {
                  failureTypes["DKIM authentication failure"] += record.count;
                } else if (spfFailed) {
                  failureTypes["SPF authentication failure"] += record.count;
                }
              }
            });

            // Find the most common failure type
            const topFailure = Object.entries(failureTypes)
              .filter(([_, count]) => count > 0)
              .sort(([_, a], [__, b]) => b - a)[0];

            return topFailure ? topFailure[0] : "Authentication failure";
          };

          setReportData({
            report: { ...report, records }, // Include records in the report object
            summary: {
              totalEmails,
              passedEmails,
              failedEmails: totalEmails - passedEmails,
              successRate,
              uniqueIPs: sourceIPData.length,
              topFailureReason: calculateTopFailureReason()
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

  const handleExport = async (format: 'csv' | 'pdf' | 'xml') => {
    if (!id || !user?.id) {
      toast.error('Unable to export: missing report or user information');
      return;
    }

    try {
      switch (format) {
        case 'xml':
          await exportReportAsXML(id, user.id);
          toast.success('XML report downloaded successfully');
          break;
        case 'csv':
          await exportReportAsCSV(id, user.id);
          toast.success('CSV report downloaded successfully');
          break;
        case 'pdf':
          await exportReportAsPDF(id, user.id);
          toast.success('PDF report generated successfully');
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Export failed');
    }
  };

  const handleExtractRecipientDomains = async () => {
    if (!user?.id || !id) {
      toast.error('Unable to extract: missing report or user information');
      return;
    }
    setExtracting(true);
    try {
      const res = await migrateEnvelopeToData(user.id);
      toast.success(res.message);
      const refreshed = await fetchReportById(id);
      if (refreshed?.records) {
        setReportData((prev: any) => prev ? { ...prev, report: { ...prev.report, records: refreshed.records } } : prev);
      }
    } catch (e) {
      console.error('EnvelopeTo extraction failed:', e);
      toast.error(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

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
        <Link to={getBackPath()}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {getBackLabel()}
          </Button>
        </Link>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  type RecipientStat = {
    domain: string;
    total: number;
    inbox: number;
    spam: number;
    blocked: number;
    deliveredRate: number;
    blockedRate: number;
    spamRate: number;
  };

  const computeRecipientStats = (records: any[]): RecipientStat[] => {
    const map: Record<string, { total: number; inbox: number; spam: number; blocked: number }> = {};

    const getDomain = (value: string): string | null => {
      const v = String(value).trim().toLowerCase();
      if (!v) return null;
      if (v.includes("@")) {
        const parts = v.split("@");
        const d = parts[parts.length - 1];
        return d || null;
      }
      // If it doesn't include @ but looks like a domain, accept it
      if (v.includes(".")) return v;
      return null;
    };

    records.forEach((rec: any) => {
      if (!rec?.envelope_to) return;
      const addresses = String(rec.envelope_to)
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      addresses.forEach((addr) => {
        const domain = getDomain(addr);
        if (!domain) return;
        if (!map[domain]) {
          map[domain] = { total: 0, inbox: 0, spam: 0, blocked: 0 };
        }
        map[domain].total += rec.count || 0;
        const disp = rec.disposition || "none";
        if (disp === "reject") map[domain].blocked += rec.count || 0;
        else if (disp === "quarantine") map[domain].spam += rec.count || 0;
        else map[domain].inbox += rec.count || 0; // treat none as delivered
      });
    });

    const stats: RecipientStat[] = Object.entries(map).map(([domain, vals]) => {
      const deliveredRate = vals.total > 0 ? (vals.inbox / vals.total) * 100 : 0;
      const blockedRate = vals.total > 0 ? (vals.blocked / vals.total) * 100 : 0;
      const spamRate = vals.total > 0 ? (vals.spam / vals.total) * 100 : 0;
      const round1 = (n: number) => Math.round(n * 10) / 10;
      return {
        domain,
        total: vals.total,
        inbox: vals.inbox,
        spam: vals.spam,
        blocked: vals.blocked,
        deliveredRate: round1(deliveredRate),
        blockedRate: round1(blockedRate),
        spamRate: round1(spamRate),
      };
    });

    return stats.sort((a, b) => b.total - a.total);
  };

  const emailRecords = reportData.report?.records || [];
  const recipientStats = computeRecipientStats(emailRecords);
  const hasEnvelopeData = recipientStats.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Compact Header with Title */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link to={getBackPath()}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  {getBackLabel()}
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">DMARC Report Analysis</h1>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                  <span className="font-medium">{reportData.report.domain}</span>
                  <span>•</span>
                  <span>{reportData.report.org_name}</span>
                  <span>•</span>
                  <span className="flex items-center">
                    <Calendar className="w-3 h-3 mr-1" />
                    {formatTime(reportData.report.date_range_begin)} - {formatTime(reportData.report.date_range_end)}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowExportModal(true)} size="sm">
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

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
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Email Details</TabsTrigger>
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
                  <BarChart
                    data={reportData.authResultsData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [
                        value.toLocaleString(), 
                        name === 'pass' ? 'Pass' : 'Fail'
                      ]}
                    />
                    <Bar dataKey="pass" fill="#10b981" name="pass" />
                    <Bar dataKey="fail" fill="#ef4444" name="fail" />
                  </BarChart>
                </ResponsiveContainer>
                {/* Summary statistics */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {reportData.authResultsData.map((entry: any, index: number) => (
                    <div key={index} className="text-center p-3 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-900">{entry.name}</h4>
                      <p className="text-lg font-bold text-green-600">{entry.passRate}%</p>
                      <p className="text-xs text-gray-600">
                        {entry.pass.toLocaleString()} pass, {entry.fail.toLocaleString()} fail
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Disposition Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Email Disposition</span>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <HelpCircle className="h-4 w-4 text-gray-500" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-md">
                        <div className="space-y-3">
                          <div className="font-semibold">DMARC Disposition Actions</div>
                          <div className="space-y-2 text-sm">
                            <div>
                              <strong>Policy: p=none</strong> - Email delivered normally to inbox. No action taken even if authentication failed. Used for monitoring.
                            </div>
                            <div>
                              <strong>Policy: p=quarantine</strong> - Email sent to spam/junk folder. Server treated it as suspicious due to failed authentication.
                            </div>
                            <div>
                              <strong>Policy: p=reject</strong> - Email completely blocked/bounced. Never reached recipient's mailbox due to failed authentication.
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 pt-2 border-t">
                            This shows how receiving servers handled your emails based on DMARC policy and authentication results.
                          </div>
                        </div>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportData.dispositionData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => {
                        // Only show label if slice is large enough (>5%)
                        return percent > 0.05 ? `${name} ${(percent * 100).toFixed(1)}%` : '';
                      }}
                      outerRadius={100}
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
                {/* Legend for better readability */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {reportData.dispositionData.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: entry.color }}
                      ></div>
                      <span className="text-sm text-gray-600">
                        {entry.name}: {entry.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
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
                      <span className={`text-xs ${reportData.summary.topFailureReason === "No issues detected" ? "text-green-600" : "text-red-600"}`}>
                        {reportData.summary.topFailureReason}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recipient Domains (this report)</span>
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <HelpCircle className="h-4 w-4 text-gray-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-md">
                      <div className="space-y-2 text-sm">
                        <div className="font-semibold">How we determine delivery</div>
                        <div>
                          Delivered = disposition "none" (inbox), Spam = "quarantine", Blocked = "reject".
                          Recipient domains require the optional envelope_to field in DMARC reports.
                        </div>
                      </div>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasEnvelopeData ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-gray-600">
                        <tr>
                          <th className="py-2 pr-2">Domain</th>
                          <th className="py-2 pr-2 text-right">Total</th>
                          <th className="py-2 pr-2 text-right">Delivered %</th>
                          <th className="py-2 pr-2 text-right">Spam %</th>
                          <th className="py-2 pr-2 text-right">Blocked %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipientStats.slice(0, 10).map((d: any) => (
                          <tr key={d.domain} className="border-t">
                            <td className="py-2 pr-2 font-medium">{d.domain}</td>
                            <td className="py-2 pr-2 text-right">{d.total.toLocaleString()}</td>
                            <td className="py-2 pr-2 text-right text-green-600">{d.deliveredRate}%</td>
                            <td className="py-2 pr-2 text-right text-amber-600">{d.spamRate}%</td>
                            <td className="py-2 pr-2 text-right text-red-600">{d.blockedRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {recipientStats.length > 10 && (
                    <p className="text-xs text-gray-500 mt-2">Showing top 10 of {recipientStats.length} recipient domains.</p>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-md bg-blue-50 border border-blue-200">
                  <div>
                    <p className="text-sm text-blue-900 font-medium">Recipient domains unavailable</p>
                    <p className="text-xs text-blue-800">This report likely lacks envelope_to. You can try extracting it from stored raw XML.</p>
                  </div>
                  <Button onClick={handleExtractRecipientDomains} disabled={extracting}>
                    {extracting ? 'Extracting...' : 'Try to extract recipient domains'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Individual Email Records</CardTitle>
              <p className="text-sm text-gray-600">
                Detailed authentication information for each email record in this report
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reportData.report && (() => {
                  // We need to fetch the records data from the report
                  const { records } = reportData.report;
                  
                  if (!records || records.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No individual email records available for display</p>
                        <p className="text-sm mt-1">This may occur with aggregated reports</p>
                      </div>
                    );
                  }

                  return records.map((record: any, idx: number) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-sm">
                        {/* Source IP */}
                        <div className="lg:col-span-2">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Source IP</div>
                          <div className="font-mono text-sm">{record.source_ip}</div>
                        </div>
                        
                        {/* Email Count */}
                        <div className="lg:col-span-1">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Count</div>
                          <div className="font-semibold">{record.count.toLocaleString()}</div>
                        </div>
                        
                        {/* Authentication Status */}
                        <div className="lg:col-span-2">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Auth Status</div>
                          <div className="flex space-x-1">
                            <Badge 
                              variant={record.dkim_result === 'pass' ? 'default' : 'destructive'} 
                              className="text-xs px-1 py-0"
                            >
                              DKIM: {record.dkim_result}
                            </Badge>
                            <Badge 
                              variant={record.spf_result === 'pass' ? 'default' : 'destructive'} 
                              className="text-xs px-1 py-0"
                            >
                              SPF: {record.spf_result}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Header From */}
                        <div className="lg:col-span-3">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Header From</div>
                          <div className="font-medium text-blue-700 truncate" title={record.header_from}>
                            {record.header_from}
                          </div>
                        </div>
                        
                        {/* Envelope To */}
                        <div className="lg:col-span-2">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Envelope To</div>
                          <div className="text-gray-700 truncate" title={record.envelope_to || 'N/A'}>
                            {record.envelope_to || 'N/A'}
                          </div>
                        </div>
                        
                        {/* Disposition */}
                        <div className="lg:col-span-2">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Disposition</div>
                          <Badge 
                            variant={
                              record.disposition === 'none' ? 'secondary' :
                              record.disposition === 'quarantine' ? 'outline' : 'destructive'
                            }
                            className="text-xs"
                          >
                            {record.disposition}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Success/Failure Indicator */}
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {record.dkim_result === 'pass' && record.spf_result === 'pass' ? (
                              <>
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-green-700 text-sm font-medium">
                                  {record.count.toLocaleString()} emails fully authenticated
                                </span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4 text-red-600" />
                                <span className="text-red-700 text-sm font-medium">
                                  {record.count.toLocaleString()} emails failed authentication
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            Record #{idx + 1} of {records.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
              
              {/* Summary Stats for Email Details */}
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-900">
                      {reportData.report?.records?.length || 0}
                    </div>
                    <div className="text-sm text-blue-700">Email Records</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {reportData.summary.passedEmails.toLocaleString()}
                    </div>
                    <div className="text-sm text-green-700">Passed Authentication</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {reportData.summary.failedEmails.toLocaleString()}
                    </div>
                    <div className="text-sm text-red-700">Failed Authentication</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        isIndividualReport={true}
      />
    </div>
  );
};

export default ReportDetail;