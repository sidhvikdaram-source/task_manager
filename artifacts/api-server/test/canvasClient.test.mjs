import assert from "node:assert/strict";
import test from "node:test";
import { canvasPaginated, canvasRequest, validateCanvasUrl, validateOAuthState } from "../src/lib/canvasClient.ts";

test("accepts official Canvas HTTPS URLs and rejects SSRF targets", () => {
  assert.equal(validateCanvasUrl("https://fisd.instructure.com", "base"), "https://fisd.instructure.com");
  assert.throws(() => validateCanvasUrl("http://fisd.instructure.com", "base"), /HTTPS/);
  assert.throws(() => validateCanvasUrl("https://127.0.0.1/calendar.ics", "feed"), /official Canvas/);
  assert.throws(() => validateCanvasUrl("https://instructure.com.evil.example/calendar.ics", "feed"), /official Canvas/);
});

test("validates OAuth state exactly", () => {
  assert.equal(validateOAuthState("known-state", "known-state"), true);
  assert.equal(validateOAuthState("known-state", "other-state"), false);
  assert.equal(validateOAuthState(undefined, "known-state"), false);
});

test("follows Canvas pagination sequentially", async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return calls.length === 1
    ? new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "content-type": "application/json", link: '<https://fisd.instructure.com/api/v1/items?page=2>; rel="next"' } })
    : new Response(JSON.stringify([{ id: 2 }]), { status: 200, headers: { "content-type": "application/json" } }); };
  try { assert.deepEqual(await canvasPaginated("https://fisd.instructure.com/api/v1/items", "secret"), [{ id: 1 }, { id: 2 }]); assert.equal(calls.length, 2); }
  finally { globalThis.fetch = original; }
});

test("retries a 429 using Retry-After", async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls += 1; return calls === 1 ? new Response("limited", { status: 429, headers: { "retry-after": "0.001" } }) : new Response("ok", { status: 200 }); };
  try { const response = await canvasRequest("https://fisd.instructure.com/api/v1/courses", "secret"); assert.equal(await response.text(), "ok"); assert.equal(calls, 2); }
  finally { globalThis.fetch = original; }
});
