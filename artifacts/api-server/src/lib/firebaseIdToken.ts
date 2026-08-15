import crypto from "node:crypto";

const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const DEFAULT_PROJECT_ID = "nimbusdo";

type FirebaseTokenHeader = { alg?: unknown; kid?: unknown };
export type FirebaseTokenClaims = {
  aud?: unknown;
  auth_time?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  firebase?: unknown;
  iat?: unknown;
  iss?: unknown;
  name?: unknown;
  picture?: unknown;
  sub?: unknown;
  user_id?: unknown;
};

let cachedCerts: Record<string, string> = {};
let certsExpireAt = 0;

function decodePart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function maxAgeMs(cacheControl: string | null) {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) * 1000 : 60 * 60 * 1000;
}

async function getFirebaseCerts() {
  if (Date.now() < certsExpireAt && Object.keys(cachedCerts).length > 0) return cachedCerts;
  const response = await fetch(FIREBASE_CERTS_URL, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Firebase certificate request failed with ${response.status}`);
  const certs = await response.json() as Record<string, string>;
  if (!certs || typeof certs !== "object" || Object.keys(certs).length === 0) {
    throw new Error("Firebase returned no signing certificates");
  }
  cachedCerts = certs;
  certsExpireAt = Date.now() + maxAgeMs(response.headers.get("cache-control"));
  return certs;
}

export function validateFirebaseClaims(claims: FirebaseTokenClaims, projectId = process.env.FIREBASE_PROJECT_ID ?? DEFAULT_PROJECT_ID) {
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId) throw new Error("Firebase token audience is invalid");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Firebase token issuer is invalid");
  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 128) throw new Error("Firebase token subject is invalid");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("Firebase token has expired");
  if (typeof claims.iat !== "number" || claims.iat > now + 60) throw new Error("Firebase token issued-at time is invalid");
  if (typeof claims.auth_time !== "number" || claims.auth_time > now + 60) throw new Error("Firebase authentication time is invalid");
  return claims as FirebaseTokenClaims & { sub: string };
}

export async function verifyFirebaseIdToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Firebase token is malformed");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodePart<FirebaseTokenHeader>(encodedHeader);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Firebase token header is invalid");
  }
  const certs = await getFirebaseCerts();
  const certificate = certs[header.kid];
  if (!certificate) throw new Error("Firebase token uses an unknown signing key");
  const validSignature = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    crypto.createPublicKey(certificate),
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!validSignature) throw new Error("Firebase token signature is invalid");
  return validateFirebaseClaims(decodePart<FirebaseTokenClaims>(encodedPayload));
}
