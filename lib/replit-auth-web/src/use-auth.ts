import { useState, useEffect, useCallback } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
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
    await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    await refreshUser();
  }, [isEmbedded, refreshUser]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    setLegacySessionToken(null);
    const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    publishUser(toAuthUser(credential.user));
  }, [publishUser]);

  const registerWithPassword = useCallback(async (email: string, password: string, firstName?: string) => {
    setLegacySessionToken(null);
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
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
