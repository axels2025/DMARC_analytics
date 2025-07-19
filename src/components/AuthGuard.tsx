import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard = ({ children }: AuthGuardProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log(`[AuthGuard] Checking auth - loading: ${loading}, user: ${user ? user.id : 'null'}, path: ${location.pathname}`);
    
    if (!loading) {
      if (!user) {
        // User is not authenticated
        if (location.pathname !== '/auth') {
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
  }, [user, loading, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;