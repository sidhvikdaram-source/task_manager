import assert from "node:assert/strict";
import test from "node:test";
import {
  FORECAST_COSTS,
  isChargeableTask,
  isHabitScheduledToday,
  rollForecast,
  windyReward,
} from "../src/lib/forecastRules.ts";

test("daily forecast bands preserve a five percent rainbow chance", () => {
  assert.equal(rollForecast(0), "rainbow");
  assert.equal(rollForecast(4), "rainbow");
  assert.equal(rollForecast(5), "windy");
  assert.equal(rollForecast(29), "windy");
  assert.equal(rollForecast(30), "foggy");
  assert.equal(rollForecast(49), "foggy");
  assert.equal(rollForecast(50), "stormy");
  assert.equal(rollForecast(69), "stormy");
  assert.equal(rollForecast(70), "sunny");
  assert.equal(rollForecast(99), "sunny");
});

test("wind rewards are bounded and not guaranteed", () => {
  assert.equal(windyReward(45, 4), 0);
  assert.equal(windyReward(12, 0), 6);
  assert.equal(windyReward(12, 10), 16);
  assert.equal(windyReward(12, 999), 16);
});

test("forecast agency prices increase with information and progression value", () => {
  assert.ok(FORECAST_COSTS.reroll < FORECAST_COSTS.peek);
  assert.ok(FORECAST_COSTS.peek < FORECAST_COSTS.boost);
});

test("storm charges only actionable tasks due today", () => {
  const today = "2026-07-26";
  const base = { title: "Finish science notes", status: "todo", dueDate: today };
  assert.equal(isChargeableTask(base, today), true);
  assert.equal(isChargeableTask({ ...base, dueDate: "2026-07-27" }, today), false);
  assert.equal(isChargeableTask({ ...base, blocked: true }, today), false);
  assert.equal(isChargeableTask({ ...base, externalSource: "canvas_event" }, today), false);
  assert.equal(isChargeableTask({ ...base, status: "completed" }, today), false);
});

test("tests and exams cannot become charged tasks, but preparation can", () => {
  const today = "2026-07-26";
  assert.equal(isChargeableTask({ title: "Algebra final exam", taskKind: "exam", dueDate: today }, today), false);
  assert.equal(isChargeableTask({ title: "Chapter 8 test", taskKind: "assignment", dueDate: today }, today), false);
  assert.equal(isChargeableTask({ title: "Review for Chapter 8 test", taskKind: "assignment", dueDate: today }, today), true);
  assert.equal(isChargeableTask({ title: "Practice quiz questions", taskKind: "quiz", dueDate: today }, today), true);
});

test("only habits scheduled for the forecast day are eligible", () => {
  assert.equal(isHabitScheduledToday("0,2,4", "2026-07-26"), true);
  assert.equal(isHabitScheduledToday("1,3,5", "2026-07-26"), false);
});
