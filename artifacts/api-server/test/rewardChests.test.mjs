import assert from "node:assert/strict";
import test from "node:test";
import { earnedChestSources } from "../src/lib/rewardChestRules.ts";

test("milestone chest source keys are deterministic and unique", () => {
  const sources = earnedChestSources({ tier: 15, tasksCompleted: 100, focusMinutes: 1200 });
  const keys = sources.map((source) => source.sourceKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("tier:15"));
  assert.ok(keys.includes("tasks:100"));
  assert.ok(keys.includes("focus:1200"));
  assert.equal(sources.find((source) => source.sourceKey === "tasks:100")?.rarity, "epic");
});

test("no milestone chests are created before thresholds", () => {
  assert.deepEqual(earnedChestSources({ tier: 1, tasksCompleted: 9, focusMinutes: 119 }), []);
});
