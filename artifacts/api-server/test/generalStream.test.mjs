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
