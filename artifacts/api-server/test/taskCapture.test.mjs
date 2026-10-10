import assert from "node:assert/strict";
import test from "node:test";
import { parseTaskCreation } from "../src/lib/taskCapture.ts";
import { parseQuickCapture } from "../src/lib/quickCapture.ts";
const subjects = [
  { id: 1, name: "Science" },
  { id: 2, name: "Math" },
  { id: 3, name: "Computer Science" },
];
const capture = (text) => parseTaskCreation(text, [], subjects, "2026-10-10");
for (const [phrase, date] of [
  ["yesterday", "2026-10-09"],
  ["tomorrow", "2026-10-11"],
  ["next week", "2026-10-17"],
  ["next Monday", "2026-10-12"],
  ["day after tomorrow", "2026-10-12"],
  ["Oct 21", "2026-10-21"],
  ["October 21", "2026-10-21"],
]) {
  test(`captures ${phrase} without inventing a title`, () => {
    const task = capture(`create a task due ${phrase}`).taskPreview[0];
    assert.equal(task.title, "");
    assert.equal(task.date, date);
    const quick = parseQuickCapture(
      `Worksheet due ${phrase}`,
      [],
      subjects,
      "2026-10-10",
    );
    assert.equal(quick.title, "Worksheet");
    assert.equal(quick.dueDate, date);
  });
}
test("named tasks preserve the name, priority, duration and subject", () => {
  const task = capture(
    "create a task called Read chapter 4 due day after tomorrow in the subject Science p2 ~45m",
  ).taskPreview[0];
  assert.equal(task.title, "Read chapter 4");
  assert.equal(task.subject, "Science");
  assert.equal(task.priority, "high");
  assert.equal(task.estimatedMinutes, 45);
  assert.equal(task.date, "2026-10-12");
});
test("project containers preserve the exact task count and shared subject", () => {
  for (const text of [
    "create a project with 3 tasks in it it should be in the subject science",
    "create a science project with three tasks due next week",
  ]) {
    const plan = capture(text).planPreview;
    assert.equal(plan.project.subject, "Science");
    assert.equal(plan.tasks.length, 3);
    assert.ok(
      plan.tasks.every((t) => t.subject === "Science" && t.title === ""),
    );
  }
});
test("project tags survive task capture", () => {
  const task = parseTaskCreation(
    "add a task Read notes tomorrow #Volcano",
    [{ id: 7, name: "Volcano" }],
    subjects,
    "2026-10-10",
  ).taskPreview[0];
  assert.equal(task.projectId, 7);
  assert.equal(task.title, "Read notes");
});
test("complex plans and general content do not become empty tasks", () => {
  for (const text of [
    "write an essay about science tomorrow",
    "create a project called Volcano with 3 tasks: research, build, present",
    "move task tomorrow in Science",
    "create a task Read chapter 4 then move another task",
  ])
    assert.equal(capture(text), null);
});
test("relative dates work across year boundaries and on the same weekday", () => {
  assert.equal(
    parseQuickCapture("Review day after tomorrow", [], [], "2026-12-31")
      .dueDate,
    "2027-01-02",
  );
  assert.equal(
    parseQuickCapture("Review yesterday", [], [], "2027-01-01").dueDate,
    "2026-12-31",
  );
  assert.equal(
    parseQuickCapture("Review next Monday", [], [], "2026-10-12").dueDate,
    "2026-10-19",
  );
});

test("invalid dates are not silently saved and 'the day after tomorrow' is recognized", () => {
  assert.equal(
    parseQuickCapture("Read due October 99", [], [], "2026-10-10").dueDate,
    null,
  );
  assert.equal(
    parseQuickCapture("Read due 2026-02-31", [], [], "2026-10-10").dueDate,
    null,
  );
  const task = capture("create a task due the day after tomorrow")
    .taskPreview[0];
  assert.equal(task.title, "");
  assert.equal(task.dueDate, "2026-10-12");
});
