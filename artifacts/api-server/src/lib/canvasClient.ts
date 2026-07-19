import crypto from "node:crypto";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 4;

export function validateOAuthState(expected: string | undefined, actual: unknown) {
  if (!expected || typeof actual !== "string") return false;
  const left = Buffer.from(expected); const right = Buffer.from(actual);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function validateCanvasUrl(raw: string, kind: "base" | "feed") {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Canvas URLs must use HTTPS");
  const host = url.hostname.toLowerCase();
  if (!(host === "instructure.com" || host.endsWith(".instructure.com"))) {
    throw new Error("Use an official Canvas instructure.com URL");
  }
  if (url.username || url.password) throw new Error("Canvas URLs cannot contain credentials");
  if (kind === "base") return url.origin;
  if (!/calendar|ical|feed/i.test(url.pathname)) throw new Error("That does not look like a Canvas calendar feed URL");
  return url.toString();
}

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function canvasRequest(url: string, accessToken: string, init: RequestInit = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: "error",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...init.headers },
      });
      if ((response.status === 429 || response.status >= 500) && attempt <= MAX_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(8_000, 400 * 2 ** attempt));
        continue;
      }
      if (!response.ok) {
        if (response.status === 401) throw new Error("Canvas access was revoked or expired");
        throw new Error(`Canvas request failed (${response.status})`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function nextLink(header: string | null) {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export async function canvasPaginated<T>(url: string, accessToken: string): Promise<T[]> {
  const all: T[] = [];
  let next: string | null = url;
  while (next) {
    const response = await canvasRequest(next, accessToken);
    const page = await response.json() as T[];
    all.push(...page);
    next = nextLink(response.headers.get("link"));
  }
  return all;
}
