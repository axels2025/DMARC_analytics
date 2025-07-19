
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Calendar, Mail, TrendingUp, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { deleteDmarcReport, updateReportDashboardInclusion } from "@/utils/dmarcDatabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Report {
  id: string;
  domain: string;
  orgName: string;
  dateRange: string;
  emailCount: number;
  successRate: number;
  status: string;
  includeInDashboard: boolean;
}

interface RecentReportsProps {
  reports: Report[];
  onRefresh?: () => void;
}

const RecentReports = ({ reports, onRefresh }: RecentReportsProps) => {
  const { user } = useAuth();
  const [deletingReports, setDeletingReports] = useState<Set<string>>(new Set());
  const [updatingReports, setUpdatingReports] = useState<Set<string>>(new Set());

  const getSuccessRateBadge = (rate: number) => {
    if (rate >= 95) return "default";
    if (rate >= 90) return "secondary";
    return "destructive";
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return "text-green-600";
    if (rate >= 90) return "text-yellow-600";
    return "text-red-600";
  };

  const handleDeleteReport = async (reportId: string, domain: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to delete reports.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete the DMARC report for ${domain}? This action cannot be undone.`)) {
      return;
    }

    setDeletingReports(prev => new Set(prev).add(reportId));

    try {
      await deleteDmarcReport(reportId, user.id);
      
      toast({
        title: "Report Deleted",
        description: `DMARC report for ${domain} has been deleted successfully.`,
      });

      // Refresh the reports list
      onRefresh?.();
    } catch (error) {
      console.error('Failed to delete report:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete report",
        variant: "destructive",
      });
    } finally {
      setDeletingReports(prev => {
        const newSet = new Set(prev);
        newSet.delete(reportId);
        return newSet;
      });
    }
  };

  const handleDashboardInclusionChange = async (reportId: string, includeInDashboard: boolean, domain: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to update reports.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingReports(prev => new Set(prev).add(reportId));

    try {
      await updateReportDashboardInclusion(reportId, user.id, includeInDashboard);
      
      toast({
        title: "Dashboard Inclusion Updated",
        description: `Report for ${domain} ${includeInDashboard ? 'will be' : 'will not be'} included in dashboard overview.`,
      });

      // Refresh the reports list
      onRefresh?.();
    } catch (error) {
      console.error('Failed to update dashboard inclusion:', error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update dashboard inclusion",
        variant: "destructive",
      });
    } finally {
      setUpdatingReports(prev => {
        const newSet = new Set(prev);
        newSet.delete(reportId);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <div key={report.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">{report.domain}</h3>
                <Badge variant="outline">{report.status}</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>{report.dateRange}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4" />
                  <span>{report.emailCount.toLocaleString()} emails</span>
                </div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className={getSuccessRateColor(report.successRate)}>
                    {report.successRate}% success rate
                  </span>
                </div>
              </div>
              
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Report from <span className="font-medium">{report.orgName}</span>
                </p>
                
                {/* Dashboard Inclusion Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`dashboard-${report.id}`}
                    checked={report.includeInDashboard}
                    disabled={updatingReports.has(report.id)}
                    onCheckedChange={(checked) => 
                      handleDashboardInclusionChange(report.id, checked as boolean, report.domain)
                    }
                  />
                  <label 
                    htmlFor={`dashboard-${report.id}`} 
                    className="text-sm text-gray-600 cursor-pointer"
                  >
                    Include in dashboard
                  </label>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end space-y-2 ml-6">
              <Badge variant={getSuccessRateBadge(report.successRate)}>
                {report.successRate}%
              </Badge>
              
              <div className="flex items-center space-x-2">
                <Link to={`/report/${report.id}`}>
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                </Link>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteReport(report.id, report.domain)}
                  disabled={deletingReports.has(report.id)}
                  className="text-red-600 hover:text-red-700 hover:border-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
      
      {reports.length === 0 && (
        <div className="text-center py-12">
          <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No DMARC reports yet</p>
          <p className="text-sm text-gray-500 mt-1">
            <Link to="/upload" className="text-blue-600 hover:underline">
              Upload your first report
            </Link> to get started
          </p>
        </div>
      )}
    </div>
  );
};

export default RecentReports;
