import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts";
import { Shield, AlertTriangle, TrendingUp, Mail, Users, Clock } from "lucide-react";

interface SecurityEvent {
  id: string;
  type: 'spoofing' | 'volume_spike' | 'new_ip' | 'auth_failure';
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp: string;
  details: Record<string, any>;
}

interface SecurityMetrics {
  spoofingAttempts: number;
  newIPsDetected: number;
  volumeSpikes: number;
  suspiciousActivity: number;
  threatScore: number;
}

interface ThreatData {
  date: string;
  spoofingAttempts: number;
  authFailures: number;
  newIPs: number;
  totalThreats: number;
}

interface SecurityMonitoringProps {
  selectedDomain?: string;
}

const SecurityMonitoring = ({ selectedDomain }: SecurityMonitoringProps) => {
  const { user } = useAuth();
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [threatTrends, setThreatTrends] = useState<ThreatData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSecurityData();
    }
  }, [user, selectedDomain]);

  const fetchSecurityData = async () => {
    try {
      let recordsQuery = supabase
        .from('dmarc_records')
        .select(`
          source_ip,
          count,
          dkim_result,
          spf_result,
          header_from,
          created_at,
          dmarc_reports!inner(user_id, policy_domain, domain)
        `)
        .eq('dmarc_reports.user_id', user?.id);

      if (selectedDomain) {
        recordsQuery = recordsQuery.eq('dmarc_reports.domain', selectedDomain);
      }

      const { data: records, error } = await recordsQuery.order('created_at', { ascending: false });

      if (error) throw error;

      if (!records || records.length === 0) {
        setMetrics(null);
        setSecurityEvents([]);
        setThreatTrends([]);
        return;
      }

      // Process security events and metrics
      const events: SecurityEvent[] = [];
      const ipFirstSeen = new Map<string, string>();
      const dailyData = new Map<string, any>();
      
      let spoofingAttempts = 0;
      let newIPsDetected = 0;
      let volumeSpikes = 0;
      let authFailures = 0;

      // Group records by date for trend analysis
      records.forEach(record => {
        const date = new Date(record.created_at as string).toDateString();
        const ip = record.source_ip as string;
        const count = record.count as number;
        const dkimPass = record.dkim_result === 'pass';
        const spfPass = record.spf_result === 'pass';
        const headerFrom = record.header_from as string;
        const policyDomain = (record as any).dmarc_reports?.policy_domain;

        if (!dailyData.has(date)) {
          dailyData.set(date, {
            date,
            spoofingAttempts: 0,
            authFailures: 0,
            newIPs: new Set(),
            totalThreats: 0,
            emailVolume: 0
          });
        }

        const dayData = dailyData.get(date);
        dayData.emailVolume += count;

        // Track first seen IPs
        if (!ipFirstSeen.has(ip)) {
          ipFirstSeen.set(ip, record.created_at as string);
          newIPsDetected++;
          dayData.newIPs.add(ip);
          
          // Generate new IP event
          events.push({
            id: `new-ip-${ip}-${Date.now()}`,
            type: 'new_ip',
            severity: 'medium',
            description: `New IP address detected: ${ip}`,
            timestamp: record.created_at as string,
            details: { ip, firstEmail: count }
          });
        }

        // Detect spoofing attempts (header_from doesn't match policy domain)
        if (policyDomain && headerFrom && !headerFrom.includes(policyDomain)) {
          spoofingAttempts += count;
          dayData.spoofingAttempts += count;
          
          events.push({
            id: `spoofing-${ip}-${Date.now()}`,
            type: 'spoofing',
            severity: 'high',
            description: `Potential spoofing: emails from ${headerFrom} claiming to be from ${policyDomain}`,
            timestamp: record.created_at as string,
            details: { ip, headerFrom, policyDomain, count }
          });
        }

        // Authentication failures
        if (!dkimPass || !spfPass) {
          authFailures += count;
          dayData.authFailures += count;
          
          if (!dkimPass && !spfPass) {
            events.push({
              id: `auth-fail-${ip}-${Date.now()}`,
              type: 'auth_failure',
              severity: 'medium',
              description: `Complete authentication failure from ${ip}`,
              timestamp: record.created_at as string,
              details: { ip, dkimResult: record.dkim_result, spfResult: record.spf_result, count }
            });
          }
        }

        // Volume spike detection (simplified)
        if (count > 1000) {
          volumeSpikes++;
          events.push({
            id: `volume-spike-${ip}-${Date.now()}`,
            type: 'volume_spike',
            severity: count > 5000 ? 'high' : 'medium',
            description: `High volume detected: ${count.toLocaleString()} emails from ${ip}`,
            timestamp: record.created_at as string,
            details: { ip, volume: count }
          });
        }
      });

      // Calculate threat score (0-100)
      const totalEmails = records.reduce((sum, r) => sum + (r.count as number), 0);
      const threatScore = Math.min(100, Math.round(
        (spoofingAttempts / Math.max(totalEmails, 1)) * 50 +
        (authFailures / Math.max(totalEmails, 1)) * 30 +
        (newIPsDetected / Math.max(records.length, 1)) * 20
      ));

      // Process daily trend data
      const trendData = Array.from(dailyData.values())
        .map(day => ({
          date: new Date(day.date).toLocaleDateString(),
          spoofingAttempts: day.spoofingAttempts,
          authFailures: day.authFailures,
          newIPs: day.newIPs.size,
          totalThreats: day.spoofingAttempts + day.authFailures + day.newIPs.size
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-14); // Last 14 days

      setMetrics({
        spoofingAttempts,
        newIPsDetected,
        volumeSpikes,
        suspiciousActivity: events.filter(e => e.severity === 'high').length,
        threatScore
      });

      setSecurityEvents(events.slice(0, 20)); // Latest 20 events
      setThreatTrends(trendData);

    } catch (error) {
      console.error('Error fetching security data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'hsl(var(--chart-1))';
      case 'medium': return 'hsl(var(--chart-3))';
      case 'low': return 'hsl(var(--chart-2))';
      default: return 'hsl(var(--muted))';
    }
  };

  const getSeverityVariant = (severity: string): "default" | "secondary" | "destructive" => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'default';
      default: return 'secondary';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'spoofing': return <Shield className="w-4 h-4" />;
      case 'volume_spike': return <TrendingUp className="w-4 h-4" />;
      case 'new_ip': return <Users className="w-4 h-4" />;
      case 'auth_failure': return <AlertTriangle className="w-4 h-4" />;
      default: return <Mail className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Security Monitoring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 animate-pulse bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center p-8">
        <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Security Data Available</h3>
        <p className="text-gray-600">Upload DMARC reports to monitor security threats.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Threat Score</p>
                <p className={`text-2xl font-bold ${metrics.threatScore >= 70 ? 'text-red-600' : metrics.threatScore >= 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {metrics.threatScore}/100
                </p>
              </div>
              <Shield className={`w-8 h-8 ${metrics.threatScore >= 70 ? 'text-red-600' : metrics.threatScore >= 40 ? 'text-yellow-600' : 'text-green-600'}`} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Spoofing Attempts</p>
                <p className="text-2xl font-bold text-red-600">{metrics.spoofingAttempts}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">New IPs</p>
                <p className="text-2xl font-bold text-orange-600">{metrics.newIPsDetected}</p>
              </div>
              <Users className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Volume Spikes</p>
                <p className="text-2xl font-bold text-purple-600">{metrics.volumeSpikes}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">High Severity</p>
                <p className="text-2xl font-bold text-red-600">{metrics.suspiciousActivity}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Threat Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Threat Trends (14 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={threatTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="spoofingAttempts" 
                    stackId="1"
                    stroke="hsl(var(--chart-1))" 
                    fill="hsl(var(--chart-1))" 
                    name="Spoofing"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="authFailures" 
                    stackId="1"
                    stroke="hsl(var(--chart-3))" 
                    fill="hsl(var(--chart-3))" 
                    name="Auth Failures"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="newIPs" 
                    stackId="1"
                    stroke="hsl(var(--chart-4))" 
                    fill="hsl(var(--chart-4))" 
                    name="New IPs"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Security Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Recent Security Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {securityEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className={`p-1 rounded-full ${event.severity === 'high' ? 'bg-red-100' : event.severity === 'medium' ? 'bg-yellow-100' : 'bg-green-100'}`}>
                    {getTypeIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{event.description}</p>
                      <Badge variant={getSeverityVariant(event.severity)} className="ml-2">
                        {event.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              
              {securityEvents.length === 0 && (
                <div className="text-center py-8">
                  <Shield className="w-8 h-8 mx-auto text-green-600 mb-2" />
                  <p className="text-sm text-muted-foreground">No security events detected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Events Table */}
      {securityEvents.length > 8 && (
        <Card>
          <CardHeader>
            <CardTitle>All Security Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {securityEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    {getTypeIcon(event.type)}
                    <div>
                      <p className="font-medium text-sm">{event.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant={getSeverityVariant(event.severity)}>
                    {event.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Security Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.threatScore >= 70 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-800">High Threat Level Detected</h4>
                    <p className="text-sm text-red-700 mt-1">
                      Immediate action required. Consider implementing stricter DMARC policies and review authentication setup.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {metrics.spoofingAttempts > 0 && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-orange-800">Spoofing Activity</h4>
                    <p className="text-sm text-orange-700 mt-1">
                      {metrics.spoofingAttempts} spoofing attempts detected. Consider moving to a stricter DMARC policy.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {metrics.newIPsDetected > 10 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Users className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Many New IP Addresses</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      {metrics.newIPsDetected} new IPs detected. Review and whitelist legitimate sending sources.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SecurityMonitoring;