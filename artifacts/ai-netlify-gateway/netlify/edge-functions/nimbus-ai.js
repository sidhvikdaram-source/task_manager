const UPSTREAM = "https://nimbus-ai.nimbusdo-sidhvik-ai.workers.dev";
const ORIGINS = ["https://nimbusdo.web.app", "https://nimbusdo.firebaseapp.com"];

// Narrow application gateway, not an open proxy. Provider credentials stay in
// the existing Worker, which verifies Firebase identity and enforces quotas.
export function createGateway(fetcher = fetch) {
  return async function handler(request) {
    const origin = request.headers.get("Origin");
    const headers = {
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    const json = (body, status) => Response.json(body, { status, headers });
    if (origin && !ORIGINS.includes(origin)) return json({ error: "Origin not allowed" }, 403);
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") {
      try {
        const response = await fetcher(`${UPSTREAM}/health`, {
          headers: origin ? { Origin: origin } : {},
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
        });
        return response.ok ? json({ service: "nimbus-ai", status: "ok" }, 200)
          : json({ error: "AI service is unavailable." }, 502);
      } catch { return json({ error: "AI service is unavailable." }, 502); }
    }
    if (!["/task", "/general"].includes(path)) return json({ error: "Not found" }, 404);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      ...headers,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    } });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const maxBytes = path === "/task" ? 100000 : 450000;
    if (Number(request.headers.get("Content-Length")) > maxBytes)
      return json({ error: "Request too large." }, 413);
    try {
      // The URL is fixed; query parameters cannot select another destination.
      const response = await fetcher(new Request(`${UPSTREAM}${path}`, request));
      const forwarded = new Headers(headers);
      for (const name of ["Content-Type", "Retry-After", "X-Nimbus-Model", "X-Nimbus-Harness"])
        if (response.headers.has(name)) forwarded.set(name, response.headers.get(name));
      return new Response(response.body, { status: response.status, headers: forwarded });
    } catch {
      return json({ error: "AI connection is temporarily unavailable. Please retry." }, 502);
    }
  };
}

export default createGateway();
