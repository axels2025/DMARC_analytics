import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Mail, TrendingUp, Shield, AlertTriangle, RefreshCw, Info } from "lucide-react";
import { migrateEnvelopeToData, checkMigrationNeeded } from "@/utils/migrateEnvelopeTo";
import { toast } from "@/hooks/use-toast";

interface RecipientDomainData {
  domain: string;
  emailCount: number;
  successRate: number;
  failureCount: number;
  lastSeen: string;
}

const RecipientDomains = () => {
  const { user } = useAuth();
  const [domainData, setDomainData] = useState<RecipientDomainData[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRecipientDomains();
      checkForMigration();
    }
  }, [user]);

  const checkForMigration = async () => {
    if (!user) return;
    try {
      const needsMigration = await checkMigrationNeeded(user.id);
      setMigrationNeeded(needsMigration);
    } catch (error) {
      console.error('Error checking migration status:', error);
    }
  };

  const handleMigration = async () => {
    if (!user) return;
    
    setMigrating(true);
    try {
      const result = await migrateEnvelopeToData(user.id);
      
      toast({
        title: "Migration Complete",
        description: result.message,
        variant: result.errors > 0 ? "destructive" : "default"
      });

      if (result.migrated > 0) {
        setMigrationNeeded(false);
        await fetchRecipientDomains(); // Refresh data
      }
    } catch (error) {
      toast({
        title: "Migration Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setMigrating(false);
    }
  };

  const fetchRecipientDomains = async () => {
    try {
      // Direct query since we don't have a specific RPC function yet
      const { data: manualData, error: manualError } = await supabase
        .from('dmarc_records')
        .select(`
          header_from,
          envelope_to,
          count,
          dkim_result,
          spf_result,
          created_at,
          report_id,
          dmarc_reports!inner(user_id)
        `)
        .eq('dmarc_reports.user_id', user?.id);

      if (manualError) throw manualError;

      // Process data manually
      const domainMap = new Map<string, any>();
      
      manualData?.forEach(record => {
        // Use envelope_to (recipient domain) if available, fallback to header_from
        const domain = record.envelope_to || record.header_from;
        const isSuccess = (record.dkim_result === 'pass' || record.spf_result === 'pass');
        
        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            domain,
            emailCount: 0,
            successCount: 0,
            failureCount: 0,
            lastSeen: record.created_at
          });
        }
        
        const entry = domainMap.get(domain);
        entry.emailCount += record.count;
        
        if (isSuccess) {
          entry.successCount += record.count;
        } else {
          entry.failureCount += record.count;
        }
        
        if (new Date(record.created_at) > new Date(entry.lastSeen)) {
          entry.lastSeen = record.created_at;
        }
      });

      const processedData = Array.from(domainMap.values())
        .map(entry => ({
          domain: entry.domain,
          emailCount: entry.emailCount,
          successRate: entry.emailCount > 0 ? Math.round((entry.successCount / entry.emailCount) * 100) : 0,
          failureCount: entry.failureCount,
          lastSeen: new Date(entry.lastSeen).toLocaleDateString()
        }))
        .sort((a, b) => b.emailCount - a.emailCount)
        .slice(0, 10);

      setDomainData(processedData);
    } catch (error) {
      console.error('Error fetching recipient domains:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return "hsl(var(--chart-2))"; // Green
    if (rate >= 70) return "hsl(var(--chart-3))"; // Yellow  
    return "hsl(var(--chart-1))"; // Red
  };

  const getSuccessRateVariant = (rate: number): "default" | "secondary" | "destructive" => {
    if (rate >= 90) return "default";
    if (rate >= 70) return "secondary";
    return "destructive";
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Top Recipient Domains
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Domain Volume Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 animate-pulse bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const topDomains = domainData.slice(0, 5);
  const chartData = domainData.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Migration Notice */}
      {migrationNeeded && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-blue-800 mb-2">Data Migration Available</h4>
                <p className="text-sm text-blue-700 mb-3">
                  Your existing DMARC data doesn't include recipient domain information. 
                  Run a migration to extract recipient domains from your uploaded reports for more accurate analysis.
                </p>
                <Button 
                  onClick={handleMigration}
                  disabled={migrating}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {migrating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    'Migrate Data'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Domains</p>
                <p className="text-2xl font-bold">{domainData.length}</p>
              </div>
              <Mail className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Success Rate</p>
                <p className="text-2xl font-bold">
                  {domainData.length > 0 
                    ? Math.round(domainData.reduce((acc, d) => acc + d.successRate, 0) / domainData.length) 
                    : 0}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">High Risk Domains</p>
                <p className="text-2xl font-bold text-red-600">
                  {domainData.filter(d => d.successRate < 70).length}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Domains List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Top Recipient Domains
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topDomains.map((domain, index) => (
                <div key={domain.domain} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{domain.domain}</p>
                      <p className="text-sm text-muted-foreground">
                        {domain.emailCount.toLocaleString()} emails • Last seen: {domain.lastSeen}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={getSuccessRateVariant(domain.successRate)}>
                      {domain.successRate}%
                    </Badge>
                    {domain.successRate < 70 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Shield className="w-3 h-3 text-red-500" />
                        <span className="text-xs text-red-500">Needs attention</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Domain Volume Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="domain" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={10}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      `${value.toLocaleString()} emails`,
                      "Email Volume"
                    ]}
                    labelFormatter={(domain) => `Domain: ${domain}`}
                  />
                  <Bar dataKey="emailCount" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getSuccessRateColor(entry.successRate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Domains Table */}
      {domainData.length > 5 && (
        <Card>
          <CardHeader>
            <CardTitle>All Recipient Domains</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {domainData.slice(5).map((domain) => (
                <div key={domain.domain} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="font-medium text-sm">{domain.domain}</p>
                    <p className="text-xs text-muted-foreground">
                      {domain.emailCount.toLocaleString()} emails
                    </p>
                  </div>
                  <Badge variant={getSuccessRateVariant(domain.successRate)} className="text-xs">
                    {domain.successRate}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RecipientDomains;