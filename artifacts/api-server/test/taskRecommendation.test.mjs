import assert from "node:assert/strict";
import test from "node:test";
import { inferTaskWorkload, scoreTaskRecommendation } from "../src/lib/taskRecommendation.ts";

test("infers focused academic work from task meaning instead of the default difficulty", () => {
  const workload = inferTaskWorkload({ title: "Prepare for the regional math exam", priority: "medium", difficulty: 2, taskKind: "assignment" });
  assert.equal(workload.difficulty, 3);
  assert.equal(workload.duration, 45);
  assert.equal(workload.workload, "deep work");
});

test("recognizes short administrative actions even when task kind uses the default assignment value", () => {
  const workload = inferTaskWorkload({ title: "Email the permission form", priority: "medium", difficulty: 2, taskKind: "assignment" });
  assert.equal(workload.difficulty, 1);
  assert.equal(workload.duration, 10);
});

test("recommends a short activity over deep work when only ten minutes are available", () => {
  const options = { minutes: 10, energy: "medium", today: "2026-07-17" };
  const pingPong = scoreTaskRecommendation(
    { title: "Play ping pong", priority: "medium", difficulty: 2, dueDate: null },
    options,
  );
  const amcDeepWork = scoreTaskRecommendation(
    { title: "Do AMC 8 deepwork", priority: "medium", difficulty: 2, dueDate: null },
    options,
  );

  assert.equal(pingPong.duration, 10);
  assert.equal(pingPong.eligible, true);
  assert.equal(pingPong.canFinish, true);
  assert.equal(amcDeepWork.duration, 45);
  assert.equal(amcDeepWork.eligible, false);
});

test("uses a duration written in the task name when no estimate was saved", () => {
  const workload = inferTaskWorkload({ title: "Walk for 20 minutes", priority: "medium", difficulty: 2 });
  assert.equal(workload.duration, 20);
  assert.equal(workload.durationSource, "title");
});

test("priority and urgency outweigh a low-value easy task", () => {
  const urgent = scoreTaskRecommendation({ title: "Review science test material", priority: "critical", difficulty: 2, dueDate: "2026-07-18" }, { minutes: 30, energy: "medium", today: "2026-07-17" });
  const easy = scoreTaskRecommendation({ title: "Organize downloads", priority: "low", difficulty: 2, dueDate: null }, { minutes: 30, energy: "medium", today: "2026-07-17" });
  assert.ok(urgent.score > easy.score);
  assert.equal(urgent.eligible, true);
  assert.equal(urgent.canFinish, false);
});
