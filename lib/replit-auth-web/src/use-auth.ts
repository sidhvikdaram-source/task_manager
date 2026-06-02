import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
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

  const logout = useCallback(() => {
    if (isEmbedded) {
      fetch("/api/auth/session-logout", { method: "POST", credentials: "include" })
        .finally(() => setUser(null));
    } else {
      window.location.href = "/api/logout";
    }
  }, [isEmbedded]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
