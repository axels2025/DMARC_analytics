import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Copy, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Info,
  Zap,
  Target,
  Code,
  BookOpen,
  Lightbulb
} from 'lucide-react';
import { 
  MacroExpansionContext,
  DEFAULT_MACRO_CONTEXT,
  testMacroExpansion,
  parseSPFMacros,
  expandMacrosInText,
  SPFMacro
} from '@/utils/spfMacroParser';

interface MacroTestCase {
  name: string;
  description: string;
  input: string;
  context: MacroExpansionContext;
  expectedFeatures?: string[];
}

// Pre-built test cases covering various scenarios
const TEST_CASES: MacroTestCase[] = [
  {
    name: 'Basic Sender Validation',
    description: 'Simple sender-based macro for basic validation',
    input: '%{s}',
    context: {
      senderIP: '192.168.1.100',
      senderEmail: 'user@example.com',
      currentDomain: 'company.com',
      heloDomain: 'mail.example.com'
    },
    expectedFeatures: ['Sender email address expansion']
  },
  {
    name: 'IP-based Exists Check',
    description: 'Common pattern for IP-based domain existence checking',
    input: 'exists:%{i}.%{s1}.%{d}',
    context: {
      senderIP: '203.0.113.1',
      senderEmail: 'test@sender.com',
      currentDomain: 'receiver.com',
      heloDomain: 'mail.sender.com'
    },
    expectedFeatures: ['IP address', 'Sender domain truncation', 'Current domain']
  },
  {
    name: 'Complex Domain Processing',
    description: 'Advanced domain manipulation with modifiers',
    input: 'a:%{s}.authorized.%{d2}',
    context: {
      senderIP: '198.51.100.50',
      senderEmail: 'sales@marketing.bigcorp.com',
      currentDomain: 'mail.company.co.uk',
      heloDomain: 'smtp.bigcorp.com'
    },
    expectedFeatures: ['Sender email', 'Domain truncation', 'Static text']
  },
  {
    name: 'Reverse IP Processing',
    description: 'PTR-based validation with reverse processing',
    input: 'exists:%{ir}.%{v}._spf.%{d2}',
    context: {
      senderIP: '192.0.2.123',
      senderEmail: 'noreply@service.example.net',
      currentDomain: 'customer.example.org',
      heloDomain: 'mx1.service.example.net'
    },
    expectedFeatures: ['Reverse IP', 'IP version', 'Domain labels']
  },
  {
    name: 'Local Part Processing',
    description: 'Processing local part of email addresses',
    input: 'include:_spf.%{l}.%{o}.%{d}',
    context: {
      senderIP: '10.0.0.5',
      senderEmail: 'support-team@dept.company.com',
      currentDomain: 'mail.receiver.org',
      heloDomain: 'relay.dept.company.com'
    },
    expectedFeatures: ['Local part', 'Sender domain', 'Current domain']
  },
  {
    name: 'Complex Delimiter Usage',
    description: 'Using custom delimiters for domain parsing',
    input: '%{d.-}',
    context: {
      senderIP: '172.16.0.10',
      senderEmail: 'admin@sub.domain.example.com',
      currentDomain: 'mail-server.company-name.co.uk',
      heloDomain: 'mx.sub.domain.example.com'
    },
    expectedFeatures: ['Custom delimiters', 'Domain processing']
  }
];

// Common macro patterns for reference
const MACRO_REFERENCE = [
  { macro: '%{s}', description: 'Complete sender email address', example: 'user@domain.com' },
  { macro: '%{l}', description: 'Local part of sender email', example: 'user' },
  { macro: '%{o}', description: 'Domain part of sender email', example: 'domain.com' },
  { macro: '%{d}', description: 'Current domain being checked', example: 'company.com' },
  { macro: '%{i}', description: 'IP address of the sender', example: '192.168.1.1' },
  { macro: '%{p}', description: 'Validated domain name (PTR)', example: 'mail.domain.com' },
  { macro: '%{v}', description: 'IP version indicator', example: 'in-addr' },
  { macro: '%{h}', description: 'HELO/EHLO domain', example: 'mail.sender.com' },
  { macro: '%{c}', description: 'SMTP client IP in hex', example: 'C0A80101' },
  { macro: '%{t}', description: 'Current timestamp', example: '1640995200' },
  { macro: '%{d2}', description: 'Last 2 labels of domain', example: 'example.com' },
  { macro: '%{dr}', description: 'Domain in reverse', example: 'com.example' },
  { macro: '%{l-}', description: 'Local part with dash delimiter', example: 'user-name' }
];

interface SPFMacroTesterProps {
  initialMacro?: string;
  onTestComplete?: (result: any) => void;
}

const SPFMacroTester: React.FC<SPFMacroTesterProps> = ({ 
  initialMacro = '', 
  onTestComplete 
}) => {
  // State management
  const [macroInput, setMacroInput] = useState(initialMacro);
  const [customContext, setCustomContext] = useState<MacroExpansionContext>(DEFAULT_MACRO_CONTEXT);
  const [selectedTestCase, setSelectedTestCase] = useState<string>('');
  const [realTimeMode, setRealTimeMode] = useState(true);
  const [activeTab, setActiveTab] = useState('tester');
  const [testHistory, setTestHistory] = useState<Array<{
    input: string;
    output: string;
    context: MacroExpansionContext;
    timestamp: number;
    isValid: boolean;
  }>>([]);

  // Test the current macro
  const testResult = useMemo(() => {
    if (!macroInput.trim()) {
      return {
        expanded: '',
        isValid: true,
        errors: [],
        securityRisk: 'low' as const,
        analysis: null
      };
    }

    const result = testMacroExpansion(macroInput, customContext);
    const analysis = parseSPFMacros(macroInput);
    
    return {
      ...result,
      analysis
    };
  }, [macroInput, customContext]);

  // Real-time update effect
  useEffect(() => {
    if (realTimeMode && macroInput && testResult.expanded) {
      onTestComplete?.(testResult);
    }
  }, [testResult, realTimeMode, macroInput, onTestComplete]);

  // Load test case
  const loadTestCase = (testCaseName: string) => {
    const testCase = TEST_CASES.find(tc => tc.name === testCaseName);
    if (testCase) {
      setMacroInput(testCase.input);
      setCustomContext(testCase.context);
      setSelectedTestCase(testCaseName);
    }
  };

  // Run test and save to history
  const runTest = () => {
    if (macroInput && testResult.expanded) {
      const historyEntry = {
        input: macroInput,
        output: testResult.expanded,
        context: { ...customContext },
        timestamp: Date.now(),
        isValid: testResult.isValid
      };
      
      setTestHistory(prev => [historyEntry, ...prev.slice(0, 9)]); // Keep last 10
      onTestComplete?.(testResult);
    }
  };

  // Copy result to clipboard
  const copyResult = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setMacroInput('');
    setCustomContext(DEFAULT_MACRO_CONTEXT);
    setSelectedTestCase('');
  };

  // Get risk styling
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Mode Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">SPF Macro Tester</h2>
          <p className="text-muted-foreground">
            Interactive tool for testing and validating SPF macro expressions
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="realtime"
              checked={realTimeMode}
              onCheckedChange={setRealTimeMode}
            />
            <Label htmlFor="realtime" className="text-sm">Real-time</Label>
          </div>
          
          <Button variant="outline" onClick={resetToDefaults}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tester">Interactive Tester</TabsTrigger>
          <TabsTrigger value="examples">Test Cases</TabsTrigger>
          <TabsTrigger value="reference">Macro Reference</TabsTrigger>
        </TabsList>

        {/* Interactive Tester */}
        <TabsContent value="tester" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Macro Input
                </CardTitle>
                <CardDescription>
                  Enter your SPF macro expression to test
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Macro Input */}
                <div>
                  <Label htmlFor="macro-input">SPF Macro Expression</Label>
                  <div className="flex gap-2 mt-2">
                    <Textarea
                      id="macro-input"
                      placeholder="Enter macro like %{i}, %{s}, exists:%{i}.%{s1}.%{d}, etc."
                      value={macroInput}
                      onChange={(e) => setMacroInput(e.target.value)}
                      className="font-mono"
                      rows={3}
                    />
                    {!realTimeMode && (
                      <Button onClick={runTest} className="self-start">
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Test Case Selection */}
                <div>
                  <Label>Quick Test Cases</Label>
                  <Select value={selectedTestCase} onValueChange={loadTestCase}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select a test case..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_CASES.map((testCase) => (
                        <SelectItem key={testCase.name} value={testCase.name}>
                          {testCase.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTestCase && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {TEST_CASES.find(tc => tc.name === selectedTestCase)?.description}
                    </p>
                  )}
                </div>

                <Separator />

                {/* Context Configuration */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Expansion Context</Label>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label htmlFor="sender-ip" className="text-sm">Sender IP Address</Label>
                      <Input
                        id="sender-ip"
                        value={customContext.senderIP}
                        onChange={(e) => setCustomContext(prev => ({ ...prev, senderIP: e.target.value }))}
                        placeholder="192.168.1.100"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="sender-email" className="text-sm">Sender Email</Label>
                      <Input
                        id="sender-email"
                        value={customContext.senderEmail}
                        onChange={(e) => setCustomContext(prev => ({ ...prev, senderEmail: e.target.value }))}
                        placeholder="user@domain.com"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="current-domain" className="text-sm">Current Domain</Label>
                      <Input
                        id="current-domain"
                        value={customContext.currentDomain}
                        onChange={(e) => setCustomContext(prev => ({ ...prev, currentDomain: e.target.value }))}
                        placeholder="company.com"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="helo-domain" className="text-sm">HELO Domain</Label>
                      <Input
                        id="helo-domain"
                        value={customContext.heloDomain || ''}
                        onChange={(e) => setCustomContext(prev => ({ ...prev, heloDomain: e.target.value }))}
                        placeholder="mail.domain.com"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Test Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Validation Status */}
                {macroInput && (
                  <div className={`p-3 rounded-lg border flex items-center gap-2 ${
                    testResult.isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    {testResult.isValid ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`text-sm font-medium ${
                      testResult.isValid ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {testResult.isValid ? 'Valid Macro Syntax' : 'Invalid Macro Syntax'}
                    </span>
                  </div>
                )}

                {/* Security Risk Assessment */}
                {macroInput && (
                  <div className={`p-3 rounded-lg border ${getRiskColor(testResult.securityRisk)}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Security Risk Level</span>
                      <Badge variant={testResult.securityRisk === 'high' ? 'destructive' : 'secondary'}>
                        {testResult.securityRisk}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Expanded Result */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Expanded Result</Label>
                    {testResult.expanded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyResult(testResult.expanded)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="relative">
                    <Textarea
                      value={testResult.expanded || 'Enter a macro to see expansion...'}
                      readOnly
                      className="font-mono bg-gray-50 min-h-[100px]"
                      placeholder="Expanded macro will appear here..."
                    />
                  </div>
                </div>

                {/* Error Messages */}
                {testResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-red-600">Validation Errors</Label>
                    {testResult.errors.map((error, index) => (
                      <Alert key={index} className="bg-red-50 border-red-200">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-red-800">{error}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                {/* Macro Analysis */}
                {testResult.analysis && testResult.analysis.macros.length > 0 && (
                  <div>
                    <Label>Detected Macros</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {testResult.analysis.macros.map((macro, index) => (
                        <Badge key={index} variant="outline" className="font-mono">
                          {macro.raw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Performance Metrics */}
                {testResult.analysis && testResult.analysis.totalMacros > 0 && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-2 bg-blue-50 rounded">
                      <p className="font-medium text-blue-800">Complexity Score</p>
                      <p className="text-blue-600">{testResult.analysis.complexityScore}</p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded">
                      <p className="font-medium text-purple-800">DNS Lookups</p>
                      <p className="text-purple-600">{testResult.analysis.dnsLookupsPerEmail}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Test History */}
          {testHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Recent Tests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {testHistory.map((test, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded border text-sm">
                      <div className="flex-1 font-mono">
                        <span className="text-gray-600">Input:</span> {test.input}
                      </div>
                      <div className="flex-1 font-mono">
                        <span className="text-gray-600">Output:</span> {test.output}
                      </div>
                      <div className="flex items-center gap-2">
                        {test.isValid ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setMacroInput(test.input);
                            setCustomContext(test.context);
                          }}
                        >
                          Load
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Test Cases */}
        <TabsContent value="examples" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Pre-built Test Cases
              </CardTitle>
              <CardDescription>
                Common SPF macro patterns and real-world examples
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TEST_CASES.map((testCase) => (
                  <div key={testCase.name} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">{testCase.name}</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          loadTestCase(testCase.name);
                          setActiveTab('tester');
                        }}
                      >
                        Load Test
                      </Button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3">
                      {testCase.description}
                    </p>
                    
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Macro Expression:</Label>
                        <code className="block text-sm bg-gray-100 p-2 rounded mt-1 font-mono">
                          {testCase.input}
                        </code>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Expected Result:</Label>
                        <code className="block text-sm bg-green-100 p-2 rounded mt-1 font-mono">
                          {expandMacrosInText(testCase.input, testCase.context)}
                        </code>
                      </div>
                      
                      {testCase.expectedFeatures && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {testCase.expectedFeatures.map((feature, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Macro Reference */}
        <TabsContent value="reference" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                SPF Macro Reference
              </CardTitle>
              <CardDescription>
                Complete reference of SPF macro syntax and modifiers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Macros */}
                <div>
                  <h4 className="font-semibold mb-3">Basic Macro Characters</h4>
                  <div className="space-y-3">
                    {MACRO_REFERENCE.slice(0, 8).map((ref, index) => (
                      <div key={index} className="border-b pb-2">
                        <div className="flex items-center justify-between">
                          <code className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                            {ref.macro}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMacroInput(ref.macro);
                              setActiveTab('tester');
                            }}
                          >
                            Test
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {ref.description}
                        </p>
                        <p className="text-xs font-mono text-blue-600 mt-1">
                          Example: {ref.example}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Advanced Modifiers */}
                <div>
                  <h4 className="font-semibold mb-3">Advanced Modifiers</h4>
                  <div className="space-y-3">
                    {MACRO_REFERENCE.slice(8).map((ref, index) => (
                      <div key={index} className="border-b pb-2">
                        <div className="flex items-center justify-between">
                          <code className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                            {ref.macro}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMacroInput(ref.macro);
                              setActiveTab('tester');
                            }}
                          >
                            Test
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {ref.description}
                        </p>
                        <p className="text-xs font-mono text-blue-600 mt-1">
                          Example: {ref.example}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Syntax Rules */}
              <Separator className="my-6" />
              
              <div>
                <h4 className="font-semibold mb-3">Syntax Rules & Best Practices</h4>
                <div className="space-y-3 text-sm">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Macro Syntax</AlertTitle>
                    <AlertDescription>
                      Macros follow the pattern: %{'{letter}'}{'{digits}'}{'{r}'}{'{delimiters}'}
                      <br />
                      • Letter: macro type (s, l, o, d, i, p, v, h, c, t)
                      • Digits: number of labels to keep (1-128)
                      • 'r': reverse the order
                      • Delimiters: characters to treat as separators
                    </AlertDescription>
                  </Alert>

                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle>Security Considerations</AlertTitle>
                    <AlertDescription>
                      • Avoid %{'{p}'} macros as they cause additional DNS lookups
                      • Be careful with %{'{c}'} and %{'{t}'} as they may leak information
                      • Complex modifiers can be CPU intensive
                      • Always validate macro expansion results
                    </AlertDescription>
                  </Alert>

                  <Alert className="bg-blue-50 border-blue-200">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <AlertTitle>Best Practices</AlertTitle>
                    <AlertDescription>
                      • Use simple macros when possible for better performance
                      • Test macros with various input combinations
                      • Document complex macro usage for maintenance
                      • Monitor DNS lookup counts to avoid SPF limits
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SPFMacroTester;