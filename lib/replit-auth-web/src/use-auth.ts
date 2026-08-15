import { useState, useEffect, useCallback } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { AuthUser } from "@workspace/api-client-react";
import {
  apiUrl,
  firebaseAuth,
  getLegacySessionToken,
  setLegacySessionToken,
} from "./runtime";

export type { AuthUser };

const AUTH_CHANGED_EVENT = "velocity-auth-changed";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string, firstName?: string) => Promise<void>;
  logout: () => void;
}

async function fetchUser(): Promise<AuthUser | null> {
  const res = await fetch(apiUrl("/api/auth/user"), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { user: AuthUser | null };
  return data.user ?? null;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const publishUser = useCallback((nextUser: AuthUser | null) => {
    setUser(nextUser);
    setIsLoading(false);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: nextUser }));
  }, []);

  const refreshUser = useCallback(async () => {
    const nextUser = await fetchUser();
    publishUser(nextUser);
    return nextUser;
  }, [publishUser]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const isEmbedded = window.self !== window.top;

    const check = () => {
      fetchUser()
        .then((nextUser) => {
          if (cancelled) return;
          setUser(nextUser);
          setIsLoading(false);
          if (!nextUser && isEmbedded) pollTimer = setTimeout(check, 3000);
        })
        .catch(() => {
          if (cancelled) return;
          setUser(null);
          setIsLoading(false);
          if (isEmbedded) pollTimer = setTimeout(check, 3000);
        });
    };

    const unsubscribe = onAuthStateChanged(firebaseAuth, () => check());
    if (getLegacySessionToken()) check();

    return () => {
      cancelled = true;
      unsubscribe();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  const isEmbedded = window.self !== window.top;

  const login = useCallback(async () => {
    if (isEmbedded) {
      window.open(window.location.origin + "/", "_blank", "noopener,noreferrer");
      return;
    }
    setLegacySessionToken(null);
    await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    await refreshUser();
  }, [isEmbedded, refreshUser]);

  const submitLocalAuth = useCallback(async (
    path: "/api/auth/login" | "/api/auth/register",
    email: string,
    password: string,
    firstName?: string,
  ) => {
    await signOut(firebaseAuth).catch(() => undefined);
    const res = await fetch(apiUrl(path), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName }),
    });

    const data = await res.json() as { user?: AuthUser; token?: string; error?: string };
    if (!res.ok || !data.user || !data.token) {
      throw new Error(data.error ?? "Authentication failed.");
    }

    setLegacySessionToken(data.token);
    publishUser(data.user);
  }, [publishUser]);

  const loginWithPassword = useCallback((email: string, password: string) => (
    submitLocalAuth("/api/auth/login", email, password)
  ), [submitLocalAuth]);

  const registerWithPassword = useCallback((email: string, password: string, firstName?: string) => (
    submitLocalAuth("/api/auth/register", email, password, firstName)
  ), [submitLocalAuth]);

  const logout = useCallback(() => {
    void fetch(apiUrl("/api/session-logout"), { method: "POST", credentials: "include" })
      .catch(() => undefined)
      .finally(() => {
        setLegacySessionToken(null);
        void signOut(firebaseAuth).finally(() => {
          publishUser(null);
          if (!isEmbedded) window.location.href = "/";
        });
      });
  }, [isEmbedded, publishUser]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    loginWithPassword,
    registerWithPassword,
    logout,
  };
}
