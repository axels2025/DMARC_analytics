import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Filter, Search, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useSPFAnalysis } from "@/hooks/useSPFAnalysis";

interface SpfDomainStats {
  spfDomain: string;
  emailCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
  lastSeen: string;
  lastSeenTs: number;
  lookupCount?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  hasAnalysis: boolean;
}

interface SpfDomainExplorerProps {
  selectedDomain?: string;
}

const SpfDomainExplorer = ({ selectedDomain }: SpfDomainExplorerProps) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<SpfDomainStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<"volume" | "pass" | "latest" | "risk">("volume");
  const { analyzeRecord } = useSPFAnalysis();

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1) Fetch records for this user (and domain if selected)
        let recordsQuery = supabase
          .from("dmarc_records")
          .select(`id, count, created_at, report_id, dmarc_reports!inner(user_id, domain)`) // join for filtering
          .eq("dmarc_reports.user_id", user.id);

        if (selectedDomain) {
          recordsQuery = recordsQuery.eq("dmarc_reports.domain", selectedDomain);
        }

        const { data: records, error: recErr } = await recordsQuery;
        if (recErr) throw recErr;
        const recordIds = (records || []).map((r: any) => r.id);
        if (recordIds.length === 0) {
          setStats([]);
          setLoading(false);
          return;
        }

        // 2) Fetch SPF auth results for those records
        const { data: authResults, error: authErr } = await supabase
          .from("dmarc_auth_results")
          .select("record_id, domain, result, auth_type")
          .in("record_id", recordIds)
          .eq("auth_type", "spf");
        if (authErr) throw authErr;

        // Build quick lookup for record data
        const recordMap = new Map<string, { count: number; created_at: string }>();
        (records || []).forEach((r: any) => recordMap.set(r.id, { count: r.count, created_at: r.created_at }));

        // Fetch SPF analysis data for these domains
        const uniqueDomains = Array.from(new Set((authResults || []).map((a: any) => a.domain).filter(Boolean)));
        let spfAnalysisMap = new Map<string, { lookupCount: number; riskLevel: string }>();
        
        if (uniqueDomains.length > 0) {
          try {
            const { data: spfAnalyses } = await supabase
              .from('spf_analysis_history')
              .select('domain, lookup_count, risk_level, created_at')
              .eq('user_id', user.id)
              .in('domain', uniqueDomains)
              .order('created_at', { ascending: false });

            // Get latest analysis for each domain
            const latestAnalyses = new Map();
            (spfAnalyses || []).forEach((analysis: any) => {
              if (!latestAnalyses.has(analysis.domain)) {
                latestAnalyses.set(analysis.domain, {
                  lookupCount: analysis.lookup_count,
                  riskLevel: analysis.risk_level
                });
              }
            });
            spfAnalysisMap = latestAnalyses;
          } catch (spfError) {
            console.warn('Failed to fetch SPF analysis data:', spfError);
          }
        }

        const agg = new Map<string, SpfDomainStats>();
        (authResults || []).forEach((a: any) => {
          const rec = recordMap.get(a.record_id);
          if (!rec) return;
          const spfDomain = a.domain || "(unknown)";
          const spfAnalysis = spfAnalysisMap.get(spfDomain);
          
          if (!agg.has(spfDomain)) {
            agg.set(spfDomain, {
              spfDomain,
              emailCount: 0,
              passCount: 0,
              failCount: 0,
              passRate: 0,
              lastSeen: rec.created_at,
              lastSeenTs: new Date(rec.created_at).getTime(),
              lookupCount: spfAnalysis?.lookupCount,
              riskLevel: spfAnalysis?.riskLevel as any,
              hasAnalysis: !!spfAnalysis
            });
          }
          const entry = agg.get(spfDomain)!;
          entry.emailCount += rec.count;
          if ((a.result || "").toLowerCase() === "pass") entry.passCount += rec.count;
          else entry.failCount += rec.count;
          if (new Date(rec.created_at).getTime() > entry.lastSeenTs) {
            entry.lastSeenTs = new Date(rec.created_at).getTime();
            entry.lastSeen = rec.created_at;
          }
        });

        const arr = Array.from(agg.values()).map((e) => ({
          ...e,
          passRate: e.emailCount > 0 ? Math.round((e.passCount / e.emailCount) * 100) : 0,
          lastSeen: new Date(e.lastSeen).toLocaleDateString(),
        }));
        setStats(arr);
      } catch (e) {
        console.error("Failed to fetch SPF domain stats", e);
        setStats([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, selectedDomain]);

  const sorted = useMemo(() => {
    const list = [...stats];
    switch (sortMode) {
      case "pass":
        return list.sort((a, b) => b.passRate - a.passRate);
      case "latest":
        return list.sort((a, b) => b.lastSeenTs - a.lastSeenTs);
      case "risk":
        return list.sort((a, b) => {
          // Sort by risk level first (critical > high > medium > low), then by lookup count
          const riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          const aRisk = a.riskLevel ? riskOrder[a.riskLevel] : 0;
          const bRisk = b.riskLevel ? riskOrder[b.riskLevel] : 0;
          if (aRisk !== bRisk) return bRisk - aRisk;
          return (b.lookupCount || 0) - (a.lookupCount || 0);
        });
      default:
        return list.sort((a, b) => b.emailCount - a.emailCount);
    }
  }, [stats, sortMode]);

  const totalDomains = stats.length;
  const avgPass = totalDomains > 0 ? Math.round(stats.reduce((s, e) => s + e.passRate, 0) / totalDomains) : 0;
  const domainsWithAnalysis = stats.filter(s => s.hasAnalysis).length;
  const criticalDomains = stats.filter(s => s.riskLevel === 'critical').length;
  const highRiskDomains = stats.filter(s => ['high', 'critical'].includes(s.riskLevel || '')).length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            SPF Domain Explorer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">SPF Domains</p>
                <p className="text-2xl font-bold">{totalDomains}</p>
              </div>
              <Globe className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Pass Rate</p>
                <p className="text-2xl font-bold">{avgPass}%</p>
              </div>
              <Filter className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">With SPF Analysis</p>
                <p className="text-2xl font-bold">{domainsWithAnalysis}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">High Risk</p>
                <p className="text-2xl font-bold">{highRiskDomains}</p>
              </div>
              <AlertTriangle className={`w-8 h-8 ${criticalDomains > 0 ? 'text-red-500' : 'text-yellow-500'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Top SPF Domains
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort by</span>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as any)}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="volume">Volume</SelectItem>
                <SelectItem value="pass">Pass rate</SelectItem>
                <SelectItem value="latest">Latest activity</SelectItem>
                <SelectItem value="risk">SPF Risk Level</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-sm text-muted-foreground">No SPF domain data available.</div>
          ) : (
            <ScrollArea className="h-80 pr-2">
              <div className="space-y-3">
                {sorted.map((s) => (
                  <div key={s.spfDomain} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{s.spfDomain}</p>
                        {s.hasAnalysis && s.riskLevel && (
                          <Badge 
                            variant={
                              s.riskLevel === 'critical' ? 'destructive' 
                              : s.riskLevel === 'high' ? 'destructive'
                              : s.riskLevel === 'medium' ? 'secondary' 
                              : 'default'
                            }
                          >
                            {s.lookupCount} lookups
                          </Badge>
                        )}
                        {s.riskLevel === 'critical' && (
                          <XCircle className="w-4 h-4 text-red-500" title="Critical: SPF exceeds 10 lookup limit" />
                        )}
                        {s.riskLevel === 'high' && (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" title="High risk: Close to lookup limit" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {s.emailCount.toLocaleString()} emails • Last seen {s.lastSeen}
                        {s.hasAnalysis && s.lookupCount !== undefined && (
                          <span className={`ml-2 ${s.riskLevel === 'critical' ? 'text-red-600' : s.riskLevel === 'high' ? 'text-yellow-600' : ''}`}>
                            • Risk: {s.riskLevel}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {!s.hasAnalysis && s.spfDomain !== "(unknown)" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => analyzeRecord(s.spfDomain)}
                          className="flex items-center gap-1"
                        >
                          <Search className="w-3 h-3" />
                          Analyze SPF
                        </Button>
                      )}
                      <div className="text-right">
                        <Badge variant={s.passRate >= 90 ? "default" : s.passRate >= 70 ? "secondary" : "destructive"}>{s.passRate}%</Badge>
                        <p className="text-xs text-muted-foreground mt-1">pass rate</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SpfDomainExplorer;
