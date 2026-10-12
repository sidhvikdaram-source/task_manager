import test from "node:test";
import assert from "node:assert/strict";
import { readGeneralStream } from "../../task-manager/src/lib/generalStream.ts";
const streamResponse = (text) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(text);
        for (let i = 0; i < bytes.length; i += 3)
          controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }),
  );
test("checking and quota progress never become answer text; safe server failures remain actionable", async () => {
  const statuses = [];
  const input =
    'data: {"status":"working"}\n\ndata: {"status":"waiting"}\n\ndata: {"status":"checking"}\n\ndata: {"choices":[{"delta":{"content":"Checked answer."}}]}\n\ndata: [DONE]\n\n';
  assert.equal(
    await readGeneralStream(
      streamResponse(input),
      () => {},
      (value) => statuses.push(value),
    ),
    "Checked answer.",
  );
  assert.deepEqual(statuses, ["working", "waiting", "checking"]);
  await assert.rejects(
    () =>
      readGeneralStream(
        streamResponse(
          'data: {"error":{"message":"The free AI allowance is busy. Your chat is saved."}}\n\ndata: [DONE]\n\n',
        ),
        () => {},
      ),
    /free AI allowance/,
  );
});
test("general stream handles fragmented UTF-8 and ignores reasoning fields", async () => {
  const input =
    'data: {"choices":[{"delta":{"reasoning":"private thought"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"Clarity — matters."}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  let latest;
  assert.equal(
    await readGeneralStream(streamResponse(input), (v) => (latest = v)),
    "Clarity — matters.",
  );
  assert.equal(latest, "Clarity — matters.");
});
test("interrupted stream retains delivered answer but reports failure", async () => {
  let latest;
  await assert.rejects(
    () =>
      readGeneralStream(
        streamResponse('data: {"choices":[{"delta":{"content":"Partial"}}]}\n'),
        (v) => (latest = v),
      ),
    /before the answer finished/,
  );
  assert.equal(latest, "Partial");
});
test("response limit is reported without marking a partial answer complete", async () => {
  await assert.rejects(
    () =>
      readGeneralStream(
        streamResponse(
          'data: {"choices":[{"finish_reason":"length"}]}\n\ndata: [DONE]\n',
        ),
        () => {},
      ),
    /response limit/,
  );
});
test("Cloudflare native chunks stream answers while reasoning stays private", async () => {
  const input =
    'data: {"reasoning":"hidden"}\n\ndata: {"response":"Clear — "}\n\ndata: {"response":"feedback."}\n\ndata: [DONE]\n\n';
  assert.equal(
    await readGeneralStream(streamResponse(input), () => {}),
    "Clear — feedback.",
  );
});
test("Cloudflare native truncation cannot save an answer as complete", async () => {
  await assert.rejects(
    () =>
      readGeneralStream(
        streamResponse(
          'data: {"response":"Partial"}\n\ndata: {"finish_reason":"length"}\n\ndata: [DONE]\n\n',
        ),
        () => {},
      ),
    /response limit/,
  );
});
test("GLM thinking chunks stay private and final text chunks remain copyable", async () => {
  const input =
    'data: {"choices":[{"delta":{"content":[{"type":"thinking","thinking":[{"type":"text","text":"Private reasoning"}]}]}}]}\n\ndata: {"choices":[{"delta":{"content":[{"type":"text","text":"Specific "},{"type":"text","text":"criticism."}]}}]}\n\ndata: [DONE]\n\n';
  let latest = "";
  assert.equal(
    await readGeneralStream(streamResponse(input), (v) => (latest = v)),
    "Specific criticism.",
  );
  assert.equal(latest, "Specific criticism.");
});
