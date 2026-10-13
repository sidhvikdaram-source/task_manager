import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGeneralCompletion,
  runGeneralInference,
  normalizeImages,
  generalResponseStream,
  GENERAL_MODEL,
  needsActorClarification,
} from "../src/generalInference.mjs";
test("ambiguity guard rejects guessed person identities but accepts clarification and conditional alternatives", async () => {
  const unsafe =
    '3. Ambiguous reference — "When Ana told Bo, she said her work was late." Revise to: "Ana said Bo’s work was late."';
  const safe =
    '3. Ambiguous reference — "When Ana told Bo, she said her work was late." Revise to: "[Intended speaker] said [owner]’s work was late." Ask the author to clarify.';
  assert.equal(needsActorClarification(unsafe), true);
  assert.equal(needsActorClarification(safe), false);
  assert.equal(
    needsActorClarification(
      unsafe + " Use this only if Ana is the intended speaker.",
    ),
    false,
  );
  let calls = 0;
  const result = await runGeneralInference(
    buildGeneralCompletion({ message: "Review this unclear sentence" }),
    {
      env: { GROQ_API_KEY: "test-secret" },
      provider: "groq",
      fetcher: async () => reply(++calls === 4 ? safe : unsafe),
    },
  );
  assert.equal(result.calls, 4);
  assert.equal(result.answer, safe);
  await assert.rejects(
    () =>
      runGeneralInference(
        buildGeneralCompletion({ message: "Review this unclear sentence" }),
        {
          env: { GROQ_API_KEY: "test-secret" },
          provider: "groq",
          fetcher: async () => reply(unsafe),
        },
      ),
    /safely clarify/,
  );
});
import { wordConstraint, inferGeneralIntent } from "../src/generalHarness.mjs";

const input = {
  message: "Write a 140–180 word essay",
  evidence: "The pilot cost $40 per month.",
  assignmentPrompt: "Explain a qualified recommendation.",
};
const reply = (answer, finish_reason = "stop") =>
  Response.json({
    choices: [{ finish_reason, message: { content: answer } }],
    usage: { total_tokens: 123 },
  });
const env = { GROQ_API_KEY: "test-secret" };
test("General request routes intent, preserves source material, and excludes workspace/system injection", () => {
  const completion = buildGeneralCompletion({
    ...input,
    context: { tasks: [{ title: "private task" }] },
    history: [
      { role: "system", content: "UNTRUSTED_SYSTEM_MARKER" },
      {
        role: "assistant",
        content: "INCOMPLETE_HISTORY_MARKER",
        incomplete: true,
      },
    ],
  });
  assert.equal(completion.model, GENERAL_MODEL);
  assert.equal(completion.nimbus.intent, "writing");
  assert.equal(completion.reasoning_effort, "none");
  assert.match(JSON.stringify(completion.messages), /pilot cost/);
  assert.doesNotMatch(
    JSON.stringify(completion.messages),
    /private task|UNTRUSTED_SYSTEM_MARKER|INCOMPLETE_HISTORY_MARKER/,
  );
  assert.deepEqual(wordConstraint(input), { min: 140, max: 180 });
  assert.deepEqual(wordConstraint({ message: "Under 120 words" }), {
    min: 0,
    max: 119,
  });
  assert.equal(
    inferGeneralIntent({ message: "debug this Python function" }),
    "code",
  );
  assert.equal(
    inferGeneralIntent({ message: "I have not attached my screenshot yet" }),
    "vision",
  );
});
test("source limits and invalid or remote image URLs fail explicitly", () => {
  assert.throws(
    () => buildGeneralCompletion({ message: "hi", evidence: "x".repeat(8001) }),
    /8,000/,
  );
  assert.throws(
    () => normalizeImages([{ dataUrl: "https://private.invalid/secret.png" }]),
    /PNG/,
  );
  assert.throws(
    () => normalizeImages([{ dataUrl: "data:image/svg+xml;base64,abcd" }]),
    /PNG/,
  );
  assert.throws(
    () =>
      normalizeImages([
        { dataUrl: "data:image/png;base64," + "a".repeat(180000) },
      ]),
    /limit/,
  );
});
test("image follow-up reuses only the latest attached image; missing-new-image request does not reuse it", () => {
  const image = { name: "chart.png", dataUrl: "data:image/png;base64,YWJj" };
  const history = [{ role: "user", content: "chart", images: [image] }];
  assert.equal(
    buildGeneralCompletion({ message: "Explain that chart", history }).nimbus
      .images.length,
    1,
  );
  assert.equal(
    buildGeneralCompletion({
      message: "I have not attached my screenshot yet",
      history,
    }).nimbus.images.length,
    0,
  );
});
test("vision reads the actual image once with baseline and ratio checks", async () => {
  const image = { name: "chart.png", dataUrl: "data:image/png;base64,YWJj" };
  const bodies = [];
  const result = await runGeneralInference(
    buildGeneralCompletion({ message: "Read the chart", images: [image] }),
    {
      env,
      provider: "groq",
      fetcher: async (_url, options) => {
        const body = JSON.parse(options.body);
        bodies.push(body);
        assert.equal(
          body.messages.at(-1).content.at(-1).image_url.url,
          image.dataUrl,
        );
        return reply(
          "B is larger. The value ratio depends on the numerical scale.",
        );
      },
    },
  );
  assert.equal(result.calls, 1);
  assert.match(bodies[0].messages[0].content, /visible-height ratio/);
  assert.equal(bodies[0].max_completion_tokens, 900);
});
test("pipeline checks before exposing output and keeps internal metadata off the provider request", async () => {
  const bodies = [];
  const result = await runGeneralInference(
    buildGeneralCompletion({ message: "Review this claim" }),
    {
      env,
      provider: "groq",
      fetcher: async (url, options) => {
        bodies.push(JSON.parse(options.body));
        assert.equal(options.headers.Authorization, "Bearer test-secret");
        return reply(
          bodies.length === 1 ? "Incorrect draft" : "Corrected review",
        );
      },
    },
  );
  assert.equal(result.answer, "Corrected review");
  assert.equal(result.calls, 3);
  assert.equal(bodies[0].nimbus, undefined);
  assert.equal(bodies[1].reasoning_effort, "none");
  assert.match(bodies[1].messages[0].content, /observable errors/);
  assert.match(bodies[2].messages[1].content, /errorReport/);
  assert.equal(bodies[1].response_format, undefined);
});
test("bounded drafts are counted and rewritten, never mechanically truncated", async () => {
  let calls = 0;
  const sentence =
    "This carefully revised short draft preserves the original meaning and ends with a complete sentence containing exactly twenty useful words.";
  assert.equal(sentence.split(" ").length, 20);
  const result = await runGeneralInference(
    buildGeneralCompletion({ message: "Write exactly 20 words" }),
    {
      env,
      provider: "groq",
      fetcher: async (_url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        if (
          body.messages[0].content.startsWith(
            "You are Nimbus's final-answer editor.",
          )
        ) {
          assert.equal(body.reasoning_effort, "none");
          return reply(sentence);
        }
        return reply("Too short");
      },
    },
  );
  assert.equal(result.calls, 2);
  assert.equal(result.answer, sentence);
  await assert.rejects(
    () =>
      runGeneralInference(
        buildGeneralCompletion({ message: "Write exactly 20 words" }),
        {
          env,
          provider: "groq",
          fetcher: async (_url, options) => reply("Short"),
        },
      ),
    /word limit/,
  );
});
test("code explanation word count excludes code and preserves copyability", async () => {
  const answer =
    "```python\n" +
    Array(100).fill("# code").join("\n") +
    "\n```\nA short explanation.";
  const result = await runGeneralInference(
    buildGeneralCompletion({
      message: "Write Python code. Keep explanation under 30 words.",
    }),
    {
      env,
      provider: "groq",
      fetcher: async (_url, options) => reply(answer),
    },
  );
  assert.equal(result.answer, answer);
  assert.equal(result.calls, 2);
  const instructions = buildGeneralCompletion({
    message: "Write Python code. Keep explanation under 30 words.",
  }).messages[0].content;
  assert.match(
    instructions,
    /Count only the explanation outside fenced code blocks/,
  );
  assert.doesNotMatch(instructions, /Count the entire visible answer/);
});
test("empty, truncated, malformed check and provider quota fail without exposing drafts or secrets", async () => {
  for (const fetcher of [
    async () => reply(""),
    async () => reply("partial", "length"),
    async () => reply("bad\u0000content"),
    async () =>
      new Response("private secret", {
        status: 429,
        headers: { "retry-after": "70" },
      }),
  ]) {
    const stream = generalResponseStream(
      buildGeneralCompletion({ message: "Review this essay" }),
      { env, provider: "groq", fetcher },
    );
    const text = await new Response(stream).text();
    assert.match(text, /"error"/);
    assert.doesNotMatch(
      text,
      /private secret|test-secret|\"content\":\"partial/,
    );
  }
});

test("writing uses a grounded final edit without the separate review audit", async () => {
  const bodies = [];
  const result = await runGeneralInference(
    buildGeneralCompletion({ message: "Write a paragraph", evidence: "The club has $18." }),
    { env, provider: "groq", fetcher: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return reply(bodies.length === 1 ? "An unsupported draft" : "A grounded paragraph");
    } },
  );
  assert.equal(result.calls, 2);
  assert.equal(result.answer, "A grounded paragraph");
  assert.match(bodies[1].messages[0].content, /final-answer editor/);
  assert.match(bodies[1].messages[1].content, /The club has \$18/);
  assert.match(bodies[1].messages[1].content, /An unsupported draft/);
  assert.doesNotMatch(bodies[1].messages[1].content, /errorReport/);
});
test("ordinary questions stay on one call", async () => {
  const result = await runGeneralInference(buildGeneralCompletion({ message: "What is a percentage point?" }), {
    env, provider: "groq", fetcher: async () => reply("A difference between percentages."),
  });
  assert.equal(result.calls, 1);
});

test("daily limit is identified without retrying or exposing provider credentials", async () => {
  let calls = 0;
  const stream = generalResponseStream(buildGeneralCompletion({ message: "hello" }), {
    env, provider: "groq", fetcher: async () => {
      calls++;
      return new Response(JSON.stringify({error:{message:"tokens per day (TPD) reached for org_private test-secret"}}),{status:429,headers:{"retry-after":"1","Content-Type":"application/json"}});
    },
  });
  const text = await new Response(stream).text();
  assert.equal(calls, 1);
  assert.match(text, /daily free AI allowance is exhausted/);
  assert.doesNotMatch(text, /org_private|test-secret/);
});
test("minute limit names the cooldown and does not promise a daily reset", async () => {
  const stream = generalResponseStream(buildGeneralCompletion({ message: "hello" }), {
    env, provider: "groq", fetcher: async () => new Response(JSON.stringify({error:{message:"tokens per minute (TPM) org_private"}}),{status:429,headers:{"retry-after":"70","Content-Type":"application/json"}}),
  });
  const text = await new Response(stream).text();
  assert.match(text, /Try again in 70 seconds/);
  assert.doesNotMatch(text, /daily|org_private/);
});
test("a short minute cooldown retries once, announces waiting and preserves the answer", async () => {
  let calls = 0;
  const statuses = [];
  const result = await runGeneralInference(buildGeneralCompletion({message:"hello"}), {
    env, provider:"groq", fetcher: async () => ++calls === 1
      ? new Response(JSON.stringify({error:{message:"tokens per minute (TPM)"}}),{status:429,headers:{"retry-after":"0.01","Content-Type":"application/json"}})
      : reply("Hello."),
  }, status=>statuses.push(status));
  assert.equal(calls,2);
  assert.equal(result.answer,"Hello.");
  assert.deepEqual(statuses,["working","waiting"]);
});
test("ordinary prompts omit essay-specific instructions and retain honesty and context", () => {
  const completion=buildGeneralCompletion({message:"hello",history:[{role:"user",content:"My name is Example."}]});
  const system=completion.messages[0].content;
  assert.doesNotMatch(system,/control group|staffing|rubric asks for a limitation/);
  assert.match(system,/Never invent evidence/);
  assert.match(JSON.stringify(completion.messages),/My name is Example/);
});

test("ambiguity guard rejects guessed actors inside Markdown criticism", () => {
 const unsafe='5. **Clear references:** The pronoun "they" in "they said their schedule would suffer" is ambiguous.\n * *Correction:* Clarify the actor: "the coaches said the schedule would suffer."';
 assert.equal(needsActorClarification(unsafe),true);
 assert.equal(needsActorClarification(unsafe.replace('"the coaches said the schedule would suffer."','"[speaker] said [owner]’s schedule would suffer."')),false);
});
