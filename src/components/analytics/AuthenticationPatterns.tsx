import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Shield, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface AuthPatternData {
  pattern: string;
  count: number;
  percentage: number;
  emailCount: number;
  severity: 'success' | 'warning' | 'error';
}

interface TrendData {
  date: string;
  dkimPass: number;
  spfPass: number;
  both: number;
  neither: number;
}

const AuthenticationPatterns = () => {
  const { user } = useAuth();
  const [patternData, setPatternData] = useState<AuthPatternData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAuthPatterns();
    }
  }, [user]);

  const fetchAuthPatterns = async () => {
    try {
      const { data, error } = await supabase
        .from('dmarc_records')
        .select(`
          dkim_result,
          spf_result,
          count,
          created_at,
          dmarc_reports!inner(user_id)
        `)
        .eq('dmarc_reports.user_id', user?.id);

      if (error) throw error;

      // Process authentication patterns
      const patternMap = new Map<string, { count: number; emailCount: number }>();
      const dateMap = new Map<string, any>();

      data?.forEach(record => {
        // Pattern analysis
        const pattern = `DKIM: ${record.dkim_result}, SPF: ${record.spf_result}`;
        
        if (!patternMap.has(pattern)) {
          patternMap.set(pattern, { count: 0, emailCount: 0 });
        }
        
        const entry = patternMap.get(pattern)!;
        entry.count += 1;
        entry.emailCount += record.count;

        // Trend analysis
        const dateKey = new Date(record.created_at).toLocaleDateString();
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, {
            date: dateKey,
            dkimPass: 0,
            spfPass: 0,
            both: 0,
            neither: 0
          });
        }

        const dateEntry = dateMap.get(dateKey);
        const dkimPass = record.dkim_result === 'pass';
        const spfPass = record.spf_result === 'pass';

        if (dkimPass && spfPass) {
          dateEntry.both += record.count;
        } else if (dkimPass) {
          dateEntry.dkimPass += record.count;
        } else if (spfPass) {
          dateEntry.spfPass += record.count;
        } else {
          dateEntry.neither += record.count;
        }
      });

      // Convert to arrays and calculate percentages
      const totalRecords = Array.from(patternMap.values()).reduce((sum, entry) => sum + entry.count, 0);
      
      const patterns = Array.from(patternMap.entries()).map(([pattern, data]) => {
        const getSeverity = (pattern: string): 'success' | 'warning' | 'error' => {
          if (pattern.includes('dkim: pass') && pattern.includes('spf: pass')) return 'success';
          if (pattern.includes('dkim: pass') || pattern.includes('spf: pass')) return 'warning';
          return 'error';
        };

        return {
          pattern,
          count: data.count,
          emailCount: data.emailCount,
          percentage: Math.round((data.count / totalRecords) * 100),
          severity: getSeverity(pattern.toLowerCase())
        };
      }).sort((a, b) => b.count - a.count);

      const trends = Array.from(dateMap.values()).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      setPatternData(patterns);
      setTrendData(trends);
    } catch (error) {
      console.error('Error fetching authentication patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPatternColor = (severity: string) => {
    switch (severity) {
      case 'success': return 'hsl(var(--chart-2))'; // Green
      case 'warning': return 'hsl(var(--chart-3))'; // Yellow
      case 'error': return 'hsl(var(--chart-1))'; // Red
      default: return 'hsl(var(--muted))';
    }
  };

  const getPatternIcon = (severity: string) => {
    switch (severity) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getBadgeVariant = (severity: string): "default" | "secondary" | "destructive" => {
    switch (severity) {
      case 'success': return 'default';
      case 'warning': return 'secondary';
      case 'error': return 'destructive';
      default: return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 animate-pulse bg-muted rounded"></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trends Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 animate-pulse bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const successRate = patternData.filter(p => p.severity === 'success').reduce((sum, p) => sum + p.percentage, 0);
  const warningRate = patternData.filter(p => p.severity === 'warning').reduce((sum, p) => sum + p.percentage, 0);
  const errorRate = patternData.filter(p => p.severity === 'error').reduce((sum, p) => sum + p.percentage, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Both Pass</p>
                <p className="text-2xl font-bold text-green-600">{successRate}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Partial Pass</p>
                <p className="text-2xl font-bold text-yellow-600">{warningRate}%</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Both Fail</p>
                <p className="text-2xl font-bold text-red-600">{errorRate}%</p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pattern Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Authentication Pattern Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={patternData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="count"
                    label={({ pattern, percentage }) => `${percentage}%`}
                  >
                    {patternData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getPatternColor(entry.severity)} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name, props) => [
                      `${value} records (${props.payload.emailCount.toLocaleString()} emails)`,
                      "Count"
                    ]}
                    labelFormatter={(pattern) => pattern}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Authentication Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication Trends Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="both" stackId="a" fill="hsl(var(--chart-2))" name="Both Pass" />
                  <Bar dataKey="dkimPass" stackId="a" fill="hsl(var(--chart-3))" name="DKIM Only" />
                  <Bar dataKey="spfPass" stackId="a" fill="hsl(var(--chart-4))" name="SPF Only" />
                  <Bar dataKey="neither" stackId="a" fill="hsl(var(--chart-1))" name="Both Fail" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Pattern List */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Pattern Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {patternData.map((pattern, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getPatternIcon(pattern.severity)}
                  <div>
                    <p className="font-medium">{pattern.pattern}</p>
                    <p className="text-sm text-muted-foreground">
                      {pattern.count.toLocaleString()} records • {pattern.emailCount.toLocaleString()} emails
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={getBadgeVariant(pattern.severity)}>
                    {pattern.percentage}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthenticationPatterns;