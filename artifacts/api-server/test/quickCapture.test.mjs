import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickCapture } from "../src/lib/quickCapture.ts";

const referenceDate = "2026-07-16";
const projects = [{ id: 1, name: "Personal" }];
const subjects = [
  { id: 2, name: "Math" },
  { id: 3, name: "Computer Science" },
];

test("parses Todoist-style schedule, project, and priority tokens", () => {
  const parsed = parseQuickCapture(
    "Call mom Sunday afternoon #Personal p1",
    projects,
    subjects,
    referenceDate,
  );

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
    referenceDate,
  );

  assert.equal(parsed.title, "Study fractions");
  assert.equal(parsed.dueDate, "2026-07-17");
  assert.equal(parsed.subject, "Math");
  assert.equal(parsed.priority, "high");
  assert.equal(parsed.estimatedMinutes, 45);
  assert.deepEqual(parsed.checklist, [
    "Review fraction rules",
    "Solve 10 practice problems",
  ]);
});

test("uses a matching hashtag as a subject when it is not a project", () => {
  const parsed = parseQuickCapture(
    "Finish algebra homework tomorrow #Math high priority",
    projects,
    subjects,
    referenceDate,
  );

  assert.equal(parsed.title, "Finish algebra homework");
  assert.equal(parsed.subject, "Math");
  assert.equal(parsed.projectId, null);
  assert.equal(parsed.dueDate, "2026-07-17");
  assert.equal(parsed.priority, "high");
  assert.deepEqual(parsed.warnings, []);
});

test("recognizes compact subject initials", () => {
  const parsed = parseQuickCapture(
    "Finish coding lab #CS",
    projects,
    subjects,
    referenceDate,
  );

  assert.equal(parsed.title, "Finish coding lab");
  assert.equal(parsed.subject, "Computer Science");
  assert.deepEqual(parsed.warnings, []);
});

test("does not silently attach unknown organization tokens", () => {
  const parsed = parseQuickCapture(
    "Finish worksheet #Unknown @History",
    projects,
    subjects,
    referenceDate,
  );

  assert.equal(parsed.title, "Finish worksheet");
  assert.equal(parsed.projectId, null);
  assert.equal(parsed.subject, null);
  assert.equal(parsed.warnings.length, 2);
});

test("understands natural priority language and handles negation first", () => {
  const urgent = parseQuickCapture(
    "Finish lab report very important",
    projects,
    subjects,
    referenceDate,
  );
  const relaxed = parseQuickCapture(
    "Organize downloads not important",
    projects,
    subjects,
    referenceDate,
  );
  const noRush = parseQuickCapture(
    "Clean notes no rush",
    projects,
    subjects,
    referenceDate,
  );

  assert.equal(urgent.title, "Finish lab report");
  assert.equal(urgent.priority, "critical");
  assert.equal(relaxed.title, "Organize downloads");
  assert.equal(relaxed.priority, "low");
  assert.equal(noRush.title, "Clean notes");
  assert.equal(noRush.priority, "low");
});

test("explicit p-level tokens override natural priority words", () => {
  const parsed = parseQuickCapture(
    "Review notes urgent p4",
    projects,
    subjects,
    referenceDate,
  );

  assert.equal(parsed.title, "Review notes");
  assert.equal(parsed.priority, "low");
});

test("today and tomorrow resolve from the supplied user date", () => {
  const today = parseQuickCapture(
    "Finish worksheet today #Math",
    projects,
    subjects,
    "2026-07-21",
  );
  const tomorrow = parseQuickCapture(
    "Read chapter tomorrow",
    projects,
    subjects,
    "2026-07-21",
  );

  assert.equal(today.dueDate, "2026-07-21");
  assert.equal(today.title, "Finish worksheet");
  assert.equal(tomorrow.dueDate, "2026-07-22");
});

test("dates are removed from task titles", () => {
  const result = parseQuickCapture(
    "Shubhada homework August 1",
    projects,
    subjects,
    "2026-07-21",
  );

  assert.equal(result.title, "Shubhada homework");
  assert.equal(result.dueDate, "2026-08-01");
});

test("parses slash dates and rolls dates without a year forward", () => {
  const thisYear = parseQuickCapture(
    "Finish AMC review 9/21 #Math",
    projects,
    subjects,
    "2026-07-21",
  );
  const nextYear = parseQuickCapture(
    "Submit lab 2/1",
    projects,
    subjects,
    "2026-07-21",
  );

  assert.equal(thisYear.title, "Finish AMC review");
  assert.equal(thisYear.dueDate, "2026-09-21");
  assert.equal(nextYear.title, "Submit lab");
  assert.equal(nextYear.dueDate, "2027-02-01");
});

test("preserves a meaningful leading number on the task title", () => {
  const result = parseQuickCapture(
    "8. Practice problems 9/21",
    projects,
    subjects,
    "2026-07-21",
  );

  assert.equal(result.title, "8. Practice problems");
  assert.equal(result.dueDate, "2026-09-21");
});

test("weekday parsing stays anchored to the supplied date", () => {
  const result = parseQuickCapture(
    "Practice vocabulary next Monday",
    projects,
    subjects,
    "2026-07-21",
  );

  assert.equal(result.dueDate, "2026-07-27");
});
