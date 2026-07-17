import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickCapture } from "../src/lib/quickCapture.ts";

const now = new Date(2026, 6, 16, 12, 0, 0);
const projects = [{ id: 1, name: "Personal" }];
const subjects = [{ id: 2, name: "Math" }];

test("parses Todoist-style schedule, project, and priority tokens", () => {
  const parsed = parseQuickCapture("Call mom Sunday afternoon #Personal p1", projects, subjects, now);

  assert.equal(parsed.title, "Call mom");
  assert.equal(parsed.dueDate, "2026-07-19");
  assert.equal(parsed.time, "3:00 PM");
  assert.equal(parsed.priority, "critical");
  assert.equal(parsed.projectId, 1);
  assert.deepEqual(parsed.warnings, []);
});

test("turns additional lines into a real checklist", () => {
  const parsed = parseQuickCapture(
    "Study fractions tomorrow @Math p2 ~45m\nReview fraction rules\nSolve 10 practice problems",
    projects,
    subjects,
    now,
  );

  assert.equal(parsed.title, "Study fractions");
  assert.equal(parsed.dueDate, "2026-07-17");
  assert.equal(parsed.subject, "Math");
  assert.equal(parsed.priority, "high");
  assert.equal(parsed.estimatedMinutes, 45);
  assert.deepEqual(parsed.checklist, ["Review fraction rules", "Solve 10 practice problems"]);
});

test("does not silently attach unknown organization tokens", () => {
  const parsed = parseQuickCapture("Finish worksheet #Unknown @History", projects, subjects, now);

  assert.equal(parsed.title, "Finish worksheet");
  assert.equal(parsed.projectId, null);
  assert.equal(parsed.subject, null);
  assert.equal(parsed.warnings.length, 2);
});

test("understands natural priority language and handles negation first", () => {
  const urgent = parseQuickCapture("Finish lab report very important", projects, subjects, now);
  const relaxed = parseQuickCapture("Organize downloads not important", projects, subjects, now);
  const noRush = parseQuickCapture("Clean notes no rush", projects, subjects, now);

  assert.equal(urgent.title, "Finish lab report");
  assert.equal(urgent.priority, "critical");
  assert.equal(relaxed.title, "Organize downloads");
  assert.equal(relaxed.priority, "low");
  assert.equal(noRush.title, "Clean notes");
  assert.equal(noRush.priority, "low");
});

test("explicit p-level tokens override natural priority words", () => {
  const parsed = parseQuickCapture("Review notes urgent p4", projects, subjects, now);

  assert.equal(parsed.title, "Review notes");
  assert.equal(parsed.priority, "low");
});
