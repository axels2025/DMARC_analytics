import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  AlertTriangle,
  Info
} from 'lucide-react';
import { runPrivacyTests, TestResult } from '@/utils/privacyTestSuite';

const PrivacyTestRunner = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [progress, setProgress] = useState(0);

  const runTests = async () => {
    setIsRunning(true);
    setResults([]);
    setProgress(0);

    try {
      const testResults = await runPrivacyTests();
      setResults(testResults);
      setProgress(100);
    } catch (error) {
      console.error('Test execution failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const getResultSummary = () => {
    if (results.length === 0) return null;
    
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const passRate = (passed / total) * 100;
    
    return { passed, total, passRate };
  };

  const summary = getResultSummary();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Privacy Controls Test Suite
        </h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive testing of privacy controls, data masking, encryption, and compliance features
        </p>
      </div>

      {/* Test Control */}
      <Card>
        <CardHeader>
          <CardTitle>Test Execution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button 
              onClick={runTests} 
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isRunning ? 'Running Tests...' : 'Run Privacy Tests'}
            </Button>

            {isRunning && (
              <div className="flex-1">
                <Progress value={progress} className="h-2" />
                <div className="text-sm text-muted-foreground mt-1">
                  Testing privacy controls and compliance features...
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Test Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {summary.passRate === 100 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : summary.passRate >= 80 ? (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Test Results Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{summary.passed}</div>
                <div className="text-sm text-muted-foreground">Passed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{summary.total - summary.passed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{summary.passRate.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Pass Rate</div>
              </div>
            </div>
            
            <Progress value={summary.passRate} className="h-3" />
            
            <div className="mt-4">
              <Badge 
                variant={summary.passRate === 100 ? 'default' : summary.passRate >= 80 ? 'secondary' : 'destructive'}
                className="text-sm"
              >
                {summary.passRate === 100 ? 'All Tests Passed' : 
                 summary.passRate >= 80 ? 'Most Tests Passed' : 
                 'Multiple Test Failures'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual Test Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Detailed Test Results</h2>
          
          <div className="grid grid-cols-1 gap-4">
            {results.map((result, index) => (
              <Card key={index} className={result.passed ? 'border-green-200' : 'border-red-200'}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {result.passed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                      )}
                      <div>
                        <h3 className="font-semibold">{result.testName}</h3>
                        {result.error && (
                          <p className="text-red-600 text-sm mt-1">{result.error}</p>
                        )}
                        {result.details && (
                          <div className="mt-2">
                            <details className="text-sm text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">
                                View Details
                              </summary>
                              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                                {JSON.stringify(result.details, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant={result.passed ? 'default' : 'destructive'}>
                      {result.passed ? 'PASS' : 'FAIL'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Test Categories Explanation */}
      {results.length === 0 && !isRunning && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 text-blue-500" />
                  <div>
                    <div className="font-medium">Data Masking</div>
                    <div className="text-sm text-muted-foreground">
                      Email masking, subject line protection, header sanitization
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 text-green-500" />
                  <div>
                    <div className="font-medium">Encryption</div>
                    <div className="text-sm text-muted-foreground">
                      Client-side encryption, key management, secure storage
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 text-purple-500" />
                  <div>
                    <div className="font-medium">Audit & Compliance</div>
                    <div className="text-sm text-muted-foreground">
                      Event logging, compliance reporting, GDPR compliance
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 text-orange-500" />
                  <div>
                    <div className="font-medium">Data Lifecycle</div>
                    <div className="text-sm text-muted-foreground">
                      Retention policies, data cleanup, export functionality
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Privacy Features Tested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>• Email address masking with different privacy levels</div>
                <div>• Subject line masking with keyword preservation</div>
                <div>• Email header sanitization and filtering</div>
                <div>• Message content redaction for sensitive data</div>
                <div>• Privacy settings validation and application</div>
                <div>• Compliance scoring and recommendations</div>
                <div>• Data classification based on sensitivity</div>
                <div>• Client-side AES-GCM encryption</div>
                <div>• Secure key storage with master password</div>
                <div>• Privacy audit logging and reporting</div>
                <div>• Data lifecycle management and retention</div>
                <div>• End-to-end privacy protection workflow</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Information Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>About Privacy Testing</AlertTitle>
        <AlertDescription>
          This test suite validates all privacy and compliance features in the DMARC Analytics system.
          Some tests may show warnings if database connectivity is not available in the test environment,
          but core privacy functionality will still be validated.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default PrivacyTestRunner;