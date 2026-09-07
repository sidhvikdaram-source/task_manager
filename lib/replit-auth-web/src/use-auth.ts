import { useState, useEffect, useCallback } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  browserLocalPersistence,
  setPersistence,
  updateProfile,
  type User,
} from "firebase/auth";
import type { AuthUser } from "@workspace/api-client-react";
import {
  firebaseAuth,
  setLegacySessionToken,
} from "./runtime";

export type { AuthUser };

const AUTH_CHANGED_EVENT = "velocity-auth-changed";
const persistenceReady = setPersistence(firebaseAuth, browserLocalPersistence).catch(() => undefined);

function firebaseAuthCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function authMessage(error: unknown) {
  const code = firebaseAuthCode(error);
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "That email and password do not match. If you originally used Google, choose Continue with Google instead.";
  }
  if (code === "auth/too-many-requests") return "Firebase temporarily limited sign-ins after repeated attempts. Wait a few minutes, then try once more.";
  if (code === "auth/network-request-failed" || code === "auth/internal-error") return "Nimbus could not reach Firebase. Check your connection and try again; your account data is safe.";
  if (code === "auth/email-already-in-use") return "That email already has an account. Switch to Log in instead.";
  if (code === "auth/weak-password") return "Use a password with at least six characters.";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google sign-in window. Allow pop-ups for Nimbus and try again.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed before it finished.";
  return error instanceof Error ? error.message : "Authentication failed.";
}

async function withTransientRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code = firebaseAuthCode(error);
      if (code !== "auth/network-request-failed" && code !== "auth/internal-error") break;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw new Error(authMessage(lastError));
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string, firstName?: string) => Promise<void>;
  logout: () => void;
}

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const names = user.displayName?.trim().split(/\s+/) ?? [];
  return {
    id: user.uid,
    email: user.email ?? null,
    firstName: names[0] ?? null,
    lastName: names.slice(1).join(" ") || null,
    profileImageUrl: user.photoURL ?? null,
  };
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
    await firebaseAuth.authStateReady();
    const nextUser = toAuthUser(firebaseAuth.currentUser);
    publishUser(nextUser);
    return nextUser;
  }, [publishUser]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!cancelled) publishUser(toAuthUser(firebaseUser));
    });

    return () => {
      cancelled = true;
      unsubscribe();
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
    await persistenceReady;
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      await refreshUser();
    } catch (error) {
      throw new Error(authMessage(error));
    }
  }, [isEmbedded, refreshUser]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    setLegacySessionToken(null);
    await persistenceReady;
    const credential = await withTransientRetry(() => signInWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password));
    publishUser(toAuthUser(credential.user));
  }, [publishUser]);

  const registerWithPassword = useCallback(async (email: string, password: string, firstName?: string) => {
    setLegacySessionToken(null);
    await persistenceReady;
    const credential = await withTransientRetry(() => createUserWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password));
    if (firstName?.trim()) await updateProfile(credential.user, { displayName: firstName.trim() });
    publishUser(toAuthUser(credential.user));
  }, [publishUser]);

  const logout = useCallback(() => {
    setLegacySessionToken(null);
    void signOut(firebaseAuth).finally(() => {
      publishUser(null);
      if (!isEmbedded) window.location.href = "/";
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
