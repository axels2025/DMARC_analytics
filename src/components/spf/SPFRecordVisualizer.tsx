import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ChevronRight, 
  Network, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Globe,
  Mail,
  Shield,
  Zap
} from 'lucide-react';
import { SPFRecord, SPFMechanism, SPFModifier } from '@/utils/spfParser';

interface SPFRecordVisualizerProps {
  record: SPFRecord;
  className?: string;
}

interface MechanismVisualizerProps {
  mechanism: SPFMechanism;
  index: number;
}

const MechanismVisualizer: React.FC<MechanismVisualizerProps> = ({ mechanism, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getMechanismIcon = (type: string) => {
    switch (type) {
      case 'include': return <Network className="w-4 h-4" />;
      case 'a': case 'mx': return <Globe className="w-4 h-4" />;
      case 'ip4': case 'ip6': return <Shield className="w-4 h-4" />;
      case 'exists': return <CheckCircle className="w-4 h-4" />;
      case 'ptr': return <Mail className="w-4 h-4" />;
      case 'all': return <Zap className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getMechanismColor = (type: string, qualifier: string) => {
    if (qualifier === '-') return 'border-red-300 bg-red-50';
    if (qualifier === '~') return 'border-yellow-300 bg-yellow-50';
    if (qualifier === '?') return 'border-gray-300 bg-gray-50';
    
    switch (type) {
      case 'include': return 'border-blue-300 bg-blue-50';
      case 'a': case 'mx': return 'border-green-300 bg-green-50';
      case 'ip4': case 'ip6': return 'border-purple-300 bg-purple-50';
      case 'ptr': return 'border-red-300 bg-red-50';
      case 'all': return 'border-gray-300 bg-gray-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  const getQualifierBadge = (qualifier: string) => {
    switch (qualifier) {
      case '+': return <Badge variant="default">Pass</Badge>;
      case '-': return <Badge variant="destructive">Fail</Badge>;
      case '~': return <Badge variant="secondary">SoftFail</Badge>;
      case '?': return <Badge variant="outline">Neutral</Badge>;
      default: return <Badge variant="default">Pass</Badge>;
    }
  };

  const getMechanismDescription = (mechanism: SPFMechanism) => {
    switch (mechanism.type) {
      case 'include':
        return `Include SPF record from ${mechanism.value}. This requires a DNS lookup to resolve the included domain's SPF policy.`;
      case 'a':
        return `Allow IPs that resolve from ${mechanism.value ? `A record of ${mechanism.value}` : 'the current domain'}. Requires DNS A record lookup.`;
      case 'mx':
        return `Allow IPs from ${mechanism.value ? `MX records of ${mechanism.value}` : 'the current domain'}. Requires DNS MX record lookup.`;
      case 'ip4':
        return `Allow IPv4 address or range: ${mechanism.value}. No DNS lookup required.`;
      case 'ip6':
        return `Allow IPv6 address or range: ${mechanism.value}. No DNS lookup required.`;
      case 'exists':
        return `Check if ${mechanism.value} exists via A record lookup. Used for complex conditional logic.`;
      case 'ptr':
        return `Deprecated: Allow IPs with PTR records matching ${mechanism.value || 'the current domain'}. Slow and unreliable.`;
      case 'all':
        return 'Catch-all mechanism that matches any IP not matched by previous mechanisms.';
      default:
        return 'Unknown mechanism type.';
    }
  };

  return (
    <div className={`border-2 rounded-lg p-4 ${getMechanismColor(mechanism.type, mechanism.qualifier)}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {getMechanismIcon(mechanism.type)}
            <span className="font-mono text-sm font-semibold">
              {mechanism.qualifier !== '+' && mechanism.qualifier}
              {mechanism.type}
              {mechanism.value && `:${mechanism.value}`}
            </span>
          </div>
          {getQualifierBadge(mechanism.qualifier)}
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={mechanism.lookupCount > 0 ? "default" : "secondary"}>
            {mechanism.lookupCount} lookup{mechanism.lookupCount !== 1 ? 's' : ''}
          </Badge>
          
          {mechanism.type === 'ptr' && (
            <AlertTriangle className="w-4 h-4 text-red-500" title="Deprecated mechanism" />
          )}
          
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </div>

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleContent className="mt-3 pt-3 border-t border-gray-200">
          <div className="space-y-2 text-sm">
            <p className="text-gray-700">{getMechanismDescription(mechanism)}</p>
            
            {mechanism.errors.length > 0 && (
              <div className="bg-red-100 border border-red-300 rounded p-2">
                <p className="font-semibold text-red-700">Errors:</p>
                {mechanism.errors.map((error, errorIndex) => (
                  <p key={errorIndex} className="text-red-600">• {error}</p>
                ))}
              </div>
            )}
            
            {mechanism.resolvedIPs.length > 0 && (
              <div className="bg-blue-100 border border-blue-300 rounded p-2">
                <p className="font-semibold text-blue-700">Resolved IPs:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {mechanism.resolvedIPs.map((ip, ipIndex) => (
                    <Badge key={ipIndex} variant="outline" className="text-xs">
                      {ip}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const SPFRecordVisualizer: React.FC<SPFRecordVisualizerProps> = ({ record, className = '' }) => {
  const lookupProgress = (record.totalLookups / 10) * 100;
  const progressColor = record.totalLookups >= 10 ? 'bg-red-500' : 
                       record.totalLookups >= 8 ? 'bg-yellow-500' : 
                       record.totalLookups >= 6 ? 'bg-blue-500' : 'bg-green-500';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Lookup Counter */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Network className="w-5 h-5" />
              SPF Record Structure
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">DNS Lookups</p>
                <p className="text-2xl font-bold">{record.totalLookups}/10</p>
              </div>
              {record.totalLookups >= 10 ? (
                <XCircle className="w-8 h-8 text-red-500" />
              ) : record.totalLookups >= 8 ? (
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
              ) : (
                <CheckCircle className="w-8 h-8 text-green-500" />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Lookup Usage</span>
                <span className={lookupProgress >= 80 ? 'text-red-600 font-semibold' : ''}>
                  {lookupProgress.toFixed(1)}%
                </span>
              </div>
              <div className="relative">
                <Progress value={lookupProgress} className="h-3" />
                {/* Danger zone marker at 80% */}
                <div className="absolute top-0 left-[80%] h-3 w-0.5 bg-red-500 opacity-50" />
                <div className="absolute -top-5 left-[80%] text-xs text-red-500 transform -translate-x-1/2">
                  Danger
                </div>
              </div>
            </div>

            {/* Version Display */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {record.version}
              </Badge>
              <span className="text-sm text-muted-foreground">
                SPF Version {record.isValid ? '✓' : '✗'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mechanisms Flow */}
      <Card>
        <CardHeader>
          <CardTitle>SPF Mechanisms Flow</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mechanisms are evaluated in order. First match determines the result.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {record.mechanisms.map((mechanism, index) => (
              <div key={index} className="relative">
                {/* Flow Arrow */}
                {index < record.mechanisms.length - 1 && (
                  <div className="absolute left-6 top-full w-0.5 h-4 bg-gray-300 z-10" />
                )}
                
                {/* Step Number */}
                <div className="absolute -left-8 top-4 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>
                
                <MechanismVisualizer mechanism={mechanism} index={index} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modifiers */}
      {record.modifiers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>SPF Modifiers</CardTitle>
            <p className="text-sm text-muted-foreground">
              Modifiers provide additional instructions for SPF processing.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {record.modifiers.map((modifier, index) => (
                <div key={index} className="border border-gray-300 bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4" />
                      <span className="font-mono text-sm font-semibold">
                        {modifier.type}={modifier.value}
                      </span>
                    </div>
                    <Badge variant={modifier.lookupCount > 0 ? "default" : "secondary"}>
                      {modifier.lookupCount} lookup{modifier.lookupCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {modifier.type === 'redirect' && `Redirect SPF evaluation to ${modifier.value}`}
                    {modifier.type === 'exp' && `Use ${modifier.value} for explanation text if SPF fails`}
                    {!['redirect', 'exp'].includes(modifier.type) && `Custom modifier: ${modifier.type}`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issues Summary */}
      {(record.errors.length > 0 || record.warnings.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {record.errors.length > 0 ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              )}
              Issues Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {record.errors.map((error, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800">Error</p>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              ))}
              
              {record.warnings.map((warning, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-yellow-800">Warning</p>
                    <p className="text-sm text-yellow-700">{warning}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Record */}
      <Card>
        <CardHeader>
          <CardTitle>Raw SPF Record</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-lg">
            <code className="text-sm break-all">{record.raw}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SPFRecordVisualizer;