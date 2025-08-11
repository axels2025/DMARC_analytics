import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Cell, PieChart, Pie } from "recharts";
import { Globe, MapPin, Shield, AlertTriangle, TrendingUp, Users } from "lucide-react";
import { classifyIPs, IPClassification, setTrustLevel, clearTrustLevel } from "@/utils/ipIntelligence";

interface IPData {
  ip: string;
  emailCount: number;
  successRate: number;
  location: string;
  riskScore: number;
  firstSeen: string;
  lastSeen: string;
  isAuthorized: boolean;
  category?: IPClassification["category"];
  provider?: string | null;
  hostname?: string | null;
  confidence?: number;
}


interface GeographicData {
  country: string;
  emailCount: number;
  ipCount: number;
  successRate: number;
}

interface IPIntelligenceProps {
  selectedDomain?: string;
}

const IPIntelligence = ({ selectedDomain }: IPIntelligenceProps) => {
  const { user } = useAuth();
  const [ipData, setIpData] = useState<IPData[]>([]);
  const [geoData, setGeoData] = useState<GeographicData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIP, setSelectedIP] = useState<IPData | null>(null);

  useEffect(() => {
    if (user) {
      fetchIPIntelligence();
    }
  }, [user, selectedDomain]);

  const fetchIPIntelligence = async () => {
    try {
      let recordsQuery = supabase
        .from('dmarc_records')
        .select(`
          source_ip,
          count,
          dkim_result,
          spf_result,
          created_at,
          dmarc_reports!inner(user_id, domain)
        `)
        .eq('dmarc_reports.user_id', user?.id);

      if (selectedDomain) {
        recordsQuery = recordsQuery.eq('dmarc_reports.domain', selectedDomain);
      }

      const { data, error } = await recordsQuery;

      if (error) throw error;

      // Process IP data
      const ipMap = new Map<string, any>();
      const countryMap = new Map<string, any>();

      data?.forEach(record => {
        const ip = record.source_ip as string;
        const isSuccess = (record.dkim_result === 'pass' || record.spf_result === 'pass');
        
        // Mock geolocation (in real app, use IP geolocation service)
        const mockLocation = getMockLocation(ip);
        
        if (!ipMap.has(ip)) {
          ipMap.set(ip, {
            ip,
            emailCount: 0,
            successCount: 0,
            location: mockLocation.city + ", " + mockLocation.country,
            country: mockLocation.country,
            firstSeen: record.created_at as string,
            lastSeen: record.created_at as string,
          });
        }
        
        const ipEntry = ipMap.get(ip);
        ipEntry.emailCount += record.count as number;
        
        if (isSuccess) {
          ipEntry.successCount += record.count as number;
        }
        
        if (new Date(record.created_at as string) < new Date(ipEntry.firstSeen)) {
          ipEntry.firstSeen = record.created_at as string;
        }
        if (new Date(record.created_at as string) > new Date(ipEntry.lastSeen)) {
          ipEntry.lastSeen = record.created_at as string;
        }
        
        // Country aggregation
        if (!countryMap.has(mockLocation.country)) {
          countryMap.set(mockLocation.country, {
            country: mockLocation.country,
            emailCount: 0,
            ipCount: new Set(),
            successCount: 0
          });
        }
        
        const countryEntry = countryMap.get(mockLocation.country);
        countryEntry.emailCount += record.count as number;
        countryEntry.ipCount.add(ip);
        if (isSuccess) {
          countryEntry.successCount += record.count as number;
        }
      });

      // Classify IPs
      const ips = Array.from(ipMap.keys());
      const classMap = user ? await classifyIPs(ips, user.id, selectedDomain) : new Map<string, IPClassification>();

      // Calculate risk scores and process data
      const processedIPs = Array.from(ipMap.values()).map(entry => {
        const cls = classMap.get(entry.ip);
        const isAuthorized = cls ? cls.authorized : false;
        return {
          ip: entry.ip,
          emailCount: entry.emailCount,
          successRate: entry.emailCount > 0 ? Math.round((entry.successCount / entry.emailCount) * 100) : 0,
          location: entry.location,
          riskScore: calculateRiskScore(entry, cls || null),
          firstSeen: new Date(entry.firstSeen).toLocaleDateString(),
          lastSeen: new Date(entry.lastSeen).toLocaleDateString(),
          isAuthorized,
          category: cls?.category,
          provider: cls?.provider ?? null,
          hostname: cls?.hostname ?? null,
          confidence: cls?.confidence,
        } as IPData;
      }).sort((a, b) => b.emailCount - a.emailCount);

      const processedCountries = Array.from(countryMap.values()).map(entry => ({
        country: entry.country,
        emailCount: entry.emailCount,
        ipCount: entry.ipCount.size,
        successRate: entry.emailCount > 0 ? Math.round((entry.successCount / entry.emailCount) * 100) : 0
      })).sort((a, b) => b.emailCount - a.emailCount);

      setIpData(processedIPs);
      setGeoData(processedCountries);
    } catch (error) {
      console.error('Error fetching IP intelligence:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMockLocation = (ip: string) => {
    // Mock geolocation data - in real app, use IP geolocation service
    const locations = [
      { city: "San Francisco", country: "United States" },
      { city: "London", country: "United Kingdom" },
      { city: "Amsterdam", country: "Netherlands" },
      { city: "Singapore", country: "Singapore" },
      { city: "Sydney", country: "Australia" },
      { city: "Frankfurt", country: "Germany" }
    ];
    
    // Use IP to consistently return same location
    const hash = ip.split('.').reduce((acc, part) => acc + parseInt(part), 0);
    return locations[hash % locations.length];
  };

  const isKnownAuthorizedIP = (ip: string) => {
    // Mock authorized IP detection - in real app, maintain whitelist
    const authorizedRanges = ['54.', '52.', '34.', '35.']; // Common cloud provider prefixes
    return authorizedRanges.some(range => ip.startsWith(range));
  };

  const calculateRiskScore = (entry: any, cls: IPClassification | null) => {
    let score = 0;
    
    // Low success rate increases risk
    const successRate = entry.emailCount > 0 ? (entry.successCount / entry.emailCount) * 100 : 0;
    if (successRate < 50) score += 40;
    else if (successRate < 80) score += 20;
    
    // Classification impact
    if (cls) {
      if (cls.category === 'suspicious') score += 30;
      else if (cls.category === 'unknown') score += 15;
      else if (cls.category === 'authorized' || cls.category === 'esp') score -= 10;
      // lower confidence increases risk slightly
      if (cls.confidence < 40) score += 10; else if (cls.confidence > 80) score -= 5;
    }
    
    // High volume from unknown/unauthorized IP increases risk
    if (!(cls?.authorized) && entry.emailCount > 100) score += 30;
    
    // New IP increases risk
    const daysSinceFirst = (Date.now() - new Date(entry.firstSeen).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFirst < 7) score += 20;
    
    return Math.max(0, Math.min(100, score));
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return "hsl(var(--chart-1))"; // Red
    if (score >= 40) return "hsl(var(--chart-3))"; // Yellow
    return "hsl(var(--chart-2))"; // Green
  };

  const getRiskVariant = (score: number): "default" | "secondary" | "destructive" => {
    if (score >= 70) return "destructive";
    if (score >= 40) return "secondary";
    return "default";
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>IP Intelligence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 animate-pulse bg-muted rounded"></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Geographic Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 animate-pulse bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const highRiskIPs = ipData.filter(ip => ip.riskScore >= 70);
  const unauthorizedIPs = ipData.filter(ip => !ip.isAuthorized);
  const avgSuccessRate = ipData.length > 0 ? Math.round(ipData.reduce((acc, ip) => acc + ip.successRate, 0) / ipData.length) : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total IPs</p>
                <p className="text-2xl font-bold">{ipData.length}</p>
              </div>
              <Globe className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">High Risk IPs</p>
                <p className="text-2xl font-bold text-red-600">{highRiskIPs.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unauthorized IPs</p>
                <p className="text-2xl font-bold text-orange-600">{unauthorizedIPs.length}</p>
              </div>
              <Shield className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Success Rate</p>
                <p className="text-2xl font-bold text-green-600">{avgSuccessRate}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top IPs by Risk */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              IP Risk Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {ipData.slice(0, 10).map((ip) => (
                <div 
                  key={ip.ip} 
                  className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedIP(ip)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${ip.isAuthorized ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                    <div>
                      <p className="font-medium font-mono text-sm">{ip.ip}</p>
                      <p className="text-xs text-muted-foreground">
                        {ip.location} • {ip.emailCount.toLocaleString()} emails
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={getRiskVariant(ip.riskScore)}>
                      Risk: {ip.riskScore}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ip.successRate}% success
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Geographic Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Geographic Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={geoData.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="emailCount"
                    label={({ country, emailCount }) => `${country}: ${emailCount}`}
                  >
                    {geoData.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name) => [`${value.toLocaleString()} emails`, "Volume"]}
                    labelFormatter={(country) => `Country: ${country}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Countries Detail */}
      <Card>
        <CardHeader>
          <CardTitle>Country-wise Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {geoData.map((country) => (
              <div key={country.country} className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{country.country}</p>
                    <p className="text-sm text-muted-foreground">
                      {country.ipCount} IPs • {country.emailCount.toLocaleString()} emails
                    </p>
                  </div>
                </div>
                <Badge variant={country.successRate >= 80 ? "default" : country.successRate >= 60 ? "secondary" : "destructive"}>
                  {country.successRate}% success
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* IP Detail Modal */}
      {selectedIP && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                IP Details: {selectedIP.ip}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setSelectedIP(null)}>
                ✕
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Location</p>
                <p className="text-sm">{selectedIP.location}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email Volume</p>
                <p className="text-sm">{selectedIP.emailCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                <p className="text-sm">{selectedIP.successRate}%</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Authorization</p>
                <p className="text-sm">{selectedIP.isAuthorized ? "✓ Authorized" : "⚠ Unknown"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">First Seen</p>
                <p className="text-sm">{selectedIP.firstSeen}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Seen</p>
                <p className="text-sm">{selectedIP.lastSeen}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Risk Score</p>
                <Badge variant={getRiskVariant(selectedIP.riskScore)}>
                  {selectedIP.riskScore}/100
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default IPIntelligence;