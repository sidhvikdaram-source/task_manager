import assert from "node:assert/strict";
import test from "node:test";
import {
  chestRarityUpgraded,
  earnedChestSources,
  rollChestRarity,
} from "../src/lib/rewardChestRules.ts";

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

test("common chests can stay common or upgrade with bounded rarity rolls", () => {
  assert.equal(rollChestRarity("common", 0.9), "common");
  assert.equal(rollChestRarity("common", 0.1), "rare");
  assert.equal(rollChestRarity("common", 0.01), "epic");
  assert.equal(chestRarityUpgraded("common", "rare"), true);
  assert.equal(chestRarityUpgraded("rare", "rare"), false);
});

test("rare chests only upgrade to epic and epic chests remain epic", () => {
  assert.equal(rollChestRarity("rare", 0.05), "epic");
  assert.equal(rollChestRarity("rare", 0.5), "rare");
  assert.equal(rollChestRarity("epic", 0), "epic");
});
