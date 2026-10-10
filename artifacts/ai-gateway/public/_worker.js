// The gateway holds no provider secret. The existing Worker verifies each sign-in.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = "https://nimbusdo.web.app";
    const headers = {
      "Access-Control-Allow-Origin": allowed,
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    const json = (value, status) => Response.json(value, { status, headers });
    if (origin && origin !== allowed)
      return json({ error: "Origin not allowed" }, 403);
    if (url.pathname === "/health" && request.method === "GET")
      return json({ service: "nimbus-ai", status: "ok" }, 200);
    if (
      !["/general", "/task"].includes(url.pathname) ||
      !["POST", "OPTIONS"].includes(request.method)
    )
      return json({ error: "Not found" }, 404);
    try {
      return await env.NIMBUS_AI.fetch(
        new Request(`https://nimbus-ai.internal${url.pathname}`, request),
      );
    } catch {
      return json(
        {
          error:
            "AI connection is temporarily unavailable. Your chat is saved; please retry.",
        },
        502,
      );
    }
  },
};
