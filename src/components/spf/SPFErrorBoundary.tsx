import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SPFErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface SPFErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onRetry?: () => void;
}

class SPFErrorBoundary extends React.Component<SPFErrorBoundaryProps, SPFErrorBoundaryState> {
  constructor(props: SPFErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<SPFErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[SPFErrorBoundary] SPF component error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isTableMissingError = this.state.error?.message?.includes('does not exist') ||
                                  this.state.error?.message?.includes('42P01') ||
                                  this.state.error?.message?.includes('404');

      return (
        <Card className="border-red-200">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            
            {isTableMissingError ? (
              <>
                <h3 className="text-lg font-semibold mb-2 text-red-600">
                  SPF Flattening Feature Unavailable
                </h3>
                <p className="text-muted-foreground mb-4">
                  The SPF flattening feature is not yet set up for your account. 
                  This typically means the database hasn't been initialized with the SPF flattening tables.
                </p>
                
                <Alert className="mb-6 text-left">
                  <Settings className="h-4 w-4" />
                  <AlertDescription>
                    <strong>For Administrators:</strong> Please run the SPF flattening database migrations to enable this feature:
                    <br />
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded mt-2 inline-block">
                      supabase migration up
                    </code>
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    SPF flattening helps reduce DNS lookups by converting SPF includes to direct IP addresses.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Once enabled, you'll be able to:
                  </p>
                  <ul className="text-sm text-muted-foreground text-left max-w-md mx-auto space-y-1">
                    <li>• Flatten SPF includes to reduce lookup count</li>
                    <li>• Track flattening operation history</li>
                    <li>• Monitor performance improvements</li>
                    <li>• Revert changes when needed</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2 text-red-600">
                  Something went wrong
                </h3>
                <p className="text-muted-foreground mb-4">
                  An error occurred while loading the SPF flattening component.
                </p>
                
                {this.state.error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-left">
                    <p className="text-sm font-mono text-red-800">
                      {this.state.error.message}
                    </p>
                  </div>
                )}
              </>
            )}

            <Button onClick={this.handleRetry} className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export const withSPFErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) => {
  return React.forwardRef<any, P>((props, ref) => (
    <SPFErrorBoundary fallback={fallback}>
      <Component {...props} ref={ref} />
    </SPFErrorBoundary>
  ));
};

// Hook for SPF feature availability check
export const useSPFFeatureCheck = () => {
  const [isAvailable, setIsAvailable] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  
  const checkAvailability = React.useCallback(async () => {
    try {
      // Simple query to check if the table exists
      const { data, error } = await supabase
        .from('spf_flattening_operations')
        .select('id')
        .limit(1);
      
      if (error) {
        if (error.message.includes('does not exist') || 
            error.message.includes('42P01') || 
            error.message.includes('404')) {
          setIsAvailable(false);
          setError('SPF flattening feature is not available. Database tables not found.');
        } else {
          setIsAvailable(false);
          setError(error.message);
        }
      } else {
        setIsAvailable(true);
        setError(null);
      }
    } catch (err) {
      setIsAvailable(false);
      setError(err instanceof Error ? err.message : 'Unknown error checking SPF availability');
    }
  }, []);
  
  React.useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);
  
  return {
    isAvailable,
    error,
    checkAvailability
  };
};

export default SPFErrorBoundary;