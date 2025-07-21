
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Index] Component mounted, checking auth state');
    
    if (!loading) {
      if (user) {
        console.log('[Index] User authenticated, redirecting to dashboard');
        navigate("/dashboard", { replace: true });
      } else {
        console.log('[Index] User not authenticated, redirecting to auth');
        navigate("/auth", { replace: true });
      }
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading DMARC Analytics...</p>
      </div>
    </div>
  );
};

export default Index;
