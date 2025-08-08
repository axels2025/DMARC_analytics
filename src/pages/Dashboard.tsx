
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Shield, 
  Mail, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Globe,
  Upload as UploadIcon,
  Eye,
  Loader,
  Download
} from "lucide-react";
import { Link } from "react-router-dom";
import OverviewCharts from "@/components/charts/OverviewCharts";
import TrendAnalytics from "@/components/charts/TrendAnalytics";
import RecentReports from "@/components/RecentReports";
import MetricCard from "@/components/MetricCard";
import RecipientDomains from "@/components/analytics/RecipientDomains";
import AuthenticationPatterns from "@/components/analytics/AuthenticationPatterns";
import IPIntelligence from "@/components/analytics/IPIntelligence";
import PolicySimulator from "@/components/analytics/PolicySimulator";
import SecurityMonitoring from "@/components/analytics/SecurityMonitoring";
import DkimSelectorExplorer from "@/components/analytics/DkimSelectorExplorer";
import SpfDomainExplorer from "@/components/analytics/SpfDomainExplorer";
import AlignmentDashboard from "@/components/analytics/AlignmentDashboard";
import { useDmarcData } from "@/hooks/useDmarcData";
import { exportAsCSV, exportAsPDF } from "@/utils/exportService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import InsightsModal from "@/components/InsightsModal";
import ExportModal from "@/components/ExportModal";

const Dashboard = () => {
  const { user } = useAuth();
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [availableDomains, setAvailableDomains] = useState<Array<{domain: string, count: number}>>([]);
  const { metrics, recentReports, loading, error, refetch } = useDmarcData(selectedDomain === "all" ? undefined : selectedDomain);
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Fetch available domains
  useEffect(() => {
    const fetchDomains = async () => {
      if (!user) return;

      try {
        const { data } = await supabase
          .from("dmarc_reports")
          .select("domain")
          .eq("user_id", user.id);

        if (data) {
          const domainCounts = data.reduce((acc: Record<string, number>, report) => {
            acc[report.domain] = (acc[report.domain] || 0) + 1;
            return acc;
          }, {});

          const domains = Object.entries(domainCounts)
            .map(([domain, count]) => ({ domain, count: count as number }))
            .sort((a, b) => b.count - a.count);

          setAvailableDomains(domains);
        }
      } catch (error) {
        console.error("Failed to fetch domains:", error);
      }
    };

    fetchDomains();
  }, [user]);

  // Handle export summary click
  const handleExportSummary = () => {
    if (!metrics || !recentReports || recentReports.length === 0) {
      alert('No data available to export. Please upload some DMARC reports first.');
      return;
    }
    
    setShowExportModal(true);
  };

  // Handle export with format selection
  const handleExport = async (format: 'csv' | 'pdf') => {
    if (!user) {
      alert('Authentication required for export.');
      return;
    }

    try {
      if (format === 'csv') {
        await exportAsCSV(user.id);
      } else {
        await exportAsPDF(user.id);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Handle view insights click
  const handleViewInsights = () => {
    if (!metrics) {
      alert('No data available for insights. Please upload some DMARC reports first.');
      return;
    }
    
    setShowInsightsModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-6">
        <p>Error loading dashboard: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">DMARC Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Monitor your email authentication and security posture
            </p>
          </div>
          
          {/* Domain Selector */}
          {availableDomains.length > 0 && (
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">Domain:</span>
              <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains ({availableDomains.reduce((sum, d) => sum + d.count, 0)} reports)</SelectItem>
                  {availableDomains.map((domain) => (
                    <SelectItem key={domain.domain} value={domain.domain}>
                      {domain.domain} ({domain.count} reports)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-3">
          <Link to="/manage-reports">
            <Button variant="outline">
              <Shield className="w-4 h-4 mr-2" />
              Manage Reports
            </Button>
          </Link>
          <Link to="/upload">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <UploadIcon className="w-4 h-4 mr-2" />
              Upload Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total Reports"
            value={metrics.totalReports.toLocaleString()}
            icon={Shield}
            color="blue"
            trend={metrics.totalReports > 0 ? "Active" : "No reports yet"}
          />
          <MetricCard
            title="Emails Analyzed"
            value={metrics.totalEmails.toLocaleString()}
            icon={Mail}
            color="green"
            trend={metrics.totalEmails > 0 ? "Real data" : "Upload reports to see data"}
          />
          <MetricCard
            title="Success Rate"
            value={`${metrics.successRate}%`}
            icon={CheckCircle}
            color="emerald"
            trend={metrics.totalEmails > 0 ? "Authentication rate" : "No data"}
          />
          <MetricCard
            title="Unique Source IPs"
            value={metrics.uniqueIPs.toLocaleString()}
            icon={Globe}
            color="purple"
            trend={`${metrics.activeDomains} domains`}
          />
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7 lg:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="recipients">Recipients</TabsTrigger>
          <TabsTrigger value="auth-patterns">Authentication</TabsTrigger>
          <TabsTrigger value="ip-intelligence">IP Intel</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewCharts selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
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
              <RecentReports reports={recentReports} onRefresh={refetch} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <TrendAnalytics selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
        </TabsContent>

        <TabsContent value="recipients" className="space-y-6">
          <RecipientDomains selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
        </TabsContent>

        <TabsContent value="auth-patterns" className="space-y-6">
          <AuthenticationPatterns selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
        </TabsContent>

        <TabsContent value="ip-intelligence" className="space-y-6">
          <IPIntelligence selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
        </TabsContent>

        <TabsContent value="policy" className="space-y-6">
          <PolicySimulator selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <SecurityMonitoring selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
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
            
            <div 
              onClick={handleExportSummary}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors cursor-pointer"
            >
              <Download className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-medium text-gray-900">Export Summary</h3>
              <p className="text-sm text-gray-600">Download comprehensive analytics report</p>
            </div>
            
            <div 
              onClick={handleViewInsights}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors cursor-pointer"
            >
              <Eye className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-medium text-gray-900">View Insights</h3>
              <p className="text-sm text-gray-600">Get recommendations for improvement</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights Modal */}
      {metrics && (
        <InsightsModal
          isOpen={showInsightsModal}
          onClose={() => setShowInsightsModal(false)}
          metrics={metrics}
        />
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
      />
    </div>
  );
};

export default Dashboard;
