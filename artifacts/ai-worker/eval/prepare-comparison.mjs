// Preparation only: this script never reads credentials or calls a provider.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { QUALIFICATION_CASES } from "./qualification-cases.mjs";
import { HOLDOUT_CASES } from "./holdout-cases.mjs";
import {
  buildGeneralHarness,
  VERIFY_SYSTEM,
  AUDIT_SYSTEM,
  REVIEW_COVERAGE_CHECK,
  VISION_CHECK,
  GENERAL_HARNESS_VERSION,
} from "../src/generalHarness.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(
  process.argv[2] || "/tmp/nimbus-prepared-comparison",
);
await fs.mkdir(output, { recursive: true });
const profiles = {
  gemini: {
    model: "gemini-3.6-flash",
    nativeVision: true,
    thinking: "high",
    status: "NOT RUN: eligible free evaluation access unavailable",
  },
  glm: {
    model: "glm-5.3",
    nativeVision: false,
    thinking: "max",
    status: "NOT RUN: eligible free evaluation access unavailable",
  },
};
function imageParts(content, gemini) {
  if (typeof content === "string")
    return gemini ? [{ text: content }] : content;
  return content.map((part) => {
    if (part.type === "text") return gemini ? { text: part.text } : part;
    const [prefix, data] = part.image_url.url.split(",");
    return gemini
      ? { inlineData: { mimeType: prefix.slice(5).split(";")[0], data } }
      : part;
  });
}
function request(messages, profile, checking = false) {
  if (profile.model.startsWith("gemini"))
    return {
      systemInstruction: { parts: [{ text: messages[0].content }] },
      contents: messages.slice(1).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: imageParts(message.content, true),
      })),
      generationConfig: {
        maxOutputTokens: 8192,
        thinkingConfig: {
          thinkingLevel: profile.thinking,
          includeThoughts: false,
        },
      },
    };
  return {
    model: profile.model,
    messages,
    stream: false,
    thinking: { type: "enabled" },
    reasoning_effort: profile.thinking,
    max_tokens: 8192,
  };
}
const manifest = {
  harness: GENERAL_HARNESS_VERSION,
  fixtureHash: crypto
    .createHash("sha256")
    .update(JSON.stringify([...QUALIFICATION_CASES, ...HOLDOUT_CASES]))
    .digest("hex"),
  profiles,
  protocol:
    "Use the first response as candidate, run the evidence audit, count visible words, then build the final editor request with the actual audit report. Never send grader expectations. Preserve all failures and quota waits. Score outputs blind to provider identity; run generated code in isolation. Vision cases require the actual fixture image. No cross-model winner can be declared before actual eligible runs.",
};
for (const [name, profile] of Object.entries(profiles)) {
  const records = [];
  for (const fixture of [...QUALIFICATION_CASES, ...HOLDOUT_CASES]) {
    if (fixture.imageFixture && !profile.nativeVision) {
      records.push({
        id: fixture.id,
        category: fixture.category,
        status:
          "Blocked: text-only model requires a separately evaluated vision companion",
      });
      continue;
    }
    const images = fixture.imageFixture
      ? [
          {
            name: `${fixture.imageFixture}.png`,
            dataUrl:
              "data:image/png;base64," +
              (
                await fs.readFile(
                  path.join(directory, "images", `${fixture.imageFixture}.png`),
                )
              ).toString("base64"),
          },
        ]
      : [];
    const input = {
      message:
        fixture.request +
        (fixture.document
          ? "\n\nDocument to analyze:\n" + fixture.document
          : ""),
      assignmentPrompt: fixture.assignment,
      rubric: fixture.rubric,
      evidence: fixture.evidence,
      images,
    };
    const harness = buildGeneralHarness(input, fixture.history || []);
    const context = {
      ...harness.context,
      history: fixture.history || [],
      intent: harness.intent,
      wordLimit: harness.constraint,
      candidate: "REPLACE_WITH_ACTUAL_FIRST_RESPONSE",
      errorReport: "REPLACE_WITH_ACTUAL_AUDIT_RESPONSE",
    };
    const final = [
      {
        role: "system",
        content:
          VERIFY_SYSTEM +
          (harness.intent === "review" ? "\n" + REVIEW_COVERAGE_CHECK : "") +
          (harness.intent === "vision" ? "\n" + VISION_CHECK : ""),
      },
      {
        role: "user",
        content:
          "Edit this candidate against the task data.\n" +
          JSON.stringify(context),
      },
    ];
    if (images.length)
      final[1].content = [
        { type: "text", text: final[1].content },
        ...images.map((image) => ({
          type: "image_url",
          image_url: { url: image.dataUrl },
        })),
      ];
    records.push({
      id: fixture.id,
      category: fixture.category,
      status: profile.status,
      firstRequest: request(harness.messages, profile),
      auditTemplate:
        harness.intent === "vision"
          ? null
          : request(
              [
                {
                  role: "system",
                  content:
                    AUDIT_SYSTEM +
                    (harness.intent === "review"
                      ? "\n" + REVIEW_COVERAGE_CHECK
                      : ""),
                },
                final[1],
              ],
              profile,
            ),
      editorTemplate: request(final, profile, true),
      constraint: harness.constraint,
    });
  }
  await fs.writeFile(
    path.join(output, `${name}.json`),
    JSON.stringify(records, null, 2),
  );
}
await fs.writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  `Prepared Gemini and GLM requests in ${output}; no API calls made.`,
);
