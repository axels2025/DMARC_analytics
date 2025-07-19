
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
  Eye,
  Loader,
  Download
} from "lucide-react";
import { Link } from "react-router-dom";
import OverviewCharts from "@/components/charts/OverviewCharts";
import TrendAnalytics from "@/components/charts/TrendAnalytics";
import RecentReports from "@/components/RecentReports";
import MetricCard from "@/components/MetricCard";
import { useDmarcData } from "@/hooks/useDmarcData";
import { exportAsCSV, exportAsPDF } from "@/utils/exportService";
import { useAuth } from "@/hooks/useAuth";
import InsightsModal from "@/components/InsightsModal";
import ExportModal from "@/components/ExportModal";

const Dashboard = () => {
  const { metrics, recentReports, loading, error, refetch } = useDmarcData();
  const { user } = useAuth();
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

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
              <RecentReports reports={recentReports} onRefresh={refetch} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <TrendAnalytics />
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
