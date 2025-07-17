
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Calendar, Mail, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

interface Report {
  id: string;
  domain: string;
  orgName: string;
  dateRange: string;
  emailCount: number;
  successRate: number;
  status: string;
}

interface RecentReportsProps {
  reports: Report[];
}

const RecentReports = ({ reports }: RecentReportsProps) => {
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

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <div key={report.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
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
              
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Report from <span className="font-medium">{report.orgName}</span>
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 ml-6">
              <Badge variant={getSuccessRateBadge(report.successRate)}>
                {report.successRate}%
              </Badge>
              <Link to={`/report/${report.id}`}>
                <Button variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </Button>
              </Link>
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
