import test from "node:test";
import assert from "node:assert/strict";
import { searchWeb, searchSourceFooter } from "../src/webSearch.mjs";
import { buildGeneralCompletion } from "../src/generalInference.mjs";
test("search uses the regular prompt, not private context, and bounds evidence", async () => {
  const result = await searchWeb(
    {
      message: "NASA missions",
      history: [{ content: "Private history" }],
      rubric: "Private rubric",
      searchQuery: "Ignored legacy query",
    },
    {
      fetcher: async (url, options) => {
        assert.equal(url, "https://api.firecrawl.dev/v2/search");
        assert.deepEqual(JSON.parse(options.body), {
          query: "NASA missions",
          limit: 3,
          sources: ["web"],
          safe: true,
          timeout: 10000,
        });
        assert.equal(options.headers.Authorization, undefined);
        return Response.json({
          success: true,
          data: {
            web: [
              {
                url: "https://nasa.gov/",
                title: "NASA",
                description: "x".repeat(2000),
              },
              { url: "javascript:alert(1)" },
              { url: "https://user:password@example.com" },
            ],
          },
        });
      },
    },
  );
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].snippet.length, 1200);
  assert.match(searchSourceFooter(result), /\[NASA\]\(https:\/\/nasa.gov\/\)/);
  const completion = buildGeneralCompletion({
    message: "Describe missions",
    webSources: result,
  });
  assert.deepEqual(completion.nimbus.context.webSources, result);
  assert.match(completion.messages[0].content, /untrusted evidence/);
});
test("quota errors and empty results never pretend a search succeeded", async () => {
  for (const response of [
    new Response("private provider error", { status: 429 }),
    Response.json({ success: true, data: { web: [] } }),
  ])
    await assert.rejects(
      searchWeb({ message: "NASA" }, { fetcher: async () => response }),
      /Web search is unavailable/,
    );
  await assert.rejects(searchWeb({ message: " " }), /Enter a message/);
  await searchWeb(
    { message: "NASA missions ".repeat(100) },
    {
      fetcher: async (_url, options) => {
        const query = JSON.parse(options.body).query;
        assert.ok(query.length <= 400);
        assert.ok(query.endsWith("NASA") || query.endsWith("missions"));
        return Response.json({
          success: true,
          data: { web: [{ url: "https://nasa.gov/" }] },
        });
      },
    },
  );
});
