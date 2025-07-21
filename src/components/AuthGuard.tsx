
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard = ({ children }: AuthGuardProps) => {
  const { user, loading, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log(`[AuthGuard] Checking auth - loading: ${loading}, user: ${user ? user.id : 'null'}, path: ${location.pathname}`);
    
    if (!loading && !error) {
      if (!user) {
        // User is not authenticated
        if (location.pathname !== '/auth' && location.pathname !== '/') {
          console.log(`[AuthGuard] Redirecting to /auth from ${location.pathname}`);
          navigate('/auth', { replace: true });
        }
      } else {
        // User is authenticated
        if (location.pathname === '/auth' || location.pathname === '/') {
          console.log(`[AuthGuard] Redirecting authenticated user to /dashboard`);
          navigate('/dashboard', { replace: true });
        }
      }
    }
  }, [user, loading, error, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading authentication...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Authentication error: {error}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;
