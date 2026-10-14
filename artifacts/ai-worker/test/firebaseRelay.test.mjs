import test from "node:test";
import assert from "node:assert/strict";
import {
  processRelay,
  scheduleRelay,
  pollRelay,
} from "../src/firebaseRelay.mjs";
const env = { FIREBASE_RELAY_UID: "processor" };
const id = "ABCDEFGHIJKLMNOPQRST";
const request = () =>
  new Request("https://internal/relay-process", {
    method: "POST",
    headers: { Authorization: "Bearer fixture" },
    body: JSON.stringify({ id }),
  });
const fields = {
  ownerUid: { stringValue: "owner" },
  mode: { stringValue: "general" },
  inputJson: { stringValue: '{"message":"Hello"}' },
  status: { stringValue: "pending" },
  createdAt: { timestampValue: new Date().toISOString() },
};
test("only the dedicated processor can fetch a queued prompt", async () => {
  for (const uid of ["someone-else", null]) {
    const response = await processRelay(request(), env, {
      verify: async () => {
        if (!uid) throw Error("bad");
        return uid;
      },
      fetcher: async () => {
        throw Error("No database access");
      },
    });
    assert.equal(response.status, uid ? 403 : 401);
  }
});
test("queue processing claims once, uses the rules-verified owner, and preserves final response", async () => {
  const patches = [];
  const response = await processRelay(request(), env, {
    verify: async () => "processor",
    fetcher: async (_url, options) => {
      if (options.method === "PATCH") {
        const values = JSON.parse(options.body).fields;
        patches.push(values);
        return Response.json({
          name: `projects/nimbusdo/databases/(default)/documents/aiRelayJobs/${id}`,
          updateTime: "2026-10-14T00:00:01Z",
          fields: values,
        });
      }
      return Response.json({
        name: `projects/nimbusdo/databases/(default)/documents/aiRelayJobs/${id}`,
        fields,
        updateTime: "2026-10-14T00:00:00Z",
      });
    },
    run: async (mode, input, uid) => {
      assert.equal(patches[0].status.stringValue, "processing");
      assert.equal(mode, "general");
      assert.equal(uid, "owner");
      assert.deepEqual(input, { message: "Hello" });
      return new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(patches[1].status.stringValue, "done");
  assert.equal(patches[1].responseText.stringValue, "data: [DONE]\n\n");
});
test("already claimed, expired, and conflicting jobs never call AI", async () => {
  for (const scenario of ["claimed", "expired", "conflict"]) {
    const response = await processRelay(request(), env, {
      verify: async () => "processor",
      fetcher: async (_url, options) => {
        if (options.method === "PATCH" && scenario === "expired")
          return Response.json({ name: `queue/${id}`, updateTime: "fixture" });
        if (options.method === "PATCH")
          return new Response("conflict", { status: 409 });
        return Response.json({
          name: `queue/${id}`,
          updateTime: "fixture",
          fields: {
            ...fields,
            ...(scenario === "claimed"
              ? { status: { stringValue: "processing" } }
              : {}),
            ...(scenario === "expired"
              ? { createdAt: { timestampValue: "2000-01-01T00:00:00Z" } }
              : {}),
          },
        });
      },
      run: async () => {
        throw Error("Must not call AI");
      },
    });
    assert.equal(response.status, scenario === "conflict" ? 502 : 200);
  }
});
test("missing relay credentials leave the scheduler inactive", async () => {
  await scheduleRelay({}, async () => {
    throw Error("No requests while inactive");
  });
});
test("scheduler uses the built-in status index and delegates authenticated jobs", async () => {
  let queries = 0,
    dispatches = 0;
  const result = await scheduleRelay(
    {
      FIREBASE_RELAY_UID: "schedule-fixture",
      FIREBASE_RELAY_REFRESH_TOKEN: "fixture-refresh",
      FIREBASE_PUBLIC_API_KEY: "fixture-public",
      RELAY_PROCESSOR: {
        fetch: async (request) => {
          assert.equal(
            request.headers.get("Authorization"),
            "Bearer fixture-id-token",
          );
          assert.equal((await request.json()).id, id);
          dispatches++;
          return Response.json({ status: "done" });
        },
      },
    },
    async (url, options) => {
      if (url.includes("securetoken"))
        return Response.json({
          user_id: "schedule-fixture",
          id_token: "fixture-id-token",
          expires_in: "3600",
        });
      const query = JSON.parse(options.body).structuredQuery;
      if (++queries === 1) {
        assert.equal(query.where.fieldFilter.field.fieldPath, "status");
        assert.equal(query.orderBy, undefined);
        return Response.json([{ document: { name: `queue/${id}` } }]);
      }
      return Response.json([]);
    },
  );
  assert.equal(dispatches, 1);
  assert.deepEqual(result, { dispatched: 1, failed: 0 });
});
test("manual polling requires the dedicated identity and fails closed when inactive", async () => {
  const other = await pollRelay(request(), env, {
    verify: async () => "other",
    fetcher: async () => {
      throw Error("Must not query");
    },
  });
  assert.equal(other.status, 401);
  const inactive = await pollRelay(request(), env, {
    verify: async () => "processor",
  });
  assert.equal(inactive.status, 503);
});

test("minute polling keeps scanning while inference runs and deduplicates claims", async () => {
  let queries = 0,
    dispatches = 0,
    sleeps = 0;
  const releases = [];
  const result = await scheduleRelay(
    {
      FIREBASE_RELAY_UID: "window-fixture",
      FIREBASE_RELAY_REFRESH_TOKEN: "fixture",
      FIREBASE_PUBLIC_API_KEY: "public",
      RELAY_PROCESSOR: {
        fetch: () => {
          dispatches++;
          return new Promise((resolve) =>
            releases.push(() => resolve(Response.json({ status: "done" }))),
          );
        },
      },
    },
    async (url, options) => {
      if (url.includes("securetoken"))
        return Response.json({
          user_id: "window-fixture",
          id_token: "fixture",
          expires_in: "3600",
        });
      const query = JSON.parse(options.body).structuredQuery;
      if (query.where.fieldFilter.field.fieldPath === "createdAt")
        return Response.json([]);
      queries++;
      if (queries === 2) {
        assert.equal(dispatches, 1);
        for (const release of releases) release();
      }
      return Response.json([{ document: { name: `queue/${id}` } }]);
    },
    {
      rounds: 2,
      sleep: async (ms) => {
        assert.equal(ms, 10000);
        sleeps++;
      },
    },
  );
  assert.equal(queries, 2);
  assert.equal(sleeps, 1);
  assert.deepEqual(result, { dispatched: 1, failed: 0 });
});
