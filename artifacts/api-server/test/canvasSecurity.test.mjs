import assert from "node:assert/strict";
import test from "node:test";
import { decryptIntegrationSecret, encryptIntegrationSecret, redactIntegrationError } from "../src/lib/integrationCrypto.ts";
import { canvasEventCategory, icalOccurrenceId, isMeaningfulProjectCandidate, normalizeCanvasChainTitle } from "../src/lib/canvasRules.ts";

test("encrypts integration credentials with authenticated encryption", () => {
  const previous = process.env.CANVAS_INTEGRATION_ENCRYPTION_KEY;
  process.env.CANVAS_INTEGRATION_ENCRYPTION_KEY = "test-only-encryption-key-with-more-than-32-characters";
  try { const encrypted = encryptIntegrationSecret("canvas-secret-token"); assert.notEqual(encrypted, "canvas-secret-token"); assert.equal(decryptIntegrationSecret(encrypted), "canvas-secret-token"); const parts=encrypted.split('.'); parts[3]=`${parts[3][0]==='A'?'B':'A'}${parts[3].slice(1)}`; assert.throws(() => decryptIntegrationSecret(parts.join('.'))); }
  finally { if (previous === undefined) delete process.env.CANVAS_INTEGRATION_ENCRYPTION_KEY; else process.env.CANVAS_INTEGRATION_ENCRYPTION_KEY = previous; }
});

test("redacts credentials from integration errors", () => {
  assert.doesNotMatch(redactIntegrationError(new Error("access_token=abc123 token xyz")), /abc123/);
});

test("project suggestions require a meaningful chain and exclude generic groups", () => {
  assert.equal(isMeaningfulProjectCandidate("Research Paper", 4, 2), true);
  assert.equal(isMeaningfulProjectCandidate("Homework", 10, 10), false);
  assert.equal(isMeaningfulProjectCandidate("Science Fair", 2, 2), false);
  assert.equal(normalizeCanvasChainTitle("Research Paper Part 3"), "research paper");
});

test("calendar rules provide stable occurrence IDs and limited categories", () => {
  const start = new Date("2026-08-01T14:00:00.000Z");
  assert.equal(icalOccurrenceId("uid-1", start), "uid-1:2026-08-01T14:00:00.000Z");
  assert.equal(canvasEventCategory("Unit test review"), "Quiz/Test");
  assert.equal(canvasEventCategory("Teacher office hours"), "Meeting");
  assert.equal(canvasEventCategory("Welcome picnic"), "Other");
});
