import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

const AUTH_CHANGED_EVENT = "velocity-auth-changed";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string, firstName?: string) => Promise<void>;
  logout: () => void;
}

async function fetchUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/user", { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { user: AuthUser | null };
  return data.user ?? null;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const isEmbedded = window.self !== window.top;

    const handleAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<AuthUser | null>).detail ?? null;
      setUser(detail);
      setIsLoading(false);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);

    const check = () => {
      fetchUser()
        .then((u) => {
          if (cancelled) return;
          setUser(u);
          setIsLoading(false);
          if (!u && isEmbedded) {
            pollTimer = setTimeout(check, 3000);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setUser(null);
          setIsLoading(false);
          if (isEmbedded) {
            pollTimer = setTimeout(check, 3000);
          }
        });
    };

    check();

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  const isEmbedded = window.self !== window.top;

  const login = useCallback(() => {
    if (isEmbedded) {
      window.open(window.location.origin + "/", "_blank", "noopener,noreferrer");
    } else {
      window.location.href = "/api/login?returnTo=/";
    }
  }, [isEmbedded]);

  const submitLocalAuth = useCallback(async (
    path: "/api/auth/login" | "/api/auth/register",
    email: string,
    password: string,
    firstName?: string,
  ) => {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName }),
    });

    const data = await res.json() as { user?: AuthUser; error?: string };
    if (!res.ok || !data.user) {
      throw new Error(data.error ?? "Authentication failed.");
    }

    setUser(data.user);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: data.user }));
  }, []);

  const loginWithPassword = useCallback((email: string, password: string) => (
    submitLocalAuth("/api/auth/login", email, password)
  ), [submitLocalAuth]);

  const registerWithPassword = useCallback((email: string, password: string, firstName?: string) => (
    submitLocalAuth("/api/auth/register", email, password, firstName)
  ), [submitLocalAuth]);

  const logout = useCallback(() => {
    fetch("/api/session-logout", { method: "POST", credentials: "include" })
      .finally(() => {
        setUser(null);
        window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: null }));
        if (isEmbedded) return;
        window.location.href = "/";
      });
  }, [isEmbedded]);

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
