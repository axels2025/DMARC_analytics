import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from "recharts";
import { Shield, AlertTriangle, TrendingUp, Mail, Users, Clock, Info, CheckCircle, XCircle, Check } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { fetchTrustedRules, setTrustLevel, clearTrustLevel, validateIPOrCIDR, type TrustedRule } from "@/utils/ipIntelligence";
import { toast } from "@/hooks/use-toast";
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

  // Whitelist manager state
  const [trustedRules, setTrustedRules] = useState<TrustedRule[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [rulesLoading, setRulesLoading] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteEditingRule, setNoteEditingRule] = useState<TrustedRule | null>(null);
  const [noteValue, setNoteValue] = useState("");

  // Add IP dialog state
  const [addIpOpen, setAddIpOpen] = useState(false);
  const [newIpValue, setNewIpValue] = useState("");
  const [newTrustLevel, setNewTrustLevel] = useState<'trusted' | 'blocked'>('trusted');
  const [newIpNote, setNewIpNote] = useState("");
  const [ipValidation, setIpValidation] = useState<{valid: boolean; error?: string}>({ valid: true });

  // Confirmed events state
  const [confirmedEvents, setConfirmedEvents] = useState<Set<string>>(new Set());

  // Create a unique key for each event based on type and IP
  const getEventKey = (event: SecurityEvent): string => {
    return `${event.type}-${event.details?.ip || 'unknown'}-${selectedDomain}`;
  };

  // Load confirmed events from localStorage on mount
  useEffect(() => {
    if (user && selectedDomain) {
      const key = `confirmed-events-${user.id}-${selectedDomain}`;
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          setConfirmedEvents(new Set(parsed));
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [user, selectedDomain]);

  // Derived colors using design tokens
  const threatColor = useMemo(() => {
    if (!metrics) return "";
    if (metrics.threatScore >= 70) return "hsl(var(--destructive))";
    if (metrics.threatScore >= 40) return "hsl(var(--chart-3))"; // warning
    return "hsl(var(--chart-2))"; // low/green
  }, [metrics]);

  // Filter out confirmed events from display
  const filteredSecurityEvents = useMemo(() => {
    return securityEvents.filter(event => {
      const eventKey = getEventKey(event);
      return !confirmedEvents.has(eventKey);
    });
  }, [securityEvents, confirmedEvents, selectedDomain]);
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

  // Whitelist management helpers
  const getRuleKey = (r: TrustedRule) => (r as any).id ?? `${(r as any).domain}:${(r as any).ip_address ?? (r as any).ip_range}`;
  const getRuleDisplayIp = (r: TrustedRule) => ((r as any).ip_address ?? (r as any).ip_range ?? '') as string;

  const loadTrusted = async () => {
    if (!user || !selectedDomain) {
      setTrustedRules([]);
      return;
    }
    setRulesLoading(true);
    try {
      const rules = await fetchTrustedRules(user.id, selectedDomain);
      setTrustedRules(rules);
    } catch (e) {
      console.error('Error loading trusted rules:', e);
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadTrusted();
    }
  }, [user, selectedDomain]);

  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedRuleIds(new Set(trustedRules.map(getRuleKey)));
    else setSelectedRuleIds(new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedRuleIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const updateTrust = async (targets: TrustedRule[], trust: 'trusted' | 'blocked') => {
    if (!user || !selectedDomain) return;
    try {
      for (const r of targets) {
        const target = getRuleDisplayIp(r);
        await setTrustLevel(user.id, selectedDomain, target, trust, (r as any).notes ?? undefined);
      }
      await loadTrusted();
      toast({ title: trust === 'trusted' ? 'Marked as Trusted' : 'Marked as Blocked', description: `${targets.length} rule(s) updated.` });
      setSelectedRuleIds(new Set());
    } catch (error) {
      console.error('Error updating trust level:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to update trust level',
        variant: 'destructive' 
      });
    }
  };

  const removeRules = async (targets: TrustedRule[]) => {
    if (!user || !selectedDomain) return;
    try {
      for (const r of targets) {
        const target = getRuleDisplayIp(r);
        await clearTrustLevel(user.id, selectedDomain, target);
      }
      await loadTrusted();
      toast({ title: 'Removed', description: `${targets.length} rule(s) removed.` });
      setSelectedRuleIds(new Set());
    } catch (error) {
      console.error('Error removing rules:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to remove rules',
        variant: 'destructive' 
      });
    }
  };

  const openNoteEditor = (r: TrustedRule) => {
    setNoteEditingRule(r);
    setNoteValue(((r as any).notes ?? '') as string);
    setNoteOpen(true);
  };

  const saveNote = async () => {
    if (!user || !selectedDomain || !noteEditingRule) return;
    try {
      const trust = ((noteEditingRule as any).trust_level ?? 'trusted') as 'trusted' | 'blocked';
      const target = getRuleDisplayIp(noteEditingRule);
      await setTrustLevel(user.id, selectedDomain, target, trust, noteValue);
      setNoteOpen(false);
      setNoteEditingRule(null);
      setNoteValue('');
      await loadTrusted();
      toast({ title: 'Note saved' });
    } catch (error) {
      console.error('Error saving note:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to save note',
        variant: 'destructive' 
      });
    }
  };

  // Validate IP input in real-time
  const handleIpInputChange = (value: string) => {
    setNewIpValue(value);
    if (value.trim() === '') {
      setIpValidation({ valid: true });
    } else {
      const validation = validateIPOrCIDR(value);
      setIpValidation(validation);
    }
  };

  const addNewIp = async () => {
    if (!user || !selectedDomain || !newIpValue.trim()) return;
    
    const validation = validateIPOrCIDR(newIpValue);
    if (!validation.valid) {
      setIpValidation(validation);
      return;
    }

    try {
      await setTrustLevel(user.id, selectedDomain, newIpValue.trim(), newTrustLevel, newIpNote.trim() || undefined);
      setAddIpOpen(false);
      setNewIpValue('');
      setNewTrustLevel('trusted');
      setNewIpNote('');
      setIpValidation({ valid: true });
      await loadTrusted();
      toast({ 
        title: 'IP Added', 
        description: `${newIpValue.trim()} has been marked as ${newTrustLevel}`
      });
    } catch (error) {
      console.error('Error adding IP:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to add IP',
        variant: 'destructive' 
      });
    }
  };

  // Quick actions for security events
  const handleQuickTrust = async (ip: string, trust: 'trusted' | 'blocked') => {
    if (!user || !selectedDomain) return;
    
    try {
      await setTrustLevel(user.id, selectedDomain, ip, trust, `Quick ${trust} from security event`);
      await loadTrusted();
      toast({ 
        title: `IP ${trust === 'trusted' ? 'Trusted' : 'Blocked'}`, 
        description: `${ip} has been marked as ${trust}`
      });
    } catch (error) {
      console.error('Error setting trust level:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : `Failed to mark IP as ${trust}`,
        variant: 'destructive' 
      });
    }
  };

  // Handle confirming/dismissing an event
  const handleConfirmEvent = (event: SecurityEvent) => {
    if (!user || !selectedDomain) return;
    
    const eventKey = getEventKey(event);
    const newConfirmed = new Set(confirmedEvents);
    newConfirmed.add(eventKey);
    setConfirmedEvents(newConfirmed);
    
    // Save to localStorage
    const key = `confirmed-events-${user.id}-${selectedDomain}`;
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(newConfirmed)));
      toast({ 
        title: 'Event Confirmed', 
        description: 'This warning has been dismissed and will not appear again unless the IP reappears in new reports.'
      });
    } catch {
      // Ignore localStorage errors but still update UI
      toast({ 
        title: 'Event Confirmed', 
        description: 'This warning has been dismissed for this session.'
      });
    }
  };

  const getRiskExplanation = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return 'Active attack indicators (spoofing or massive spikes). Act immediately.';
      case 'medium':
        return 'Suspicious behavior (auth failures, new IPs). Investigate and trust/block.';
      default:
        return 'Minor anomalies. Monitor and review periodically.';
    }
  };

  const getEventExplanation = (type: SecurityEvent['type']) => {
    switch (type) {
      case 'spoofing':
        return 'Sender domain mismatches your policy domain. Tighten DMARC and verify sources.';
      case 'auth_failure':
        return 'DKIM/SPF failed. Fix DNS/auth config or block if unauthorized.';
      case 'new_ip':
        return 'First time we see this IP. Verify sender and mark as Trusted or Blocked.';
      case 'volume_spike':
        return 'Sudden surge from an IP. Investigate campaign or potential compromise.';
      default:
        return 'Security-relevant activity detected.';
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
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => document.getElementById('ip-whitelist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Manage Whitelist
        </Button>
      </div>
      {/* Security Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  Threat Score
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{getRiskExplanation(metrics.threatScore >= 70 ? 'high' : metrics.threatScore >= 40 ? 'medium' : 'low')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <p className="text-2xl font-bold" style={{ color: threatColor }}>
                  {metrics.threatScore}/100
                </p>
              </div>
              <Shield className="w-8 h-8" style={{ color: threatColor }} />
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
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  New IPs
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>New senders are flagged as medium risk until verified and trusted.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
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
                  <RechartsTooltip />
                  <Legend verticalAlign="top" align="right" />
                  <Area 
                    type="monotone" 
                    dataKey="spoofingAttempts" 
                    stackId="1"
                    stroke="hsl(var(--chart-1))" 
                    fill="hsl(var(--chart-1))" 
                    name="Spoofing Attempts"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="authFailures" 
                    stackId="1"
                    stroke="hsl(var(--chart-3))" 
                    fill="hsl(var(--chart-3))" 
                    name="Authentication Failures"
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
              {filteredSecurityEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="p-1 rounded-full bg-accent">
                    {getTypeIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{event.description}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={getSeverityVariant(event.severity)} className="ml-2">
                          {event.severity}
                        </Badge>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-4 h-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{getRiskExplanation(event.severity)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getEventExplanation(event.type)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                    {/* Quick actions for new IP events */}
                    {event.type === 'new_ip' && event.details?.ip && selectedDomain && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickTrust(event.details.ip, 'trusted')}
                          className="h-6 text-xs flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Trust
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickTrust(event.details.ip, 'blocked')}
                          className="h-6 text-xs flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" />
                          Block
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleConfirmEvent(event)}
                          className="h-6 text-xs flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Confirm
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {filteredSecurityEvents.length === 0 && (
                <div className="text-center py-8">
                  <Shield className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No security events detected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Events Table */}
      {filteredSecurityEvents.length > 8 && (
        <Card>
          <CardHeader>
            <CardTitle>All Security Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredSecurityEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    {getTypeIcon(event.type)}
                    <div>
                      <p className="font-medium text-sm">{event.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                      {/* Quick actions for new IP events */}
                      {event.type === 'new_ip' && event.details?.ip && selectedDomain && (
                        <div className="flex items-center gap-2 mt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQuickTrust(event.details.ip, 'trusted')}
                            className="h-6 text-xs flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Trust
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQuickTrust(event.details.ip, 'blocked')}
                            className="h-6 text-xs flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            Block
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleConfirmEvent(event)}
                            className="h-6 text-xs flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Confirm
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getSeverityVariant(event.severity)}>
                      {event.severity}
                    </Badge>
                  </div>
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
                  <div className="flex-1">
                    <h4 className="font-medium text-red-800">High Threat Level Detected</h4>
                    <p className="text-sm text-red-700 mt-1">
                      Immediate action required. Consider implementing stricter DMARC policies and review authentication setup.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => document.getElementById('ip-whitelist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    Open Whitelist Manager
                  </Button>
                </div>
              </div>
            )}
            
            {metrics.spoofingAttempts > 0 && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-orange-800">Spoofing Activity</h4>
                    <p className="text-sm text-orange-700 mt-1">
                      {metrics.spoofingAttempts} spoofing attempts detected. Consider moving to a stricter DMARC policy.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => document.getElementById('ip-whitelist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    Review Trusted IPs
                  </Button>
                </div>
              </div>
            )}
            
            {metrics.newIPsDetected > 10 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Users className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-yellow-800">Many New IP Addresses</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      {metrics.newIPsDetected} new IPs detected. Verify senders and mark legitimate sources as Trusted.
                    </p>
                  </div>
                  <Button
                    onClick={() => document.getElementById('ip-whitelist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    Open Whitelist Manager
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trusted/Blocked IPs */}
      <Card id="ip-whitelist">
        <CardHeader>
          <CardTitle>Trusted/Blocked IPs</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedDomain ? (
            <p className="text-sm text-muted-foreground">
              Select a domain to manage its whitelist and blocklist.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  onClick={() => setAddIpOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add IP/Range
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => updateTrust(trustedRules.filter(r => selectedRuleIds.has(getRuleKey(r))), 'trusted')}
                  disabled={trustedRules.length === 0 || selectedRuleIds.size === 0}
                >
                  Mark as Trusted
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => updateTrust(trustedRules.filter(r => selectedRuleIds.has(getRuleKey(r))), 'blocked')}
                  disabled={trustedRules.length === 0 || selectedRuleIds.size === 0}
                >
                  Mark as Blocked
                </Button>
                <Button
                  variant="outline"
                  onClick={() => removeRules(trustedRules.filter(r => selectedRuleIds.has(getRuleKey(r))))}
                  disabled={trustedRules.length === 0 || selectedRuleIds.size === 0}
                >
                  Remove Selected
                </Button>
                <div className="ml-auto">
                  <Button variant="outline" onClick={loadTrusted}>Refresh</Button>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={trustedRules.length > 0 && selectedRuleIds.size === trustedRules.length}
                          onCheckedChange={(c) => toggleAll(Boolean(c))}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>IP / Range</TableHead>
                      <TableHead>Trust Level</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rulesLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          Loading rules...
                        </TableCell>
                      </TableRow>
                    ) : trustedRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          No trusted or blocked IPs yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      trustedRules.map((r) => {
                        const id = getRuleKey(r);
                        const ip = getRuleDisplayIp(r);
                        const trust = ((r as any).trust_level ?? '') as string;
                        const note = ((r as any).notes ?? '') as string;
                        const isChecked = selectedRuleIds.has(id);
                        return (
                          <TableRow key={id}>
                            <TableCell>
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(c) => toggleOne(id, Boolean(c))}
                                aria-label={`Select ${ip}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono">{ip}</TableCell>
                            <TableCell>
                              <Badge variant={trust === 'blocked' ? 'destructive' : trust === 'trusted' ? 'default' : 'secondary'}>
                                {trust || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[280px] truncate" title={note || undefined}>
                              {note || '—'}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button variant="secondary" size="sm" onClick={() => updateTrust([r], 'trusted')}>
                                Mark Trusted
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => updateTrust([r], 'blocked')}>
                                Mark Blocked
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openNoteEditor(r)}>
                                Edit Note
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => removeRules([r])}>
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            placeholder="Why is this IP trusted or blocked?"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button onClick={saveNote}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addIpOpen} onOpenChange={setAddIpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add IP Address or CIDR Range</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ip-input">IP Address or CIDR Range</Label>
              <Input
                id="ip-input"
                value={newIpValue}
                onChange={(e) => handleIpInputChange(e.target.value)}
                placeholder="192.168.1.1 or 192.168.1.0/24"
                className={!ipValidation.valid ? "border-red-500" : ""}
              />
              {!ipValidation.valid && ipValidation.error && (
                <p className="text-sm text-red-600">{ipValidation.error}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Enter a single IP address (e.g., 192.168.1.1) or a CIDR range (e.g., 192.168.1.0/24)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="trust-level">Trust Level</Label>
              <Select value={newTrustLevel} onValueChange={(value: 'trusted' | 'blocked') => setNewTrustLevel(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trusted">Trusted</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note-input">Notes (Optional)</Label>
              <Textarea
                id="note-input"
                value={newIpNote}
                onChange={(e) => setNewIpNote(e.target.value)}
                placeholder="Why is this IP/range trusted or blocked?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddIpOpen(false)}>Cancel</Button>
            <Button 
              onClick={addNewIp} 
              disabled={!newIpValue.trim() || !ipValidation.valid}
            >
              Add IP/Range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SecurityMonitoring;