import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Settings, AlertTriangle, Target, TrendingUp, Mail, Shield, CheckCircle, XCircle, Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
interface PolicySimulatorProps {
  selectedDomain?: string;
}

interface PolicyData {
  currentPolicy: {
    p: string;
    sp?: string;
    pct: number;
    dkim: string;
    spf: string;
  };
  simulationResults: {
    policy: string;
    affectedEmails: number;
    affectedPercentage: number;
    impact: 'low' | 'medium' | 'high';
  }[];
  alignmentAnalysis: {
    dkimAlignment: number;
    spfAlignment: number;
    bothAligned: number;
    neitherAligned: number;
  };
}

const PolicySimulator = ({ selectedDomain }: PolicySimulatorProps) => {
  const { user } = useAuth();
  const [policyData, setPolicyData] = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('quarantine');

  useEffect(() => {
    if (user) {
      fetchPolicyData();
    }
  }, [user]);

  const fetchPolicyData = async () => {
    try {
      // Fetch current policy settings and records for simulation
      const { data: reports, error: reportsError } = await supabase
        .from('dmarc_reports')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (reportsError) throw reportsError;

      const { data: records, error: recordsError } = await supabase
        .from('dmarc_records')
        .select(`
          count,
          dkim_result,
          spf_result,
          disposition,
          dmarc_reports!inner(user_id)
        `)
        .eq('dmarc_reports.user_id', user?.id);

      if (recordsError) throw recordsError;

      if (!reports || reports.length === 0 || !records) {
        setPolicyData(null);
        return;
      }

      const currentReport = reports[0];
      
      // Calculate total emails and failure counts
      const totalEmails = records.reduce((sum, record) => sum + (record.count as number), 0);
      
      // Count failures
      let dkimFailures = 0;
      let spfFailures = 0;
      let bothFailures = 0;
      let alignmentData = {
        dkimAlignment: 0,
        spfAlignment: 0,
        bothAligned: 0,
        neitherAligned: 0
      };

      records.forEach(record => {
        const count = record.count as number;
        const dkimPass = record.dkim_result === 'pass';
        const spfPass = record.spf_result === 'pass';

        if (!dkimPass) dkimFailures += count;
        if (!spfPass) spfFailures += count;
        if (!dkimPass && !spfPass) bothFailures += count;

        // Alignment analysis (simplified)
        if (dkimPass && spfPass) {
          alignmentData.bothAligned += count;
        } else if (dkimPass) {
          alignmentData.dkimAlignment += count;
        } else if (spfPass) {
          alignmentData.spfAlignment += count;
        } else {
          alignmentData.neitherAligned += count;
        }
      });

      // Simulate policy impacts
      const simulationResults = [
        {
          policy: 'quarantine',
          affectedEmails: bothFailures,
          affectedPercentage: totalEmails > 0 ? Math.round((bothFailures / totalEmails) * 100) : 0,
          impact: (bothFailures > totalEmails * 0.1 ? 'high' : bothFailures > totalEmails * 0.05 ? 'medium' : 'low') as 'low' | 'medium' | 'high'
        },
        {
          policy: 'reject',
          affectedEmails: bothFailures,
          affectedPercentage: totalEmails > 0 ? Math.round((bothFailures / totalEmails) * 100) : 0,
          impact: (bothFailures > totalEmails * 0.05 ? 'high' : bothFailures > totalEmails * 0.02 ? 'medium' : 'low') as 'low' | 'medium' | 'high'
        }
      ];

      setPolicyData({
        currentPolicy: {
          p: currentReport.policy_p || 'none',
          sp: currentReport.policy_sp || undefined,
          pct: currentReport.policy_pct || 100,
          dkim: currentReport.policy_dkim || 'relaxed',
          spf: currentReport.policy_spf || 'relaxed'
        },
        simulationResults,
        alignmentAnalysis: alignmentData
      });

    } catch (error) {
      console.error('Error fetching policy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'hsl(var(--chart-1))';
      case 'medium': return 'hsl(var(--chart-3))';
      case 'low': return 'hsl(var(--chart-2))';
      default: return 'hsl(var(--muted))';
    }
  };

  const getImpactVariant = (impact: string): "default" | "secondary" | "destructive" => {
    switch (impact) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'default';
      default: return 'secondary';
    }
  };

  const normalizeAlignment = (v?: string) => (v === 'r' ? 'relaxed' : v === 's' ? 'strict' : (v || 'relaxed'));

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Policy Impact Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 animate-pulse bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!policyData) {
    return (
      <div className="text-center p-8">
        <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Policy Data Available</h3>
        <p className="text-gray-600">Upload DMARC reports to analyze policy impact.</p>
      </div>
    );
  }

  const alignmentChartData = [
    { name: 'Both Aligned', value: policyData.alignmentAnalysis.bothAligned, color: 'hsl(var(--chart-2))' },
    { name: 'DKIM Only', value: policyData.alignmentAnalysis.dkimAlignment, color: 'hsl(var(--chart-3))' },
    { name: 'SPF Only', value: policyData.alignmentAnalysis.spfAlignment, color: 'hsl(var(--chart-4))' },
    { name: 'Neither', value: policyData.alignmentAnalysis.neitherAligned, color: 'hsl(var(--chart-1))' }
  ];

  // Custom pie label renderer to avoid overlap for small slices
  const RADIAN = Math.PI / 180;
  const renderAlignmentLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, payload, index } = props;
    const radius = outerRadius + 14;
    let x = cx + radius * Math.cos(-midAngle * RADIAN);
    let y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent < 0.06) {
      y += index % 2 === 0 ? -10 : 10;
    }
    const label = `${payload.name}: ${Number(payload.value).toLocaleString()}`;
    return (
      <text
        x={x}
        y={y}
        fill="hsl(var(--foreground))"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
      >
        {label}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      {/* Current Policy Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Current DMARC Policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={150}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Policy (p)</p>
                <div className="flex items-center gap-1">
                  <Badge variant={policyData.currentPolicy.p === 'none' ? 'secondary' : 'default'}>
                    {policyData.currentPolicy.p}
                  </Badge>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground/80 hover:text-foreground transition-colors"
                        aria-label="About DMARC policy (p)"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-xs">
                        DMARC policy action for failing messages: none (monitor), quarantine (send to spam), reject (block).
                      </div>
                    </TooltipContent>
                  </UITooltip>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Percentage</p>
                <div className="flex items-center gap-1">
                  <p className="text-lg font-bold">{policyData.currentPolicy.pct}%</p>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground/80 hover:text-foreground transition-colors"
                        aria-label="About DMARC pct"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-xs">
                        pct: Percentage of messages the policy applies to. Use lower values for gradual rollout.
                      </div>
                    </TooltipContent>
                  </UITooltip>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">DKIM Mode</p>
                <div className="flex items-center gap-1">
                  <Badge variant="outline">{normalizeAlignment(policyData.currentPolicy.dkim)}</Badge>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground/80 hover:text-foreground transition-colors"
                        aria-label="About adkim"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-xs">
                        DKIM alignment mode (adkim): relaxed (r) allows subdomains; strict (s) requires exact domain match.
                      </div>
                    </TooltipContent>
                  </UITooltip>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">SPF Mode</p>
                <div className="flex items-center gap-1">
                  <Badge variant="outline">{normalizeAlignment(policyData.currentPolicy.spf)}</Badge>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground/80 hover:text-foreground transition-colors"
                        aria-label="About aspf"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-xs">
                        SPF alignment mode (aspf): relaxed (r) allows subdomains; strict (s) requires exact domain match.
                      </div>
                    </TooltipContent>
                  </UITooltip>
                </div>
              </div>
              {policyData.currentPolicy.sp && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Subdomain Policy</p>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{policyData.currentPolicy.sp}</Badge>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center text-muted-foreground/80 hover:text-foreground transition-colors"
                          aria-label="About DMARC subdomain policy (sp)"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="max-w-xs">
                          Policy for subdomains (sp). If not set, subdomains inherit the main policy (p).
                        </div>
                      </TooltipContent>
                    </UITooltip>
                  </div>
                </div>
              )}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Tabs defaultValue="simulation" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="simulation">Policy Simulation</TabsTrigger>
          <TabsTrigger value="alignment">Alignment Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="simulation" className="space-y-6">
          {/* Policy Simulation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Policy Impact Simulation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                See what would happen if you changed your DMARC policy
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {policyData.simulationResults.map((simulation) => (
                  <Card key={simulation.policy} className="border-2">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="capitalize">Policy: {simulation.policy}</span>
                        <Badge variant={getImpactVariant(simulation.impact)}>
                          {simulation.impact} impact
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Affected Emails</p>
                          <p className="text-2xl font-bold">
                            {simulation.affectedEmails.toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {simulation.affectedPercentage}% of total volume
                          </p>
                        </div>
                        
                        <div className="pt-4 border-t">
                          <h4 className="font-medium mb-2">Recommendations:</h4>
                          <div className="text-sm text-muted-foreground space-y-1">
                            {simulation.impact === 'high' && (
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                                <span>High impact detected. Consider gradual rollout starting at lower percentage.</span>
                              </div>
                            )}
                            {simulation.impact === 'medium' && (
                              <div className="flex items-start gap-2">
                                <Target className="w-4 h-4 text-yellow-500 mt-0.5" />
                                <span>Moderate impact. Monitor authentication failures before implementing.</span>
                              </div>
                            )}
                            {simulation.impact === 'low' && (
                              <div className="flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                <span>Low impact. Safe to implement with proper monitoring.</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Gradual Rollout Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Gradual Rollout Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm flex items-center justify-center">1</span>
                      Start Conservative
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Begin with p=quarantine at 25% to test impact on legitimate mail flow.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-600 text-sm flex items-center justify-center">2</span>
                      Monitor & Adjust
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Gradually increase percentage (50%, 75%, 100%) while monitoring feedback.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 text-sm flex items-center justify-center">3</span>
                      Full Enforcement
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Move to p=reject only after confirming minimal impact on legitimate emails.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alignment" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alignment Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Alignment Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={alignmentChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={84}
                        dataKey="value"
                        paddingAngle={2}
                        label={renderAlignmentLabel}
                        labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                      >
                        {alignmentChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value.toLocaleString(), "Emails"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Alignment Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Alignment Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Both DKIM & SPF Aligned</span>
                    </div>
                    <Badge variant="default">
                      {policyData.alignmentAnalysis.bothAligned.toLocaleString()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600" />
                      <span>DKIM Aligned Only</span>
                    </div>
                    <Badge variant="secondary">
                      {policyData.alignmentAnalysis.dkimAlignment.toLocaleString()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-purple-600" />
                      <span>SPF Aligned Only</span>
                    </div>
                    <Badge variant="secondary">
                      {policyData.alignmentAnalysis.spfAlignment.toLocaleString()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span>Neither Aligned</span>
                    </div>
                    <Badge variant="destructive">
                      {policyData.alignmentAnalysis.neitherAligned.toLocaleString()}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alignment Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Alignment Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {policyData.alignmentAnalysis.neitherAligned > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-800">Critical: Unaligned Messages</h4>
                        <p className="text-sm text-red-700 mt-1">
                          {policyData.alignmentAnalysis.neitherAligned.toLocaleString()} emails have neither DKIM nor SPF alignment. 
                          These would be rejected under a strict policy.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-800">Optimization Opportunity</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Focus on improving SPF and DKIM setup for sources that only pass one authentication method.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PolicySimulator;