import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Shield,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Lock,
  Key,
  Database,
  FileText,
  Zap,
  BarChart3,
  Calendar,
  Download,
  Settings,
  Info
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  PrivacySettings,
  MaskingOptions,
  calculateComplianceScore,
  getPrivacyLevelDescription
} from '@/utils/privacyManager';
import {
  PrivacyAuditLogger,
  AuditSummary,
  PrivacyEventType,
  DataType
} from '@/utils/privacyAudit';
import { encryptionService } from '@/utils/encryptionService';

interface PrivacyDashboardProps {
  privacySettings: PrivacySettings;
  maskingOptions: MaskingOptions;
  onSettingsChange: (settings: PrivacySettings) => void;
  onShowFullSettings: () => void;
}

interface ComplianceMetric {
  name: string;
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  description: string;
  recommendations?: string[];
}

interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
}

export function PrivacyDashboard({ 
  privacySettings, 
  maskingOptions, 
  onSettingsChange,
  onShowFullSettings
}: PrivacyDashboardProps) {
  const { user } = useAuth();
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [encryptionStatus, setEncryptionStatus] = useState<{
    available: boolean;
    keyCount: number;
    lastTested?: Date;
  }>({ available: false, keyCount: 0 });
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);

  // Calculate compliance score
  const complianceScore = useMemo(() => {
    return calculateComplianceScore(privacySettings);
  }, [privacySettings]);

  // Load audit data
  useEffect(() => {
    const loadAuditData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        
        // Get audit summary for the last 30 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const summary = await PrivacyAuditLogger.generateAuditSummary(
          user.id,
          { start: startDate, end: endDate }
        );
        
        setAuditSummary(summary);
        
        // Check encryption status
        const providers = encryptionService.getAvailableProviders();
        const browserCrypto = providers.find(p => p.name === 'browser-crypto');
        
        if (browserCrypto?.isAvailable) {
          const testResult = await encryptionService.testEncryption('browser-crypto');
          setEncryptionStatus({
            available: testResult,
            keyCount: 0, // Would be loaded from KeyStorage in a real implementation
            lastTested: new Date()
          });
        }
        
        // Generate sample security alerts (in a real app, these would come from actual monitoring)
        const alerts: SecurityAlert[] = [];
        
        if (!privacySettings.encryptSensitiveData) {
          alerts.push({
            id: '1',
            severity: 'medium',
            title: 'Encryption Not Enabled',
            description: 'Sensitive data is not being encrypted. Consider enabling encryption for better security.',
            timestamp: new Date(),
            resolved: false
          });
        }
        
        if (!privacySettings.auditDataAccess) {
          alerts.push({
            id: '2',
            severity: 'warning',
            title: 'Audit Logging Disabled',
            description: 'Data access is not being logged. Enable audit logging for compliance tracking.',
            timestamp: new Date(),
            resolved: false
          });
        }
        
        if (privacySettings.retentionPeriodDays > 365) {
          alerts.push({
            id: '3',
            severity: 'low',
            title: 'Long Retention Period',
            description: 'Data retention period exceeds recommended 1 year limit.',
            timestamp: new Date(),
            resolved: false
          });
        }
        
        setSecurityAlerts(alerts);
        
      } catch (error) {
        console.error('Failed to load audit data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAuditData();
  }, [user, privacySettings]);

  // Get compliance metrics
  const complianceMetrics: ComplianceMetric[] = useMemo(() => {
    const { score, factors } = complianceScore;
    
    return [
      {
        name: 'Overall Compliance',
        score,
        status: score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'warning' : 'critical',
        description: `Your overall privacy compliance score based on current settings`,
        recommendations: factors
          .filter(f => !f.met)
          .map(f => f.factor)
      },
      {
        name: 'Data Protection',
        score: privacySettings.maskingLevel === 'maximum' ? 100 : privacySettings.maskingLevel === 'standard' ? 75 : 50,
        status: privacySettings.maskingLevel === 'maximum' ? 'excellent' : privacySettings.maskingLevel === 'standard' ? 'good' : 'warning',
        description: `Data masking level: ${privacySettings.maskingLevel}`,
        recommendations: privacySettings.maskingLevel === 'minimal' ? ['Consider increasing masking level'] : []
      },
      {
        name: 'Access Control',
        score: privacySettings.requireMasterPassword ? 100 : 50,
        status: privacySettings.requireMasterPassword ? 'excellent' : 'warning',
        description: privacySettings.requireMasterPassword ? 'Master password protection enabled' : 'No master password required',
        recommendations: !privacySettings.requireMasterPassword ? ['Enable master password protection'] : []
      },
      {
        name: 'Audit Compliance',
        score: privacySettings.auditDataAccess ? 100 : 0,
        status: privacySettings.auditDataAccess ? 'excellent' : 'critical',
        description: privacySettings.auditDataAccess ? 'All data access is logged' : 'Data access logging disabled',
        recommendations: !privacySettings.auditDataAccess ? ['Enable audit logging for compliance'] : []
      }
    ];
  }, [privacySettings, complianceScore]);

  const getStatusColor = (status: ComplianceMetric['status']) => {
    switch (status) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'good': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  const getSeverityColor = (severity: SecurityAlert['severity']) => {
    switch (severity) {
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-8 bg-muted rounded w-1/2"></div>
                  <div className="h-2 bg-muted rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Privacy Dashboard
          </h2>
          <p className="text-muted-foreground">
            Monitor your privacy compliance and data protection status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Live Monitoring
          </Badge>
          <Button onClick={onShowFullSettings} variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Full Settings
          </Button>
        </div>
      </div>

      {/* Compliance Score Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Compliance Overview
            <Badge className={getStatusColor(complianceScore.score >= 90 ? 'excellent' : complianceScore.score >= 70 ? 'good' : 'warning')}>
              {complianceScore.score}/100
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Compliance Score</span>
                <span className="font-medium">{complianceScore.score}%</span>
              </div>
              <Progress value={complianceScore.score} className="h-2" />
              <p className="text-sm text-muted-foreground">
                {getPrivacyLevelDescription(privacySettings.maskingLevel)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data Access Events</p>
                <p className="text-2xl font-bold">{auditSummary?.totalEvents.toLocaleString() || 0}</p>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Security Alerts</p>
                <p className="text-2xl font-bold">{securityAlerts.filter(a => !a.resolved).length}</p>
                <p className="text-xs text-muted-foreground">Active alerts</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Encryption Status</p>
                <p className="text-2xl font-bold">{encryptionStatus.available ? 'Active' : 'Inactive'}</p>
                <p className="text-xs text-muted-foreground">
                  {privacySettings.encryptSensitiveData ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <Lock className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data Retention</p>
                <p className="text-2xl font-bold">{privacySettings.retentionPeriodDays}</p>
                <p className="text-xs text-muted-foreground">Days</p>
              </div>
              <Clock className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="compliance" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Compliance Metrics */}
        <TabsContent value="compliance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {complianceMetrics.map((metric, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    {metric.name}
                    <Badge className={`text-xs ${getStatusColor(metric.status)}`}>
                      {metric.score}%
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={metric.score} className="h-2" />
                  <p className="text-sm text-muted-foreground">{metric.description}</p>
                  {metric.recommendations && metric.recommendations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Recommendations:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {metric.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-yellow-500">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Activity Log */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Privacy Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditSummary?.recentActivity && auditSummary.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {auditSummary.recentActivity.slice(0, 10).map((event, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                        <div>
                          <p className="font-medium text-sm capitalize">
                            {event.eventType.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.dataType} • {event.resourceId.substring(0, 8)}...
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={event.success ? 'default' : 'destructive'} className="text-xs">
                          {event.severity}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No recent privacy events</p>
                  <p className="text-sm">Activity will appear here as you use the system</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Alerts */}
        <TabsContent value="alerts" className="space-y-4">
          {securityAlerts.length > 0 ? (
            <div className="space-y-3">
              {securityAlerts.map((alert) => (
                <Alert key={alert.id} className={getSeverityColor(alert.severity)}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="flex items-center justify-between">
                    {alert.title}
                    <Badge variant="outline" className="text-xs">
                      {alert.severity}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="mt-2">
                    {alert.description}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs opacity-75">
                        {alert.timestamp.toLocaleString()}
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 text-xs">
                        Resolve
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="font-medium">No Security Alerts</p>
                <p className="text-sm text-muted-foreground">Your privacy configuration looks good!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Quick Settings */}
        <TabsContent value="settings" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Privacy Level</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Badge variant="secondary" className="w-full justify-center">
                    {privacySettings.maskingLevel}
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center">
                    {getPrivacyLevelDescription(privacySettings.maskingLevel)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Data Retention</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-center">
                    <span className="text-2xl font-bold">{privacySettings.retentionPeriodDays}</span>
                    <span className="text-sm text-muted-foreground ml-1">days</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Data retention period
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Encryption</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Badge 
                    variant={privacySettings.encryptSensitiveData ? 'default' : 'outline'}
                    className="w-full justify-center"
                  >
                    {privacySettings.encryptSensitiveData ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center">
                    Sensitive data encryption
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Audit Logging</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Badge 
                    variant={privacySettings.auditDataAccess ? 'default' : 'outline'}
                    className="w-full justify-center"
                  >
                    {privacySettings.auditDataAccess ? 'Active' : 'Inactive'}
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center">
                    Data access logging
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Button onClick={onShowFullSettings} className="w-full">
                <Settings className="h-4 w-4 mr-2" />
                Open Full Privacy Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}