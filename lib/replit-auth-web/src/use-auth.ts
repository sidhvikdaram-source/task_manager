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
const API_RETRY_DELAYS_MS = [0, 1_000, 2_000, 3_000, 4_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000];

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string, firstName?: string) => Promise<void>;
  logout: () => void;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchApiWithRecovery(path: string, init: RequestInit = {}) {
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < API_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = API_RETRY_DELAYS_MS[attempt];
    if (delay) await wait(delay);

    try {
      const response = await fetch(apiUrl(path), init);
      const canRetry = [502, 503, 504].includes(response.status);
      if (!canRetry || attempt === API_RETRY_DELAYS_MS.length - 1) {
        return response;
      }
    } catch (error) {
      lastNetworkError = error;
      if (attempt === API_RETRY_DELAYS_MS.length - 1) break;
    }
  }

  throw new Error(
    lastNetworkError instanceof TypeError
      ? "Nimbus could not reach its server. The connection was retried automatically; check whether your network blocks nimbusdo.onrender.com."
      : "Nimbus could not reach its server. Please try again.",
  );
}

async function fetchUser(): Promise<AuthUser | null> {
  const res = await fetchApiWithRecovery("/api/auth/user", { credentials: "include" });
  const data = await res.json().catch(() => null) as {
    user?: AuthUser | null;
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(data?.error ?? `Nimbus's server returned HTTP ${res.status}.`);
  }
  return data?.user ?? null;
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

    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      // The public landing page is static. Do not wake or wait for Render until
      // this browser actually has a Nimbus session to restore.
      if (!firebaseUser && !getLegacySessionToken()) {
        publishUser(null);
        return;
      }
      check();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [publishUser]);

  useEffect(() => {
    const syncPublishedUser = (event: Event) => {
      const nextUser = (event as CustomEvent<AuthUser | null>).detail;
      setUser(nextUser ?? null);
      setIsLoading(false);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, syncPublishedUser);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncPublishedUser);
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
    const res = await fetchApiWithRecovery(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName }),
    });

    const data = await res.json().catch(() => null) as {
      user?: AuthUser;
      token?: string;
      error?: string;
    } | null;
    if (!res.ok || !data?.user || !data.token) {
      throw new Error(
        data?.error ??
          (res.ok
            ? "Nimbus received an incomplete sign-in response. Please retry."
            : `Nimbus's server returned HTTP ${res.status}.`),
      );
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
