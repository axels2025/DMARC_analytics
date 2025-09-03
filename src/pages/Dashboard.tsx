
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
  Download,
  AlertTriangle
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
import SPFFlattener from "@/components/spf/SPFFlattener";
import SPFFlatteningHistory from "@/components/spf/SPFFlatteningHistory";
import SPFMonitoringDashboard from "@/components/spf/SPFMonitoringDashboard";
import { useDmarcData } from "@/hooks/useDmarcData";
import { useSPFHealthMetrics } from "@/hooks/useSPFAnalysis";
import { exportAsCSV, exportAsPDF } from "@/utils/exportService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import InsightsModal from "@/components/InsightsModal";
import ExportModal from "@/components/ExportModal";
import { GmailOAuthButton, EmailConfigModal } from "@/components/EmailSync";
import { useEmailSync } from "@/hooks/useEmailSync";

const Dashboard = () => {
  const { user } = useAuth();
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [availableDomains, setAvailableDomains] = useState<Array<{domain: string, count: number}>>([]);
  const { metrics, recentReports, loading, error, refetch } = useDmarcData(selectedDomain === "all" ? undefined : selectedDomain);
  const { metrics: spfMetrics } = useSPFHealthMetrics();
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const { activeGmailConfig, isAnySyncing, configs } = useEmailSync();

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
          
          {/* Gmail Integration */}
          <Link to="/settings">
            <Button variant="outline" className="bg-blue-50 hover:bg-blue-100 border-blue-200">
              <Mail className="w-4 h-4 mr-2" />
              Gmail Sync
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
        <div className="space-y-6">
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

          {/* SPF Health Metrics */}
          {spfMetrics.totalDomains > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                SPF Record Health
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="SPF Analyzed"
                  value={spfMetrics.totalDomains.toString()}
                  icon={Shield}
                  color="blue"
                  trend="domains monitored"
                />
                <MetricCard
                  title="Healthy Records"
                  value={spfMetrics.healthyDomains.toString()}
                  icon={CheckCircle}
                  color="green"
                  trend={`${Math.round((spfMetrics.healthyDomains / spfMetrics.totalDomains) * 100)}% compliant`}
                />
                <MetricCard
                  title="At Risk"
                  value={spfMetrics.warningDomains.toString()}
                  icon={AlertTriangle}
                  color="yellow"
                  trend="need attention"
                />
                <MetricCard
                  title="Critical Issues"
                  value={spfMetrics.criticalDomains.toString()}
                  icon={XCircle}
                  color="red"
                  trend={spfMetrics.criticalDomains > 0 ? "immediate action needed" : "no critical issues"}
                />
              </div>
              {spfMetrics.averageLookups > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-blue-800">
                        <strong>Average DNS Lookups:</strong> {spfMetrics.averageLookups}/10 
                        {spfMetrics.averageLookups >= 8 && (
                          <span className="ml-2 text-red-600 font-semibold">
                            ⚠️ Approaching limit
                          </span>
                        )}
                      </p>
                      {spfMetrics.lastAnalyzed && (
                        <p className="text-xs text-blue-600 mt-1">
                          Last analyzed: {new Date(spfMetrics.lastAnalyzed).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {(spfMetrics.criticalDomains > 0 || spfMetrics.averageLookups >= 8) && (
                        <Link 
                          to="#"
                          onClick={(e) => {
                            e.preventDefault();
                            // Switch to SPF Flattening tab
                            const spfTab = document.querySelector('[value="spf-flattening"]') as HTMLElement;
                            spfTab?.click();
                          }}
                        >
                          <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            Optimize SPF
                          </Button>
                        </Link>
                      )}
                      <Link 
                        to="#"
                        onClick={(e) => {
                          e.preventDefault();
                          // Switch to SPF Monitoring tab
                          const monitoringTab = document.querySelector('[value="spf-monitoring"]') as HTMLElement;
                          monitoringTab?.click();
                        }}
                      >
                        <Button size="sm" variant="outline" className="border-teal-600 text-teal-600 hover:bg-teal-50">
                          <Shield className="w-3 h-3 mr-1" />
                          Monitor SPF
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <div className="w-full overflow-hidden border border-gray-200 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 p-1">
          <TabsList className="flex overflow-x-auto scrollbar-hide w-full gap-1 bg-transparent h-auto p-1 scroll-smooth">
            {/* Core Group */}
            <TabsTrigger 
              value="overview" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-blue-600 data-[state=active]:border data-[state=active]:border-blue-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="reports" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-blue-600 data-[state=active]:border data-[state=active]:border-blue-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Reports
            </TabsTrigger>
            <TabsTrigger 
              value="forensics" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 data-[state=active]:border data-[state=active]:border-red-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Forensics
            </TabsTrigger>
            
            {/* Divider */}
            <div className="flex items-center mx-3 flex-shrink-0">
              <div className="w-px h-8 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
            </div>
            
            {/* Analytics Group */}
            <TabsTrigger 
              value="analytics" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-green-600 data-[state=active]:border data-[state=active]:border-green-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger 
              value="recipients" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-green-600 data-[state=active]:border data-[state=active]:border-green-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Recipients
            </TabsTrigger>
            <TabsTrigger 
              value="auth-patterns" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-green-600 data-[state=active]:border data-[state=active]:border-green-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Authentication
            </TabsTrigger>
            <TabsTrigger 
              value="spf-flattening" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-orange-600 data-[state=active]:border data-[state=active]:border-orange-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              SPF Flattening
            </TabsTrigger>
            <TabsTrigger 
              value="spf-monitoring" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-teal-600 data-[state=active]:border data-[state=active]:border-teal-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              SPF Monitoring
            </TabsTrigger>
            
            {/* Divider */}
            <div className="flex items-center mx-3 flex-shrink-0">
              <div className="w-px h-8 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
            </div>
            
            {/* Intelligence Group */}
            <TabsTrigger 
              value="ip-intelligence" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-purple-600 data-[state=active]:border data-[state=active]:border-purple-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              IP Intel
            </TabsTrigger>
            <TabsTrigger 
              value="policy" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-purple-600 data-[state=active]:border data-[state=active]:border-purple-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Policy
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-105 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-purple-600 data-[state=active]:border data-[state=active]:border-purple-200 flex-shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] before:transition-transform before:duration-700 hover:before:translate-x-[100%]"
            >
              Security
            </TabsTrigger>
          </TabsList>
        </div>

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

        <TabsContent value="forensics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Forensic Analysis</span>
                <Badge variant="outline">Coming Soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center py-8">
              <AlertTriangle className="h-12 w-12 mx-auto text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Forensic Reports Dashboard</h3>
              <p className="text-gray-500 mb-4">
                Detailed analysis of individual email authentication failures will be available here.
              </p>
              <Link to="/forensics">
                <Button>
                  <Eye className="h-4 w-4 mr-2" />
                  Go to Forensic Dashboard
                </Button>
              </Link>
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
          <AlignmentDashboard selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
          <AuthenticationPatterns selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DkimSelectorExplorer selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
            <SpfDomainExplorer selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
          </div>
        </TabsContent>

        <TabsContent value="spf-flattening" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <SPFFlattener selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
            <SPFFlatteningHistory selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
          </div>
        </TabsContent>

        <TabsContent value="spf-monitoring" className="space-y-6">
          <SPFMonitoringDashboard selectedDomain={selectedDomain === "all" ? undefined : selectedDomain} />
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
