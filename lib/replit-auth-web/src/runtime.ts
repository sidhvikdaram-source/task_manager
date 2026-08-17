import { initializeApp, getApp, getApps } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
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

const NIMBUS_APP_CHECK_SITE_KEY = "6LdIeIktAAAAAJw1myCo9Ed7A5cEu4JnrbiO_Ubp";

const LEGACY_SESSION_KEY = "nimbus-api-session";
const firebaseWasInitialized = getApps().length > 0;
export const firebaseApp = firebaseWasInitialized ? getApp() : initializeApp(FIREBASE_CONFIG);

declare global {
  interface Window {
    __nimbusFirebaseAppCheck?: AppCheck;
  }
}

export const firebaseAppCheck = (() => {
  if (typeof window === "undefined") return null;
  if (window.__nimbusFirebaseAppCheck) return window.__nimbusFirebaseAppCheck;
  window.__nimbusFirebaseAppCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(NIMBUS_APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  return window.__nimbusFirebaseAppCheck;
})();

export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = firebaseWasInitialized
  ? getFirestore(firebaseApp)
  : initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });

export type NimbusApiHandler = (request: Request) => Promise<Response>;
let firebaseApiHandler: NimbusApiHandler | null = null;

export function setNimbusApiHandler(handler: NimbusApiHandler) {
  firebaseApiHandler = handler;
}

function configuredApiBaseUrl() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const explicit = env?.VITE_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
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

export function configureNimbusApiRuntime(handler?: NimbusApiHandler) {
  if (configured || typeof window === "undefined") return;
  configured = true;
  if (handler) setNimbusApiHandler(handler);

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

    if (firebaseApiHandler && originalUrl.startsWith("/api")) {
      const request = new Request(new URL(originalUrl, window.location.origin), {
        ...init,
        method: init.method ?? (input instanceof Request ? input.method : "GET"),
        headers,
        body: init.body ?? (input instanceof Request ? input.body : undefined),
      });
      return firebaseApiHandler(request);
    }

    const resolvedInput = originalUrl.startsWith("/api") ? apiUrl(originalUrl) : input;
    return nativeFetch(resolvedInput, { ...init, headers, credentials: "include" });
  };
}
