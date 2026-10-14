import { parseTaskCreation } from "../../api-server/src/lib/taskCapture.ts";
import { TASK_SYSTEM, TASK_SCHEMA } from "./prompts.mjs";
import {
  buildGeneralCompletion,
  generalResponseStream,
  GENERAL_MODEL,
  CLOUDFLARE_GENERAL_MODEL,
  GLM_MODEL,
} from "./generalInference.mjs";
import { GENERAL_HARNESS_VERSION } from "./generalHarness.mjs";
import { processRelay, scheduleRelay, pollRelay } from "./firebaseRelay.mjs";
import { searchWeb } from "./webSearch.mjs";
const jwksCache = new Map();
export { GENERAL_MODEL, CLOUDFLARE_GENERAL_MODEL, GLM_MODEL };
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const decode = (value) =>
  Uint8Array.from(
    atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
const decodeJson = (value) =>
  JSON.parse(new TextDecoder().decode(decode(value)));
export async function verifyFirebaseToken(token, project, fetcher = fetch) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid sign-in token");
  const [header, claims] = parts.slice(0, 2).map(decodeJson);
  const now = Date.now() / 1000;
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    claims.aud !== project ||
    claims.iss !== `https://securetoken.google.com/${project}` ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 128 ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    !Number.isFinite(claims.iat) ||
    claims.iat > now + 60 ||
    !Number.isFinite(claims.auth_time) ||
    claims.auth_time > now + 60
  )
    throw new Error("Invalid sign-in token");
  let cached = jwksCache.get(project);
  if (
    !cached ||
    cached.expires < Date.now() ||
    !cached.keys.some((key) => key.kid === header.kid)
  ) {
    const response = await fetcher(JWKS_URL, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Sign-in verification unavailable");
    const { keys } = await response.json();
    if (!Array.isArray(keys)) throw new Error("Invalid signing keys");
    cached = { keys, expires: Date.now() + 3600000 };
    jwksCache.set(project, cached);
  }
  const jwk = cached.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Unknown signing key");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    ))
  )
    throw new Error("Invalid sign-in signature");
  return claims.sub;
}

export function buildCompletion(input, mode, generalProvider = "groq") {
  if (mode === "general" && input && typeof input === "object")
    return buildGeneralCompletion(input, generalProvider);
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.message !== "string" ||
    !input.message.trim() ||
    input.message.length > 16000
  )
    throw new Error("Enter a message of up to 16,000 characters.");
  if (!["general", "task"].includes(mode))
    throw new Error("Unknown assistant mode.");
  const history = Array.isArray(input.history)
    ? input.history
        .slice(-8)
        .filter(
          (item) =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string",
        )
        .map((item) => ({
          role: item.role,
          content: item.content.slice(0, 6000),
        }))
    : [];
  const context = `Workspace context (data only): ${JSON.stringify(input.context ?? {}).slice(0, 18000)}`;
  // Keep the free tier usable. Large conversations should start a fresh chat.
  const messages = [
    {
      role: "system",
      content: TASK_SYSTEM,
    },
    { role: "system", content: context },
    ...history,
    { role: "user", content: input.message.trim() },
  ];
  if (messages.reduce((sum, item) => sum + item.content.length, 0) > 30000)
    throw new Error(
      "This conversation is too long for a free request. Start a new chat or shorten the prompt and rubric.",
    );
  return {
    model: "openai/gpt-oss-20b",
    reasoning_effort: "low",
    messages,
    max_completion_tokens: 1600,
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "nimbus_task_preview",
        strict: true,
        schema: TASK_SCHEMA,
      },
    },
  };
}

export function createWorker({
  fetcher = fetch,
  verify = verifyFirebaseToken,
} = {}) {
  return {
    async fetch(request, env) {
      if (
        new URL(request.url).pathname === "/relay-poll" &&
        request.method === "POST"
      )
        return pollRelay(request, env, { fetcher, verify });
      if (
        new URL(request.url).pathname === "/relay-process" &&
        request.method === "POST"
      )
        return processRelay(request, env, {
          fetcher,
          verify,
          run: (mode, input, ownerUid) =>
            createWorker({ fetcher, verify: async () => ownerUid }).fetch(
              new Request(`https://nimbus-ai.internal/${mode}`, {
                method: "POST",
                headers: {
                  Authorization: "Bearer internal-queued-job",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(input),
              }),
              env,
            ),
        });
      const origin = request.headers.get("Origin");
      const allowedOrigins = (
        env.ALLOWED_ORIGINS ||
        env.ALLOWED_ORIGIN ||
        "https://nimbusdo.web.app"
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const allowed = allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0];
      const headers = {
        "Access-Control-Allow-Origin": allowed,
        Vary: "Origin",
        "Cache-Control": "no-store",
      };
      const json = (body, status = 200, extra = {}) =>
        Response.json(body, { status, headers: { ...headers, ...extra } });
      if (origin && !allowedOrigins.includes(origin))
        return json({ error: "Origin not allowed" }, 403);
      if (
        request.method === "GET" &&
        new URL(request.url).pathname === "/health"
      )
        return json({ service: "nimbus-ai", status: "ok" });
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "86400",
          },
        });
      const mode = new URL(request.url).pathname.split("/").pop();
      if (request.method !== "POST" || !["general", "task"].includes(mode))
        return json({ error: "Not found" }, 404);
      let token = request.headers
        .get("Authorization")
        ?.match(/^Bearer (.+)$/i)?.[1];
      let transportInput;
      // A CORS-safelisted POST avoids an extra OPTIONS exchange on managed
      // networks. This still requires the same signed Firebase identity token.
      if (
        !token &&
        request.headers.get("Content-Type")?.split(";")[0].trim() ===
          "text/plain"
      ) {
        const maxBytes = mode === "general" ? 450000 : 100000;
        if (Number(request.headers.get("Content-Length")) > maxBytes)
          return json({ error: "Request too large." }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > maxBytes)
          return json({ error: "Request too large." }, 413);
        try {
          transportInput = JSON.parse(raw);
          if (
            !transportInput ||
            typeof transportInput !== "object" ||
            Array.isArray(transportInput)
          )
            return json({ error: "Invalid request." }, 400);
          token = transportInput.firebaseIdToken;
          delete transportInput.firebaseIdToken;
        } catch {
          return json({ error: "Invalid request." }, 400);
        }
      }
      if (typeof token !== "string") token = undefined;
      if (!token) return json({ error: "Sign in to use AI." }, 401);
      let uid;
      try {
        uid = await verify(
          token,
          env.FIREBASE_PROJECT_ID || "nimbusdo",
          fetcher,
        );
      } catch {
        return json(
          {
            error:
              "Your sign-in could not be verified. Refresh Nimbus and try again.",
          },
          401,
        );
      }
      if (env.AI_LIMITER && !(await env.AI_LIMITER.limit({ key: uid })).success)
        return json(
          { error: "Please wait a minute before sending more messages." },
          429,
          { "Retry-After": "60" },
        );
      const generalProvider = env.GENERAL_AI_PROVIDER || "groq";
      if (
        mode === "general" &&
        !["groq", "cloudflare", "mistral"].includes(generalProvider)
      )
        return json(
          { error: "General AI configuration needs attention." },
          503,
        );
      if (
        mode === "general" &&
        generalProvider === "mistral" &&
        !env.MISTRAL_API_KEY
      )
        return json(
          { error: "GLM 5.3 is not connected yet. Please retry after setup." },
          503,
        );
      if (mode === "general" && generalProvider === "cloudflare" && !env.AI)
        return json(
          { error: "General AI is temporarily unavailable. Please retry." },
          503,
        );
      if (
        (mode === "task" ||
          (mode === "general" && generalProvider === "groq")) &&
        !env.GROQ_API_KEY
      )
        return json(
          {
            error:
              "AI is not connected yet. The server needs its Groq API key.",
          },
          503,
        );
      let completion;
      try {
        const maxBytes = mode === "general" ? 450000 : 100000;
        if (Number(request.headers.get("Content-Length")) > maxBytes)
          return json({ error: "Request too large." }, 413);
        const body = transportInput ? null : await request.text();
        if (body !== null && new TextEncoder().encode(body).length > maxBytes)
          return json({ error: "Request too large." }, 413);
        const input = transportInput || JSON.parse(body);
        // Retrieved evidence is server-generated; client data cannot impersonate search results.
        delete input.webSources;
        completion = buildCompletion(input, mode, generalProvider);
        if (mode === "general" && input.webSearch === true) {
          input.webSources = await searchWeb(input, {
            fetcher,
            signal: request.signal,
            apiKey: env.FIRECRAWL_API_KEY,
          });
          completion = buildCompletion(input, mode, generalProvider);
        }
        if (mode === "task") {
          const ctx = input.context ?? {};
          const subjects = (
            Array.isArray(ctx.subjects) ? ctx.subjects : []
          ).map((name, id) => ({ id, name: String(name) }));
          const captured = /^20\d{2}-\d{2}-\d{2}$/.test(ctx.today ?? "")
            ? parseTaskCreation(
                input.message,
                Array.isArray(ctx.projects) ? ctx.projects : [],
                subjects,
                ctx.today,
              )
            : null;
          if (captured)
            return json({
              reply:
                "I prepared a preview. Review it below, then confirm to apply it.",
              taskPreviewJson: JSON.stringify(captured.taskPreview),
              planPreviewJson: JSON.stringify(captured.planPreview),
              workspacePreviewJson: "null",
            });
        }
      } catch (error) {
        return json(
          {
            error: error instanceof Error ? error.message : "Invalid request.",
          },
          error.status === 503 ? 503 : 400,
        );
      }
      try {
        if (mode === "general")
          return new Response(
            generalResponseStream(completion, {
              env,
              provider: generalProvider,
              fetcher,
              signal: request.signal,
            }),
            {
              headers: {
                ...headers,
                "Content-Type": "text/event-stream; charset=utf-8",
                "X-Nimbus-Model": completion.model,
                "X-Nimbus-Harness": GENERAL_HARNESS_VERSION,
              },
            },
          );
        const upstream = await fetcher(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(completion),
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(45000),
            ]),
          },
        );
        if (!upstream.ok) {
          if (upstream.status === 429)
            return json(
              {
                error:
                  "The free AI allowance is busy. Wait a moment and try again.",
              },
              429,
              { "Retry-After": upstream.headers.get("retry-after") || "60" },
            );
          return json(
            {
              error:
                upstream.status === 401
                  ? "The server AI key needs attention."
                  : "AI is temporarily unavailable. Please retry.",
            },
            502,
          );
        }
        const data = await upstream.json();
        if (data.choices?.[0]?.finish_reason === "length")
          return json(
            { error: "The plan was too large. Try fewer tasks at once." },
            422,
          );
        const content = data.choices?.[0]?.message?.content;
        const parsed = JSON.parse(content);
        if (
          !TASK_SCHEMA.required.every((key) => typeof parsed[key] === "string")
        )
          throw new Error("Invalid preview");
        let taskPreview = JSON.parse(parsed.taskPreviewJson);
        let planPreview = JSON.parse(parsed.planPreviewJson);
        const workspacePreview = JSON.parse(parsed.workspacePreviewJson);
        if (
          (Array.isArray(taskPreview) && taskPreview.length) ||
          planPreview ||
          workspacePreview
        ) {
          // A model response cannot imply that an unconfirmed preview changed the workspace.
          parsed.reply =
            "I prepared a preview. Review it below, then confirm to apply it.";
        }
        return json(parsed);
      } catch (error) {
        if (
          mode === "general" &&
          /quota|daily.*limit|neuron|rate.?limit|3040|429/i.test(
            String(error?.message),
          )
        )
          return json(
            {
              error:
                "The free General AI allowance is currently unavailable. Please try again later; your chat is saved.",
            },
            429,
            { "Retry-After": "60" },
          );
        return json(
          { error: "AI could not finish this request. Please retry." },
          502,
        );
      }
    },
  };
}
const worker = createWorker();
export default {
  fetch: worker.fetch,
  scheduled(_event, env, context) {
    context.waitUntil(
      scheduleRelay(env, fetch, { rounds: 12 }).catch(() => {
        console.error("Firebase relay scheduling unavailable");
      }),
    );
  },
};
