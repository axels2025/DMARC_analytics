import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Shield, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface AlignmentDashboardProps {
  selectedDomain?: string;
}

const AlignmentDashboard = ({ selectedDomain }: AlignmentDashboardProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    emails: 0,
    dkimAligned: 0,
    spfAligned: 0,
    bothAligned: 0,
    neither: 0,
  });

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        let recordsQuery = supabase
          .from('dmarc_records')
          .select(`dkim_result, spf_result, count, dmarc_reports!inner(user_id, domain)`) 
          .eq('dmarc_reports.user_id', user.id);

        if (selectedDomain) {
          recordsQuery = recordsQuery.eq('dmarc_reports.domain', selectedDomain);
        }

        const { data, error } = await recordsQuery;
        if (error) throw error;

        let emails = 0, dkimAligned = 0, spfAligned = 0, bothAligned = 0, neither = 0;
        (data || []).forEach((r: any) => {
          emails += r.count;
          const dkimPass = (r.dkim_result || '').toLowerCase() === 'pass';
          const spfPass = (r.spf_result || '').toLowerCase() === 'pass';
          if (dkimPass && spfPass) bothAligned += r.count;
          else if (dkimPass) dkimAligned += r.count;
          else if (spfPass) spfAligned += r.count;
          else neither += r.count;
        });

        setTotals({ emails, dkimAligned, spfAligned, bothAligned, neither });
      } catch (e) {
        console.error('Failed to compute alignment dashboard', e);
        setTotals({ emails: 0, dkimAligned: 0, spfAligned: 0, bothAligned: 0, neither: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, selectedDomain]);

  const pct = (n: number) => (totals.emails > 0 ? Math.round((n / totals.emails) * 100) : 0);
  const dmarcPass = totals.emails > 0 ? pct(totals.bothAligned + totals.dkimAligned + totals.spfAligned) : 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alignment Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">DMARC Pass (any)</p>
              <p className="text-2xl font-bold">{dmarcPass}%</p>
            </div>
            <Shield className="w-8 h-8 text-primary" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">DKIM Aligned</p>
              <p className="text-2xl font-bold">{pct(totals.bothAligned + totals.dkimAligned)}%</p>
            </div>
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">SPF Aligned</p>
              <p className="text-2xl font-bold">{pct(totals.bothAligned + totals.spfAligned)}%</p>
            </div>
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Both Fail</p>
              <p className="text-2xl font-bold">{pct(totals.neither)}%</p>
            </div>
            <XCircle className="w-8 h-8 text-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AlignmentDashboard;
