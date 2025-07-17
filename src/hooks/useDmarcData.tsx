import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface DmarcReport {
  id: string;
  domain: string;
  org_name: string;
  org_email: string | null;
  report_id: string;
  date_range_begin: number;
  date_range_end: number;
  policy_p: string;
  policy_sp: string | null;
  policy_pct: number | null;
  policy_dkim: string;
  policy_spf: string;
  policy_domain: string;
  raw_xml: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface DmarcRecord {
  id: string;
  report_id: string;
  source_ip: string;
  count: number;
  disposition: string;
  dkim_result: string;
  spf_result: string;
  header_from: string;
  created_at: string;
}

export interface DmarcAuthResult {
  id: string;
  record_id: string;
  domain: string;
  auth_type: string;
  result: string;
  selector: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  totalReports: number;
  totalEmails: number;
  successRate: number;
  uniqueIPs: number;
  activeDomains: number;
  lastUpdated: string;
}

export interface RecentReport {
  id: string;
  domain: string;
  orgName: string;
  dateRange: string;
  emailCount: number;
  successRate: number;
  status: string;
}

export const useDmarcData = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<DmarcReport[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("dmarc_reports")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch reports");
    }
  };

  const fetchMetrics = async () => {
    if (!user) return;

    try {
      // Get total reports
      const { count: totalReports } = await supabase
        .from("dmarc_reports")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Get records with counts
      const { data: records } = await supabase
        .from("dmarc_records")
        .select(`
          count,
          dkim_result,
          spf_result,
          source_ip,
          dmarc_reports!inner(user_id)
        `)
        .eq("dmarc_reports.user_id", user.id);

      if (records) {
        const totalEmails = records.reduce((sum, record) => sum + record.count, 0);
        const uniqueIPs = new Set(records.map(r => r.source_ip)).size;
        
        // Calculate success rate (both DKIM and SPF pass)
        const successfulEmails = records
          .filter(r => r.dkim_result === "pass" && r.spf_result === "pass")
          .reduce((sum, record) => sum + record.count, 0);
        
        const successRate = totalEmails > 0 ? (successfulEmails / totalEmails) * 100 : 0;

        // Get unique domains
        const { data: domains } = await supabase
          .from("dmarc_reports")
          .select("domain")
          .eq("user_id", user.id);
        
        const activeDomains = new Set(domains?.map(d => d.domain)).size;

        setMetrics({
          totalReports: totalReports || 0,
          totalEmails,
          successRate: Math.round(successRate * 10) / 10,
          uniqueIPs,
          activeDomains,
          lastUpdated: new Date().toISOString()
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics");
    }
  };

  const fetchRecentReports = async () => {
    if (!user) return;

    try {
      const { data: reports } = await supabase
        .from("dmarc_reports")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (reports) {
        const recentReportsData: RecentReport[] = [];
        
        for (const report of reports) {
          // Get email count for this report
          const { data: records } = await supabase
            .from("dmarc_records")
            .select("count, dkim_result, spf_result")
            .eq("report_id", report.id);

          const emailCount = records?.reduce((sum, record) => sum + record.count, 0) || 0;
          const successfulEmails = records
            ?.filter(r => r.dkim_result === "pass" && r.spf_result === "pass")
            .reduce((sum, record) => sum + record.count, 0) || 0;
          
          const successRate = emailCount > 0 ? (successfulEmails / emailCount) * 100 : 0;

          const startDate = new Date(report.date_range_begin * 1000).toLocaleDateString();
          const endDate = new Date(report.date_range_end * 1000).toLocaleDateString();

          recentReportsData.push({
            id: report.id,
            domain: report.domain,
            orgName: report.org_name,
            dateRange: `${startDate} to ${endDate}`,
            emailCount,
            successRate: Math.round(successRate * 10) / 10,
            status: "processed"
          });
        }

        setRecentReports(recentReportsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch recent reports");
    }
  };

  const fetchReportById = async (reportId: string) => {
    if (!user) return null;

    try {
      const { data: report } = await supabase
        .from("dmarc_reports")
        .select("*")
        .eq("id", reportId)
        .eq("user_id", user.id)
        .single();

      if (report) {
        // Get associated records
        const { data: records } = await supabase
          .from("dmarc_records")
          .select("*")
          .eq("report_id", report.id);

        // Get auth results
        const recordIds = records?.map(r => r.id) || [];
        let authResults: any[] = [];
        
        if (recordIds.length > 0) {
          const { data } = await supabase
            .from("dmarc_auth_results")
            .select("*")
            .in("record_id", recordIds);
          authResults = data || [];
        }

        return { report, records: records || [], authResults };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch report details");
    }

    return null;
  };

  useEffect(() => {
    if (user) {
      const loadData = async () => {
        setLoading(true);
        await Promise.all([
          fetchReports(),
          fetchMetrics(),
          fetchRecentReports()
        ]);
        setLoading(false);
      };
      loadData();
    }
  }, [user]);

  return {
    reports,
    metrics,
    recentReports,
    loading,
    error,
    refetch: () => {
      if (user) {
        fetchReports();
        fetchMetrics();
        fetchRecentReports();
      }
    },
    fetchReportById
  };
};