import assert from "node:assert/strict";
import test from "node:test";
import { completionDisposition } from "../src/lib/taskCompletionRules.ts";

test("new active tasks complete and award once", () => {
  assert.equal(completionDisposition("todo", null), "complete-and-award");
  assert.equal(completionDisposition("in_progress", null), "complete-and-award");
});

test("completed tasks and recovered receipt states never award twice", () => {
  const receipt = new Date("2026-07-22T12:00:00Z");
  assert.equal(completionDisposition("completed", receipt), "already-complete");
  assert.equal(completionDisposition("todo", receipt), "complete-without-award");
});
