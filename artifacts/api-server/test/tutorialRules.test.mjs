import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTutorialStep, TUTORIAL_CHAPTER_COUNT } from "../src/lib/tutorialRules.ts";

test("tutorial progress resumes within the available chapter range", () => {
  assert.equal(normalizeTutorialStep(0), 0);
  assert.equal(normalizeTutorialStep(4), 4);
  assert.equal(normalizeTutorialStep(TUTORIAL_CHAPTER_COUNT), TUTORIAL_CHAPTER_COUNT);
  assert.equal(normalizeTutorialStep(999), TUTORIAL_CHAPTER_COUNT);
  assert.equal(normalizeTutorialStep(-10), 0);
});

test("tutorial progress rejects ambiguous values instead of corrupting state", () => {
  assert.equal(normalizeTutorialStep("4"), null);
  assert.equal(normalizeTutorialStep(2.5), null);
  assert.equal(normalizeTutorialStep(undefined), null);
});
