import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { 
  Eye, 
  Calendar, 
  Mail, 
  TrendingUp, 
  Trash2, 
  Search,
  Settings,
  Loader,
  ArrowLeft
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { deleteDmarcReport, updateReportDashboardInclusion } from "@/utils/dmarcDatabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useDmarcData } from "@/hooks/useDmarcData";

interface Report {
  id: string;
  domain: string;
  orgName: string;
  dateRange: string;
  emailCount: number;
  successRate: number;
  status: string;
  includeInDashboard: boolean;
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

const ManageReports = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reports, loading, error, refetch } = useDmarcData();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [deletingReports, setDeletingReports] = useState<Set<string>>(new Set());
  const [updatingReports, setUpdatingReports] = useState<Set<string>>(new Set());
  const [processedReports, setProcessedReports] = useState<Report[]>([]);

  // Process raw reports into the format needed for display
  useEffect(() => {
    const processReports = async () => {
      if (!reports || reports.length === 0) {
        setProcessedReports([]);
        return;
      }

      const processed: Report[] = [];
      
      for (const report of reports) {
        // Calculate email count and success rate for each report
        const startDate = new Date(report.date_range_begin * 1000).toLocaleDateString();
        const endDate = new Date(report.date_range_end * 1000).toLocaleDateString();

        // Fetch records for this report to calculate email count and success rate
        const { data: records } = await supabase
          .from("dmarc_records")
          .select("count, dkim_result, spf_result")
          .eq("report_id", report.id);

        const emailCount = records?.reduce((sum, record) => sum + record.count, 0) || 0;
        const successfulEmails = records
          ?.filter(r => r.dkim_result === "pass" && r.spf_result === "pass")
          .reduce((sum, record) => sum + record.count, 0) || 0;
        
        const successRate = emailCount > 0 ? (successfulEmails / emailCount) * 100 : 0;

        processed.push({
          id: report.id,
          domain: report.domain,
          orgName: report.org_name,
          dateRange: `${startDate} to ${endDate}`,
          emailCount,
          successRate: Math.round(successRate * 10) / 10,
          status: "processed",
          includeInDashboard: report.include_in_dashboard ?? true,
          created_at: report.created_at
        });
      }

      setProcessedReports(processed);
    };

    processReports();
  }, [reports]);

  // Filter reports based on search term
  const filteredReports = processedReports.filter(report =>
    report.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.orgName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedReports = filteredReports.slice(startIndex, startIndex + ITEMS_PER_PAGE);

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

  const handleSelectReport = (reportId: string, checked: boolean) => {
    setSelectedReports(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(reportId);
      } else {
        newSet.delete(reportId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReports(new Set(paginatedReports.map(r => r.id)));
    } else {
      setSelectedReports(new Set());
    }
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

      refetch();
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

  const handleBulkDelete = async () => {
    if (!user || selectedReports.size === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedReports.size} selected reports? This action cannot be undone.`)) {
      return;
    }

    const reportArray = Array.from(selectedReports);
    setDeletingReports(new Set(reportArray));

    try {
      await Promise.all(
        reportArray.map(reportId => deleteDmarcReport(reportId, user.id))
      );
      
      toast({
        title: "Reports Deleted",
        description: `${selectedReports.size} reports have been deleted successfully.`,
      });

      setSelectedReports(new Set());
      refetch();
    } catch (error) {
      console.error('Failed to delete reports:', error);
      toast({
        title: "Bulk Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete some reports",
        variant: "destructive",
      });
    } finally {
      setDeletingReports(new Set());
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

      refetch();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-6">
        <p>Error loading reports: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Manage Reports</h1>
            <p className="text-gray-600 mt-1">
              View and manage all your DMARC reports
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {selectedReports.size > 0 && (
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={deletingReports.size > 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedReports.size})
            </Button>
          )}
          <Link to="/upload">
            <Button>
              <Mail className="w-4 h-4 mr-2" />
              Upload Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by domain or organization..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="text-sm text-gray-500">
              Showing {filteredReports.length} of {processedReports.length} reports
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>All DMARC Reports</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paginatedReports.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchTerm ? "No reports match your search" : "No DMARC reports yet"}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                <Link to="/upload" className="text-blue-600 hover:underline">
                  Upload your first report
                </Link> to get started
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedReports.size === paginatedReports.length && paginatedReports.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Email Count</TableHead>
                    <TableHead>Success Rate</TableHead>
                    <TableHead>Dashboard</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedReports.has(report.id)}
                          onCheckedChange={(checked) => handleSelectReport(report.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{report.domain}</TableCell>
                      <TableCell>{report.orgName}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{report.dateRange}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span>{report.emailCount.toLocaleString()}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="w-4 h-4 text-gray-400" />
                          <Badge variant={getSuccessRateBadge(report.successRate)}>
                            {report.successRate}%
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={report.includeInDashboard}
                          disabled={updatingReports.has(report.id)}
                          onCheckedChange={(checked) => 
                            handleDashboardInclusionChange(report.id, checked as boolean, report.domain)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Link 
                            to={`/report/${report.id}`}
                            state={{ from: 'manage-reports' }}
                          >
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              View
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {[...Array(totalPages)].map((_, i) => {
                        const page = i + 1;
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        }
                        return null;
                      })}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageReports;