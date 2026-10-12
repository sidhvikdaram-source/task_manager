import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompletion,
  createWorker,
  verifyFirebaseToken,
  GENERAL_MODEL,
  CLOUDFLARE_GENERAL_MODEL,
  GLM_MODEL,
} from "../src/index.mjs";
const env = {
  FIREBASE_PROJECT_ID: "nimbusdo",
  GROQ_API_KEY: "test-private-secret",
  ALLOWED_ORIGIN: "https://nimbusdo.web.app",
};
const req = (
  mode = "general",
  body = { message: "Review this draft" },
  extra = {},
) =>
  new Request(`https://test.invalid/${mode}`, {
    method: "POST",
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      Authorization: "Bearer fake-token",
      "Content-Type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });
test("models and modes remain separate; general receives no task context", () => {
  const general = buildCompletion(
    {
      message: "Write code",
      context: { tasks: [{ title: "private task" }] },
      history: [
        { role: "system", content: "UNTRUSTED_SYSTEM_MARKER" },
        { role: "user", content: "hello" },
      ],
    },
    "general",
  );
  assert.equal(general.model, GENERAL_MODEL);
  assert.equal(general.stream, false);
  assert.equal(general.reasoning_effort, "none");
  assert.ok(!JSON.stringify(general).includes("private task"));
  assert.ok(!JSON.stringify(general).includes("UNTRUSTED_SYSTEM_MARKER"));
  const task = buildCompletion(
    { message: "math tomorrow", context: { today: "2026-10-10" } },
    "task",
  );
  assert.equal(task.model, "openai/gpt-oss-20b");
  assert.equal(task.reasoning_effort, "low");
  assert.equal(task.response_format.json_schema.strict, true);
  assert.equal(task.stream, false);
});
test("harness includes accurate quoted criticism and provided assignment", () => {
  const completion = buildCompletion(
    {
      message: "Review essay",
      assignmentPrompt: "Compare two sources",
      rubric: "Evidence and reasoning",
    },
    "general",
  );
  const text = JSON.stringify(completion);
  for (const requirement of [
    "Prompt coverage",
    "Argument",
    "Paragraph logic",
    "Clarity",
    "Action",
    "Precision",
    "Compare two sources",
    "Evidence and reasoning",
    "library should extend",
  ])
    assert.ok(text.includes(requirement));
});
test("oversized or empty requests are rejected", () => {
  assert.throws(() => buildCompletion({ message: "" }, "general"));
  assert.throws(() =>
    buildCompletion({ message: "x".repeat(16001) }, "general"),
  );
  assert.throws(() =>
    buildCompletion(
      {
        message: "x".repeat(16000),
        assignmentPrompt: "x".repeat(8000),
        rubric: "x".repeat(8000),
      },
      "general",
    ),
  );
});
test("missing auth, invalid auth, and cross-origin requests never call Groq", async () => {
  let calls = 0;
  const worker = createWorker({
    verify: async () => {
      throw Error("invalid");
    },
    fetcher: async () => {
      calls++;
    },
  });
  assert.equal(
    (
      await worker.fetch(
        req("general", undefined, { Origin: "https://evil.test" }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://test.invalid/general", {
          method: "POST",
          body: "{}",
        }),
        env,
      )
    ).status,
    401,
  );
  assert.equal((await worker.fetch(req(), env)).status, 401);
  assert.equal(calls, 0);
});
test("rate limiter uses authenticated user id and blocks upstream", async () => {
  const worker = createWorker({
    verify: async () => "user-one",
    fetcher: async () => {
      throw Error("must not call");
    },
  });
  let key;
  const response = await worker.fetch(req(), {
    ...env,
    AI_LIMITER: {
      limit: async (input) => {
        key = input.key;
        return { success: false };
      },
    },
  });
  assert.equal(key, "user-one");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});
test("missing bindings and task secret are safe setup errors", async () => {
  const worker = createWorker({ verify: async () => "user-one" });
  const response = await worker.fetch(req(), { ...env, GROQ_API_KEY: "" });
  assert.equal(response.status, 503);
  assert.equal(
    (await worker.fetch(req("task"), { ...env, GROQ_API_KEY: "" })).status,
    503,
  );
});
test("explicit Cloudflare mode stays on free Qwen and checks before streaming", async () => {
  const seen = [];
  const worker = createWorker({
    verify: async () => "user-one",
    fetcher: async () => {
      throw Error("No provider fallback");
    },
  });
  const response = await worker.fetch(req(), {
    ...env,
    GENERAL_AI_PROVIDER: "cloudflare",
    GROQ_API_KEY: "",
    AI: {
      run: async (model, options) => {
        seen.push({ model, options });
        return {
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: seen.length >= 2 ? "Checked answer" : "First draft",
              },
            },
          ],
        };
      },
    },
  });
  assert.equal(
    response.headers.get("content-type"),
    "text/event-stream; charset=utf-8",
  );
  const text = await response.text();
  assert.match(text, /Checked answer/);
  assert.doesNotMatch(text, /First draft/);
  assert.equal(seen.length, 3);
  assert.equal(seen[0].model, CLOUDFLARE_GENERAL_MODEL);
  assert.equal(seen[0].options.stream, false);
  assert.equal(seen[0].options.chat_template_kwargs.enable_thinking, false);
});
test("task output is structured and upstream errors do not leak bodies", async () => {
  const preview = {
    reply: "Ready",
    taskPreviewJson: "[]",
    planPreviewJson: "null",
    workspacePreviewJson: "null",
  };
  const worker = createWorker({
    verify: async () => "user-one",
    fetcher: async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(preview) },
          },
        ],
      }),
  });
  assert.deepEqual(
    await (await worker.fetch(req("task"), env)).json(),
    preview,
  );
  const failed = createWorker({
    verify: async () => "user-one",
    fetcher: async () => new Response("test-private-secret", { status: 401 }),
  });
  const response = await failed.fetch(req("task"), env);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(env.GROQ_API_KEY));
});
test("free quota errors expose retry timing, not provider details", async () => {
  const worker = createWorker({
    verify: async () => "u",
    fetcher: async () =>
      new Response("provider private details", {
        status: 429,
        headers: { "retry-after": "17" },
      }),
  });
  const response = await worker.fetch(req("task"), env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "17");
  assert.ok(!(await response.text()).includes("private details"));
});
test("Cloudflare stream failures never fall back or leak provider details", async () => {
  const worker = createWorker({
    verify: async () => "u",
    fetcher: async () => {
      throw Error("No external fallback");
    },
  });
  for (const message of [
    "3040 daily neuron quota exceeded: private detail",
    "private internal detail",
  ]) {
    const response = await worker.fetch(req(), {
      ...env,
      GENERAL_AI_PROVIDER: "cloudflare",
      AI: {
        run: async () => {
          throw Error(message);
        },
      },
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /"error"/);
    assert.doesNotMatch(text, /private/);
  }
});
test("GLM requests use Mistral's model and parameters while Task AI stays on Groq", async () => {
  const general = buildCompletion(
    { message: "Review my essay" },
    "general",
    "mistral",
  );
  assert.equal(general.model, GLM_MODEL);
  assert.equal(general.reasoning_effort, "max");
  assert.equal(general.max_tokens, 4096);
  assert.equal(general.max_completion_tokens, undefined);
  assert.equal(
    buildCompletion({ message: "track homework" }, "task", "mistral").model,
    "openai/gpt-oss-20b",
  );
  let upstream;
  const worker = createWorker({
    verify: async () => "u",
    fetcher: async (url, options) => {
      upstream = { url, options };
      const body = JSON.parse(options.body);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: [
                {
                  type: "text",
                  text:
                    body.reasoning_effort === "max" ? "Answer" : "Candidate",
                },
              ],
            },
          },
        ],
      });
    },
  });
  const response = await worker.fetch(req(), {
    ...env,
    GENERAL_AI_PROVIDER: "mistral",
    MISTRAL_API_KEY: "test-mistral-secret",
    AI: {
      run: async () => {
        throw Error("Must not silently fall back to Gemma");
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Nimbus-Model"), GLM_MODEL);
  assert.match(await response.text(), /Answer/);
  assert.equal(upstream.url, "https://api.mistral.ai/v1/chat/completions");
  assert.equal(
    upstream.options.headers.Authorization,
    "Bearer test-mistral-secret",
  );
  assert.equal(JSON.parse(upstream.options.body).model, GLM_MODEL);
});
test("missing GLM key and invalid server provider fail closed without a model fallback", async () => {
  const worker = createWorker({
    verify: async () => "u",
    fetcher: async () => {
      throw Error("Must not call upstream");
    },
  });
  for (const GENERAL_AI_PROVIDER of ["mistral", "invalid"]) {
    const response = await worker.fetch(req(), {
      ...env,
      GENERAL_AI_PROVIDER,
      AI: {
        run: async () => {
          throw Error("Must not fall back");
        },
      },
    });
    assert.equal(response.status, 503);
  }
});
test("GLM subscription rejection is clear and does not activate another provider", async () => {
  const worker = createWorker({
    verify: async () => "u",
    fetcher: async () =>
      new Response("private subscription detail", { status: 403 }),
  });
  const response = await worker.fetch(req(), {
    ...env,
    GENERAL_AI_PROVIDER: "mistral",
    MISTRAL_API_KEY: "test-private-key",
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /subscription/);
  assert.ok(!text.includes("private"));
});
test("Firebase JWT verifier checks actual signature, audience, expiry and algorithm", async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "test-signing-key";
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const claims = {
    aud: "nimbusdo",
    iss: "https://securetoken.google.com/nimbusdo",
    sub: "user-secure",
    exp: Date.now() / 1000 + 600,
    iat: Date.now() / 1000 - 5,
    auth_time: Date.now() / 1000 - 10,
  };
  const sign = async (c = claims, h = { alg: "RS256", kid: jwk.kid }) => {
    const data = `${encode(h)}.${encode(c)}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(data),
    );
    return `${data}.${Buffer.from(signature).toString("base64url")}`;
  };
  const fetchKeys = async () => Response.json({ keys: [jwk] });
  const token = await sign();
  assert.equal(
    await verifyFirebaseToken(token, "nimbusdo", fetchKeys),
    "user-secure",
  );
  await assert.rejects(() =>
    verifyFirebaseToken(`${token.slice(0, -4)}abcd`, "nimbusdo", fetchKeys),
  );
  await assert.rejects(async () =>
    verifyFirebaseToken(
      await sign({ ...claims, aud: "another-project" }),
      "nimbusdo",
      fetchKeys,
    ),
  );
  await assert.rejects(async () =>
    verifyFirebaseToken(
      await sign({ ...claims, exp: Date.now() / 1000 - 1 }),
      "nimbusdo",
      fetchKeys,
    ),
  );
  await assert.rejects(async () =>
    verifyFirebaseToken(
      await sign(claims, { alg: "none", kid: jwk.kid }),
      "nimbusdo",
      fetchKeys,
    ),
  );
});

test("mutation previews never claim a task was already created", async () => {
  const preview = {
    reply: "Task added.",
    taskPreviewJson: JSON.stringify([
      { title: "Worksheet", dueDate: "2026-10-11" },
    ]),
    planPreviewJson: "null",
    workspacePreviewJson: "null",
  };
  const worker = createWorker({
    verify: async () => "u",
    fetcher: async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(preview) },
          },
        ],
      }),
  });
  const data = await (await worker.fetch(req("task"), env)).json();
  assert.match(data.reply, /confirm/);
  assert.ok(!data.reply.includes("added"));
  assert.equal(data.taskPreviewJson, preview.taskPreviewJson);
});
test("simple task and project requests use deterministic capture without calling Groq", async () => {
  const worker = createWorker({
    verify: async () => "test-user",
    fetcher: async () => {
      throw new Error("A model should not be needed");
    },
  });
  const context = {
    today: "2026-10-10",
    subjects: ["Science", "Math"],
    projects: [],
  };
  for (const [message, date] of [
    ["create a task due yesterday", "2026-10-09"],
    ["create a task due day after tomorrow", "2026-10-12"],
    ["create a task due October 21", "2026-10-21"],
  ]) {
    const response = await worker.fetch(req("task", { message, context }), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    const task = JSON.parse(data.taskPreviewJson)[0];
    assert.equal(task.title, "");
    assert.equal(task.dueDate, date);
  }
  const response = await worker.fetch(
    req("task", {
      message:
        "create a project with 3 tasks in it it should be in the subject science",
      context,
    }),
    env,
  );
  const plan = JSON.parse((await response.json()).planPreviewJson);
  assert.equal(plan.project.subject, "Science");
  assert.equal(plan.tasks.length, 3);
  assert.ok(plan.tasks.every((t) => t.subject === "Science" && t.title === ""));
});
test("both official hosting origins pass preflight and retain authentication", async () => {
  let providerCalls = 0;
  const worker = createWorker({
    fetcher: async () => {
      providerCalls++;
      throw new Error("Must not call provider");
    },
  });
  const config = {
    ...env,
    ALLOWED_ORIGINS:
      "https://nimbusdo.web.app,https://nimbusdo.firebaseapp.com",
  };
  for (const origin of config.ALLOWED_ORIGINS.split(",")) {
    const preflight = await worker.fetch(
      new Request("https://test.invalid/general", {
        method: "OPTIONS",
        headers: { Origin: origin },
      }),
      config,
    );
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
    const response = await worker.fetch(
      new Request("https://test.invalid/general", {
        method: "POST",
        headers: { Origin: origin },
      }),
      config,
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  }
  assert.equal(providerCalls, 0);
  const denied = await worker.fetch(
    req("general", undefined, {
      Origin: "https://nimbusdo.firebaseapp.com.evil.test",
    }),
    config,
  );
  assert.equal(denied.status, 403);
});
