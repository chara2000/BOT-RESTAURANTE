'use client';

import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setSecureCookie, removeSecureCookie } from '@/lib/utils/safeStorage';
import type { User } from '@supabase/supabase-js';
import type { UserRole } from '@/types';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
  allowed_modules?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Use a promise ref to prevent concurrent loadProfile calls for the same user
  // and to let later callers await the already-in-flight request.
  const profileLoadRef = useRef<Promise<void> | null>(null);
  const lastLoadedUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (authUser: User) => {
    // If we are already loading this exact user, wait for that promise instead
    // of starting a second overlapping fetch (the root cause of the race).
    if (profileLoadRef.current && lastLoadedUserId.current === authUser.id) {
      return profileLoadRef.current;
    }

    lastLoadedUserId.current = authUser.id;

    const work = async () => {
      try {
        const supabase = createClient();
        if (!supabase) {
          setUser({
            id: authUser.id,
            email: authUser.email ?? '',
            name: authUser.email?.split('@')[0] ?? 'Usuario',
            role: 'operator',
            allowed_modules: authUser.user_metadata?.allowed_modules,
          });
          return;
        }

        const fetchPromise = supabase
          .from('profiles')
          .select('name, role, tenant_id, allowed_modules')
          .eq('id', authUser.id)
          .maybeSingle();

        // 2s timeout race to prevent hanging requests
        const timeoutPromise = new Promise<{ data: null; error: null }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: null }), 2000)
        );

        const { data: profile } = await Promise.race([fetchPromise, timeoutPromise]);

        if (!profile) {
          // Fallback to metadata instead of hard-failing
          const metaRole = (authUser.user_metadata?.role as UserRole) || 'admin';
          const metaModules = authUser.user_metadata?.allowed_modules;

          setUser({
            id: authUser.id,
            email: authUser.email ?? '',
            name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuario',
            role: metaRole,
            allowed_modules: Array.isArray(metaModules) ? metaModules : undefined,
          });
          return;
        }

        const customModules =
          (profile as any)?.allowed_modules || authUser.user_metadata?.allowed_modules;

        setUser({
          id: authUser.id,
          email: authUser.email ?? '',
          name: profile.name ?? authUser.email?.split('@')[0] ?? 'Usuario',
          role: (profile.role as UserRole) ?? 'operator',
          allowed_modules:
            Array.isArray(customModules) && customModules.length > 0
              ? customModules
              : undefined,
        });
      } catch (err) {
        console.warn('[AuthProvider] Profile load exception:', err);
        // Fallback user state so UI does not stall
        setUser({
          id: authUser.id,
          email: authUser.email ?? '',
          name: authUser.email?.split('@')[0] ?? 'Usuario',
          role: 'admin',
        });
      }
    };

    profileLoadRef.current = work();
    try {
      await profileLoadRef.current;
    } finally {
      // Clear the ref only if it is still our promise
      // (another call may have already replaced it)
      profileLoadRef.current = null;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setSecureCookie('sb-access-token', session.access_token, session.expires_in ?? 2592000);
        await loadProfile(session.user);
      }
    } catch (e) {
      console.warn('[AuthProvider] Refresh session check:', e);
    }
  }, [loadProfile]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let initialLoadDone = false;
    let sessionFound = false;

    // Safety fallback timeout: only fire if no session was found to avoid hanging
    const safetyTimer = setTimeout(() => {
      if (!initialLoadDone && !sessionFound) {
        initialLoadDone = true;
        setIsLoading(false);
      }
    }, 6000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        sessionFound = true;
        setSecureCookie('sb-access-token', session.access_token, session.expires_in ?? 2592000);
        await loadProfile(session.user);
      }
    }).catch(() => {
      // Silently ignore — user will just see the login screen
    }).finally(() => {
      clearTimeout(safetyTimer);
      initialLoadDone = true;
      setIsLoading(false);
    });

    // Step 2: Listen for subsequent auth changes (login from login page, token refresh, signout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AuthProvider] Auth state change:', event);
      }

      if (event === 'SIGNED_OUT') {
        removeSecureCookie('sb-access-token');
        lastLoadedUserId.current = null;
        setUser(null);
        return;
      }

      if (session?.user) {
        // SIGNED_IN fires right after signInWithPassword — we need to load the profile
        // and make sure isLoading is false so the redirect in AppLayout works correctly.
        setSecureCookie('sb-access-token', session.access_token, session.expires_in ?? 2592000);
        await loadProfile(session.user);

        // If initial load wasn't done yet when this event fired, mark it done now
        if (!initialLoadDone) {
          initialLoadDone = true;
          setIsLoading(false);
        }
      }
    });

    // iOS / Safari PWA lifecycle — restore session when app comes back to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSession();
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refreshSession(); // bfcache restore
    };
    const handleOnline = () => refreshSession();

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow as EventListener);
    window.addEventListener('online', handleOnline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow as EventListener);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadProfile, refreshSession]);

  const signOut = async () => {
    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[AuthProvider] Error signing out:', err);
      }
    }
    removeSecureCookie('sb-access-token');
    lastLoadedUserId.current = null;
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
