import test from "node:test";
import assert from "node:assert/strict";
import { aiEndpoints, fetchAIResponse } from "../../task-manager/src/lib/aiConnection.ts";
const init = { method: "POST", headers: { Authorization: "Bearer fixture-token" }, body: '{"message":"Hello"}' };
test("only default production routing uses both existing Nimbus endpoints", () => {
  assert.equal(aiEndpoints(true).length, 2);
  assert.deepEqual(aiEndpoints(false), []);
  assert.deepEqual(aiEndpoints(true, " https://staging.example/ "), ["https://staging.example"]);
});
test("a blocked gateway retries the existing Worker and preserves authentication and body", async () => {
  const urls = aiEndpoints(true);
  const calls = [];
  const answer = new Response("data: [DONE]\n\n");
  const response = await fetchAIResponse(urls, "general", init, async (url, options) => {
    calls.push(url);
    assert.equal(options, init);
    return calls.length === 1 ? Promise.reject(new TypeError("Failed to fetch")) : answer;
  });
  assert.equal(response, answer);
  assert.deepEqual(calls, urls.map(url => url + "/general"));
});
test("successful and HTTP error responses are never silently resubmitted", async () => {
  for (const status of [200, 401, 429, 500]) {
    let calls = 0;
    const response = await fetchAIResponse(aiEndpoints(true), "general", init, async () => {
      calls++;
      return new Response("fixture", { status });
    });
    assert.equal(calls, 1);
    assert.equal(response.status, status);
  }
});
test("two network failures retain the saved-chat error without exposing credentials", async () => {
  await assert.rejects(() => fetchAIResponse(aiEndpoints(true), "general", init, async () => {
    throw new TypeError("Network unavailable");
  }), error => /Your chat is saved/.test(error.message) && !/fixture-token/.test(error.message));
});
test("cancelled and non-network errors do not retry", async () => {
  for (const error of [new DOMException("Stopped", "AbortError"), new Error("Unexpected")]) {
    let calls = 0;
    await assert.rejects(() => fetchAIResponse(aiEndpoints(true), "general", init, async () => {
      calls++;
      throw error;
    }), error);
    assert.equal(calls, 1);
  }
  const abort = new AbortController(); abort.abort();
  let calls = 0;
  await assert.rejects(() => fetchAIResponse(aiEndpoints(true), "general", { ...init, signal: abort.signal }, async () => { calls++; return new Response(); }), { name: "AbortError" });
  assert.equal(calls, 0);
});
test("Task AI keeps its existing single-endpoint behavior", async () => {
  let calls = 0;
  await assert.rejects(() => fetchAIResponse(aiEndpoints(true), "task", init, async () => { calls++; throw new TypeError("Offline"); }), /could not connect/);
  assert.equal(calls, 1);
});
