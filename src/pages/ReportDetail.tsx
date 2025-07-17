
import { useState } from "react";
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
  Download
} from "lucide-react";
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

  // Mock detailed report data
  const reportData = {
    id: id,
    domain: "example.com",
    orgName: "Google Inc.",
    orgEmail: "noreply-dmarc-support@google.com",
    reportId: "15240930515327665966",
    dateRange: {
      begin: "2024-01-14 00:00:00",
      end: "2024-01-15 00:00:00"
    },
    policy: {
      domain: "example.com",
      dkim: "r", // relaxed
      spf: "r",  // relaxed
      p: "quarantine", // policy
      sp: "quarantine", // subdomain policy
      pct: 100
    },
    summary: {
      totalEmails: 12430,
      passedEmails: 12039,
      failedEmails: 391,
      successRate: 96.8,
      uniqueIPs: 23,
      topFailureReason: "SPF alignment failure"
    }
  };

  const authResultsData = [
    { name: "DKIM Pass", value: 11890, color: "#10b981" },
    { name: "SPF Pass", value: 12103, color: "#3b82f6" },
    { name: "DKIM Fail", value: 540, color: "#ef4444" },
    { name: "SPF Fail", value: 327, color: "#f59e0b" }
  ];

  const sourceIPData = [
    { ip: "209.85.220.41", provider: "Google", count: 8432, pass: 8401, fail: 31, rate: 99.6 },
    { ip: "40.107.231.46", provider: "Microsoft", count: 2156, pass: 2089, fail: 67, rate: 96.9 },
    { ip: "52.95.48.83", provider: "Amazon SES", count: 1842, pass: 1549, fail: 293, rate: 84.1 }
  ];

  const dispositionData = [
    { name: "None", value: 12039, color: "#10b981" },
    { name: "Quarantine", value: 312, color: "#f59e0b" },
    { name: "Reject", value: 79, color: "#ef4444" }
  ];

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
            <h1 className="text-3xl font-bold text-gray-900">{reportData.domain}</h1>
            <p className="text-gray-600 mt-1">
              DMARC Report from {reportData.orgName}
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
                      data={authResultsData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {authResultsData.map((entry, index) => (
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
                      data={dispositionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {dispositionData.map((entry, index) => (
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
                      <span className="font-mono text-xs">{reportData.reportId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Domain:</span>
                      <span className="font-medium">{reportData.domain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Organization:</span>
                      <span>{reportData.orgName}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Date Range</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start:</span>
                      <span>{reportData.dateRange.begin}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">End:</span>
                      <span>{reportData.dateRange.end}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Duration:</span>
                      <span>24 hours</span>
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
                {sourceIPData.map((source, idx) => (
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
                      <Badge variant="secondary">{reportData.policy.p}</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">Subdomain Policy (sp):</span>
                      <Badge variant="secondary">{reportData.policy.sp}</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">Percentage (pct):</span>
                      <Badge variant="default">{reportData.policy.pct}%</Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-4">Alignment Modes</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">DKIM Alignment:</span>
                      <Badge variant="outline">
                        {reportData.policy.dkim === 'r' ? 'Relaxed' : 'Strict'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">SPF Alignment:</span>
                      <Badge variant="outline">
                        {reportData.policy.spf === 'r' ? 'Relaxed' : 'Strict'}
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
                      Your current policy is set to "quarantine" which is good for monitoring. 
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
                <pre className="text-sm">
{`<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>${reportData.orgName}</org_name>
    <email>${reportData.orgEmail}</email>
    <report_id>${reportData.reportId}</report_id>
    <date_range>
      <begin>1642118400</begin>
      <end>1642204800</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>${reportData.domain}</domain>
    <adkim>${reportData.policy.dkim}</adkim>
    <aspf>${reportData.policy.spf}</aspf>
    <p>${reportData.policy.p}</p>
    <sp>${reportData.policy.sp}</sp>
    <pct>${reportData.policy.pct}</pct>
  </policy_published>
  <!-- Individual records would be shown here -->
</feedback>`}
                </pre>
              </div>
              <p className="text-sm text-gray-600 mt-4">
                This is a simplified view of the XML structure. The full report contains detailed 
                records for each source IP and authentication result.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportDetail;
