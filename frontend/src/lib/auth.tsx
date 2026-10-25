import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  ApiError,
  auth as authApi,
  getToken,
  health as healthApi,
  onAuthFailure,
  setToken,
  type Health,
  type UserProfile,
} from "./api";

interface AuthState {
  user: UserProfile | null;
  /** Server capabilities — whether auth is required, registration is open, and so on. */
  capabilities: Health | null;
  /** True until the stored token has been checked against the server. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [capabilities, setCapabilities] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await authApi.me());
    } catch (error) {
      // A rejected token means the session is over — expired, revoked, or
      // signed by a server that has since restarted with a new secret.
      if (error instanceof ApiError && error.isAuthError) {
        setToken(null);
        setUser(null);
      }
    }
  }, []);

  // Restore the session, and learn what this deployment supports, on first paint.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [capabilityResult] = await Promise.allSettled([healthApi(), refresh()]);
      if (cancelled) return;
      if (capabilityResult.status === "fulfilled") setCapabilities(capabilityResult.value);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Any 401 from anywhere in the app ends the session here, so a stale token
  // cannot leave the UI showing a signed-in shell over failing requests.
  useEffect(() => onAuthFailure(() => setUser(null)), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setToken(response.access_token);
    setUser(response.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const response = await authApi.register(email, password, displayName);
    setToken(response.access_token);
    setUser(response.user);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, capabilities, loading, signIn, signUp, signOut, refresh }),
    [user, capabilities, loading, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an <AuthProvider>");
  return context;
}
