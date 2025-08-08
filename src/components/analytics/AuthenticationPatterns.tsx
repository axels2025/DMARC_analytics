import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend } from "@/components/ui/chart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Shield, AlertTriangle, CheckCircle, XCircle, Info, TrendingUp, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

interface AuthenticationPatternsProps {
  selectedDomain?: string;
}

const AuthenticationPatterns = ({ selectedDomain }: AuthenticationPatternsProps) => {
  const { user } = useAuth();
  const [patternData, setPatternData] = useState<AuthPatternData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAuthPatterns();
    }
  }, [user, selectedDomain]);

  const fetchAuthPatterns = async () => {
    try {
      let recordsQuery = supabase
        .from('dmarc_records')
        .select(`
          dkim_result,
          spf_result,
          count,
          created_at,
          dmarc_reports!inner(user_id, domain)
        `)
        .eq('dmarc_reports.user_id', user?.id);

      if (selectedDomain) {
        recordsQuery = recordsQuery.eq('dmarc_reports.domain', selectedDomain);
      }

      const { data, error } = await recordsQuery;

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

  // Chart configurations
  const pieChartConfig = {
    success: {
      label: "Both Pass",
      color: "hsl(var(--chart-2))",
    },
    warning: {
      label: "Partial Pass", 
      color: "hsl(var(--chart-3))",
    },
    error: {
      label: "Both Fail",
      color: "hsl(var(--chart-1))",
    },
  };

  const trendChartConfig = {
    both: {
      label: "Both Pass",
      color: "hsl(var(--chart-2))",
    },
    dkimPass: {
      label: "DKIM Only",
      color: "hsl(var(--chart-3))",
    },
    spfPass: {
      label: "SPF Only", 
      color: "hsl(var(--chart-4))",
    },
    neither: {
      label: "Both Fail",
      color: "hsl(var(--chart-1))",
    },
  };

  const outcomeExplanations: Record<"both" | "dkimPass" | "spfPass" | "neither", { title: string; short: string; long: string }> = {
    both: {
      title: "Both Pass",
      short: "SPF and DKIM both pass (and usually align). Strongest trust signal.",
      long: "The sender authenticated with both SPF and DKIM. As long as one of them aligns with your domain, DMARC will pass. Indicates properly configured mail sources.",
    },
    dkimPass: {
      title: "DKIM Only",
      short: "DKIM passes while SPF fails — often due to forwarding or mailing lists.",
      long: "SPF can break when mail is forwarded or relayed, while DKIM survives content‑preserving forwarding. Ensure DKIM is aligned and applied to all providers; rotate keys and sign all streams.",
    },
    spfPass: {
      title: "SPF Only",
      short: "SPF passes while DKIM fails — mail unsigned or signature altered.",
      long: "Messages may be missing DKIM signatures or signatures break due to content changes (footers, rewrapping). Enable DKIM on all senders and verify selectors; minimize body changes or use relaxed canonicalization.",
    },
    neither: {
      title: "Both Fail",
      short: "Neither SPF nor DKIM pass. Likely spoofing or misconfiguration.",
      long: "Check source IPs and providers, fix SPF includes, and enable/validate DKIM. With strict DMARC (p=quarantine/reject), these are likely filtered.",
    },
  };

  return (
    <div className="space-y-6">
      {/* Educational Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Authentication Guide:</strong> DMARC checks both SPF and DKIM authentication. 
          <strong> Both Pass</strong> = Optimal security (SPF + DKIM pass). 
          <strong> Partial Pass</strong> = One method passes (better than none, but not ideal). 
          <strong> Both Fail</strong> = High risk - emails may be spoofed or misconfigured.
        </AlertDescription>
      </Alert>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Both Pass (Optimal)</p>
                <p className="text-2xl font-bold text-green-600">{successRate}%</p>
                <p className="text-xs text-muted-foreground">SPF + DKIM authenticated</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Partial Pass (Warning)</p>
                <p className="text-2xl font-bold text-yellow-600">{warningRate}%</p>
                <p className="text-xs text-muted-foreground">Only SPF or DKIM passes</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Both Fail (Critical)</p>
                <p className="text-2xl font-bold text-red-600">{errorRate}%</p>
                <p className="text-xs text-muted-foreground">Neither SPF nor DKIM passes</p>
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
            <ChartContainer config={pieChartConfig} className="h-64">
              <PieChart>
                <Pie
                  data={patternData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="count"
                  nameKey="pattern"
                >
                  {patternData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getPatternColor(entry.severity)} />
                  ))}
                </Pie>
                <ChartTooltip 
                  content={<ChartTooltipContent />}
                  formatter={(value: any, name: string, props: any) => [
                    `${value} records (${props.payload.emailCount?.toLocaleString() || 0} emails)`,
                    props.payload.pattern
                  ]}
                />
                <Legend 
                  content={({ payload }) => (
                    <div className="flex flex-wrap justify-center gap-4 mt-4">
                      {patternData.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: getPatternColor(entry.severity) }}
                          />
                          <span className="text-sm">{entry.pattern}</span>
                          <span className="text-sm text-muted-foreground">({entry.percentage}%)</span>
                        </div>
                      ))}
                    </div>
                  )}
                />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Authentication Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication Trends Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="h-64">
              <BarChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend
                  content={() => (
                    <TooltipProvider>
                      <div className="flex flex-wrap justify-center gap-4 mt-2">
                        {(["both", "dkimPass", "spfPass", "neither"] as const).map((key) => (
                          <div key={key} className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: trendChartConfig[key].color }}
                            />
                            <span className="text-sm">{trendChartConfig[key].label}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center text-muted-foreground"
                                  aria-label={`What does ${trendChartConfig[key].label} mean?`}
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">{outcomeExplanations[key].short}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </TooltipProvider>
                  )}
                />
                <Bar dataKey="both" stackId="a" fill="var(--color-both)" name="Both Pass" />
                <Bar dataKey="dkimPass" stackId="a" fill="var(--color-dkimPass)" name="DKIM Only" />
                <Bar dataKey="spfPass" stackId="a" fill="var(--color-spfPass)" name="SPF Only" />
                <Bar dataKey="neither" stackId="a" fill="var(--color-neither)" name="Both Fail" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* What these outcomes mean */}
      <Card>
        <CardHeader>
          <CardTitle>What these outcomes mean</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {(["both", "dkimPass", "spfPass", "neither"] as const).map((key) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: trendChartConfig[key].color }}
                    aria-hidden="true"
                  />
                  <h4 className="text-sm font-semibold">{outcomeExplanations[key].title}</h4>
                </div>
                <p className="text-sm text-muted-foreground">{outcomeExplanations[key].long}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Improvement Recommendations */}
      {errorRate > 10 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription>
            <strong>Action Required:</strong> {errorRate}% of your emails fail both SPF and DKIM authentication. 
            Consider: 1) Verify SPF record includes all sending IPs, 2) Check DKIM key configuration, 
            3) Review DNS settings, 4) Ensure proper email routing.
          </AlertDescription>
        </Alert>
      )}

      {warningRate > 30 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            <strong>Improvement Opportunity:</strong> {warningRate}% of emails have partial authentication. 
            To achieve both SPF and DKIM pass: 1) Ensure all sending servers are in SPF record, 
            2) Verify DKIM signatures are properly applied, 3) Check for third-party email services.
          </AlertDescription>
        </Alert>
      )}

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

      {/* Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Authentication Best Practices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                SPF (Sender Policy Framework)
              </h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Include all authorized sending IPs</li>
                <li>• Use -all for strict policy</li>
                <li>• Keep record under 255 characters</li>
                <li>• Test changes before deployment</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                DKIM (DomainKeys Identified Mail)
              </h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Use strong key lengths (2048-bit)</li>
                <li>• Rotate keys regularly</li>
                <li>• Sign all outgoing emails</li>
                <li>• Monitor key validity</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthenticationPatterns;