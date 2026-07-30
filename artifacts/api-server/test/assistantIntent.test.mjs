import test from "node:test";
import assert from "node:assert/strict";
import { hasWorkspaceMutationIntent } from "../src/lib/assistantIntent.ts";

test("read-only Nimbo questions do not require structured workspace planning", () => {
  assert.equal(hasWorkspaceMutationIntent("What should I work on next?"), false);
  assert.equal(hasWorkspaceMutationIntent("Prioritize my tasks for this afternoon"), false);
  assert.equal(hasWorkspaceMutationIntent("How many math assignments are due this week?"), false);
  assert.equal(hasWorkspaceMutationIntent("How should I organize my tasks?"), false);
});

test("workspace mutations still require a confirmed structured preview", () => {
  assert.equal(hasWorkspaceMutationIntent("Create a science project with three tasks"), true);
  assert.equal(hasWorkspaceMutationIntent("Reschedule my unfinished work for tomorrow"), true);
  assert.equal(hasWorkspaceMutationIntent("Remind me to review biology at 4"), true);
  assert.equal(hasWorkspaceMutationIntent("I need to finish my history outline"), true);
});
