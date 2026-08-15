import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCCfJmrl4wcBgqK2HWkonfsvYPriMbmV2c",
  authDomain: "nimbusdo.firebaseapp.com",
  projectId: "nimbusdo",
  storageBucket: "nimbusdo.firebasestorage.app",
  messagingSenderId: "270090650953",
  appId: "1:270090650953:web:e68fb8e36557702a514698",
  measurementId: "G-CY9Q6179MC",
};

const LEGACY_SESSION_KEY = "nimbus-api-session";
const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);

export const firebaseAuth = getAuth(firebaseApp);

function configuredApiBaseUrl() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const explicit = env?.VITE_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined" && /(?:firebaseapp\.com|web\.app)$/i.test(window.location.hostname)) {
    return "https://nimbusdo.onrender.com";
  }
  return "";
}

export const apiBaseUrl = configuredApiBaseUrl();

export function getLegacySessionToken() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(LEGACY_SESSION_KEY);
}

export function setLegacySessionToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(LEGACY_SESSION_KEY, token);
  else window.localStorage.removeItem(LEGACY_SESSION_KEY);
}

export async function getNimbusAuthToken() {
  const legacy = getLegacySessionToken();
  if (legacy) return legacy;
  await firebaseAuth.authStateReady();
  return firebaseAuth.currentUser?.getIdToken() ?? null;
}

export function apiUrl(path: string) {
  return apiBaseUrl && path.startsWith("/") ? `${apiBaseUrl}${path}` : path;
}

let configured = false;

export function configureNimbusApiRuntime() {
  if (configured || typeof window === "undefined") return;
  configured = true;

  setBaseUrl(apiBaseUrl || null);
  setAuthTokenGetter(getNimbusAuthToken);

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const originalUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isNimbusApi = originalUrl.startsWith("/api") || Boolean(apiBaseUrl && originalUrl.startsWith(`${apiBaseUrl}/api`));
    if (!isNimbusApi) return nativeFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has("authorization")) {
      const token = await getNimbusAuthToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    }

    const resolvedInput = originalUrl.startsWith("/api") ? apiUrl(originalUrl) : input;
    return nativeFetch(resolvedInput, { ...init, headers, credentials: "include" });
  };
}
