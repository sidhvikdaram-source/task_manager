import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../public/_worker.js";
const make = (path, method = "POST", origin = "https://nimbusdo.web.app") =>
  new Request("https://nimbus-ai-gateway.pages.dev" + path, {
    method,
    headers: { Origin: origin, Authorization: "Bearer test" },
    ...(method === "POST" ? { body: '{"message":"Hello"}' } : {}),
  });
test("forwards auth, body and mode to the existing private Worker", async () => {
  let received;
  const response = await gateway.fetch(make("/general"), {
    NIMBUS_AI: {
      fetch: async (r) => {
        received = r;
        return new Response("data: [DONE]\n\n", {
          headers: {
            "Content-Type": "text/event-stream",
            "Access-Control-Allow-Origin": "https://nimbusdo.web.app",
          },
        });
      },
    },
  });
  assert.equal(received.headers.get("Authorization"), "Bearer test");
  assert.equal(received.headers.get("Origin"), "https://nimbusdo.web.app");
  assert.equal(new URL(received.url).pathname, "/general");
  assert.equal((await received.json()).message, "Hello");
  assert.equal(response.headers.get("Content-Type"), "text/event-stream");
});
test("untrusted origins and unsupported routes cannot reach the Worker", async () => {
  const env = {
    NIMBUS_AI: {
      fetch: async () => {
        throw new Error("Must not be called");
      },
    },
  };
  assert.equal(
    (await gateway.fetch(make("/general", "POST", "https://evil.test"), env))
      .status,
    403,
  );
  assert.equal((await gateway.fetch(make("/unrelated"), env)).status, 404);
});
test("upstream failures return readable CORS-enabled errors without credentials", async () => {
  const r = await gateway.fetch(make("/general"), {
    NIMBUS_AI: {
      fetch: async () => {
        throw new Error("private implementation detail");
      },
    },
  });
  assert.equal(r.status, 502);
  assert.equal(
    r.headers.get("Access-Control-Allow-Origin"),
    "https://nimbusdo.web.app",
  );
  assert.ok(!(await r.text()).includes("private implementation detail"));
});
test("health probe needs no credentials and exposes no account data", async () => {
  const r = await gateway.fetch(make("/health", "GET"), {});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { service: "nimbus-ai", status: "ok" });
});
test("Firebase hosting alias forwards its origin and receives readable failures", async () => {
  const origin = "https://nimbusdo.firebaseapp.com";
  let forwarded;
  const env = {
    NIMBUS_AI: {
      fetch: async (request) => {
        forwarded = request.headers.get("Origin");
        throw new Error("unavailable");
      },
    },
  };
  const response = await gateway.fetch(make("/general", "POST", origin), env);
  assert.equal(forwarded, origin);
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
});
