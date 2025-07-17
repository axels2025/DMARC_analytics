
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, 
  Mail, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Globe,
  Upload as UploadIcon,
  Eye
} from "lucide-react";
import { Link } from "react-router-dom";
import OverviewCharts from "@/components/charts/OverviewCharts";
import RecentReports from "@/components/RecentReports";
import MetricCard from "@/components/MetricCard";

const Dashboard = () => {
  // Mock data - in real app this would come from Supabase
  const mockMetrics = {
    totalReports: 12,
    totalEmails: 147832,
    successRate: 94.2,
    uniqueIPs: 89,
    activeDomains: 3,
    lastUpdated: "2024-01-15 14:30"
  };

  const mockRecentReports = [
    {
      id: "1",
      domain: "example.com",
      orgName: "Example Corp",
      dateRange: "2024-01-14 to 2024-01-15",
      emailCount: 12430,
      successRate: 96.8,
      status: "processed"
    },
    {
      id: "2", 
      domain: "shop.example.com",
      orgName: "Google Inc.",
      dateRange: "2024-01-13 to 2024-01-14", 
      emailCount: 8921,
      successRate: 91.2,
      status: "processed"
    },
    {
      id: "3",
      domain: "api.example.com", 
      orgName: "Microsoft Corporation",
      dateRange: "2024-01-12 to 2024-01-13",
      emailCount: 5643,
      successRate: 98.1,
      status: "processed"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">DMARC Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitor your email authentication and security posture
          </p>
        </div>
        <Link to="/upload">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <UploadIcon className="w-4 h-4 mr-2" />
            Upload Report
          </Button>
        </Link>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Reports"
          value={mockMetrics.totalReports.toLocaleString()}
          icon={Shield}
          color="blue"
          trend="+2 this week"
        />
        <MetricCard
          title="Emails Analyzed"
          value={mockMetrics.totalEmails.toLocaleString()}
          icon={Mail}
          color="green"
          trend="+12% from last month"
        />
        <MetricCard
          title="Success Rate"
          value={`${mockMetrics.successRate}%`}
          icon={CheckCircle}
          color="emerald"
          trend="+2.1% improvement"
        />
        <MetricCard
          title="Unique Source IPs"
          value={mockMetrics.uniqueIPs.toLocaleString()}
          icon={Globe}
          color="purple"
          trend="3 new this week"
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-96">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports">Recent Reports</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewCharts />
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>Recent DMARC Reports</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RecentReports reports={mockRecentReports} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p>Trend analysis charts would appear here</p>
                    <p className="text-sm mt-2">Upload more reports to see trends</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Source IPs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { ip: "209.85.220.41", provider: "Google", count: 15420, rate: 98.2 },
                    { ip: "40.107.231.46", provider: "Microsoft", count: 8932, rate: 96.1 },
                    { ip: "52.95.48.83", provider: "Amazon SES", count: 6211, rate: 99.1 },
                  ].map((item, idx) => (
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/upload" className="block">
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer">
                <UploadIcon className="w-8 h-8 text-gray-400 mb-2" />
                <h3 className="font-medium text-gray-900">Upload New Report</h3>
                <p className="text-sm text-gray-600">Add a new DMARC XML report for analysis</p>
              </div>
            </Link>
            
            <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors cursor-pointer">
              <CheckCircle className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-medium text-gray-900">Export Summary</h3>
              <p className="text-sm text-gray-600">Download comprehensive analytics report</p>
            </div>
            
            <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors cursor-pointer">
              <Eye className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-medium text-gray-900">View Insights</h3>
              <p className="text-sm text-gray-600">Get recommendations for improvement</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
