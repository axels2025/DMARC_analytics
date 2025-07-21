
import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authRateLimiter, validateSessionIntegrity } from "@/utils/security";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signUp: (email: string, password: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  error: null,
  signIn: async () => ({ error: new Error('Not implemented') }),
  signUp: async () => ({ error: new Error('Not implemented') }),
  signOut: async () => {},
  clearError: () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[AuthProvider] Initializing auth state listener');
    
    let mounted = true;
    
    const initializeAuth = async () => {
      try {
        console.log('[AuthProvider] Setting up auth state listener');
        
        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (!mounted) return;
            
            console.log(`[AuthProvider] Auth state changed - event: ${event}, session:`, session ? 'exists' : 'null');
            
            // Validate session integrity
            if (session && !validateSessionIntegrity(session)) {
              console.warn('[AuthProvider] Invalid session detected, signing out');
              supabase.auth.signOut();
              return;
            }
            
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
            setError(null);
            
            console.log(`[AuthProvider] State updated - user: ${session?.user?.id || 'null'}`);
          }
        );

        // Check for existing session
        console.log('[AuthProvider] Checking for existing session');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (sessionError) {
          console.error('[AuthProvider] Session check error:', sessionError);
          setError('Failed to check authentication status');
          setLoading(false);
          return;
        }
        
        console.log('[AuthProvider] Existing session check result:', session ? 'found' : 'none');
        
        if (session && validateSessionIntegrity(session)) {
          setSession(session);
          setUser(session?.user ?? null);
          console.log(`[AuthProvider] Restored session for user: ${session.user?.id}`);
        } else {
          setSession(null);
          setUser(null);
          console.log('[AuthProvider] No valid session found');
        }
        
        setLoading(false);
        
        return () => {
          mounted = false;
          subscription.unsubscribe();
        };
      } catch (err) {
        console.error('[AuthProvider] Auth initialization error:', err);
        if (mounted) {
          setError('Failed to initialize authentication');
          setLoading(false);
        }
      }
    };

    const cleanup = initializeAuth();
    
    return () => {
      mounted = false;
      cleanup?.then(cleanupFn => cleanupFn?.());
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // Input validation
      if (!email || !email.includes('@')) {
        return { error: { message: 'Invalid email format' } };
      }
      
      if (!password) {
        return { error: { message: 'Password is required' } };
      }

      // Rate limiting
      const identifier = email.toLowerCase().trim();
      if (!authRateLimiter.canAttempt(identifier)) {
        const remaining = authRateLimiter.getRemainingAttempts(identifier);
        const resetTime = authRateLimiter.getResetTime(identifier);
        const resetMinutes = resetTime ? Math.ceil((resetTime - Date.now()) / (60 * 1000)) : 15;
        
        return { 
          error: { 
            message: `Too many failed attempts. Please try again in ${resetMinutes} minutes.` 
          } 
        };
      }

      setError(null);
      console.log('[AuthProvider] Attempting sign in for:', identifier);

      const { error } = await supabase.auth.signInWithPassword({
        email: identifier,
        password
      });

      // Record attempt for rate limiting
      if (error) {
        console.error('[AuthProvider] Sign in error:', error);
        authRateLimiter.recordAttempt(identifier);
      } else {
        console.log('[AuthProvider] Sign in successful');
      }

      return { error };
    } catch (err) {
      console.error('[AuthProvider] Sign in exception:', err);
      return { error: { message: 'An unexpected error occurred during sign in' } };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      // Input validation
      if (!email || !email.includes('@') || email.length > 254) {
        return { error: { message: 'Invalid email format' } };
      }
      
      if (!password || password.length < 8) {
        return { error: { message: 'Password must be at least 8 characters long' } };
      }

      setError(null);
      console.log('[AuthProvider] Attempting sign up for:', email);

      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });
      
      if (error) {
        console.error('[AuthProvider] Sign up error:', error);
      } else {
        console.log('[AuthProvider] Sign up successful');
      }
      
      return { error };
    } catch (err) {
      console.error('[AuthProvider] Sign up exception:', err);
      return { error: { message: 'An unexpected error occurred during sign up' } };
    }
  };

  const signOut = async () => {
    try {
      console.log('[AuthProvider] Signing out');
      setError(null);
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[AuthProvider] Sign out error:', err);
      setError('Failed to sign out');
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    session,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
