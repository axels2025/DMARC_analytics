import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authRateLimiter, validateSessionIntegrity } from "@/utils/security";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signUp: (email: string, password: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({ error: new Error('Not implemented') }),
  signUp: async () => ({ error: new Error('Not implemented') }),
  signOut: async () => {},
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

  useEffect(() => {
    console.log('[AuthProvider] Setting up auth state listener');
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
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
        
        console.log(`[AuthProvider] State updated - user: ${session?.user?.id || 'null'}`);
      }
    );

    // Check for existing session
    console.log('[AuthProvider] Checking for existing session');
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[AuthProvider] Existing session check result:', session ? 'found' : 'none', error ? `Error: ${error.message}` : '');
      
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
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
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

    const { error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password
    });

    // Record attempt for rate limiting
    if (error) {
      authRateLimiter.recordAttempt(identifier);
    }

    return { error };
  };

  const signUp = async (email: string, password: string) => {
    // Input validation
    if (!email || !email.includes('@') || email.length > 254) {
      return { error: { message: 'Invalid email format' } };
    }
    
    if (!password || password.length < 8) {
      return { error: { message: 'Password must be at least 8 characters long' } };
    }

    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};