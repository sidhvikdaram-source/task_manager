import assert from "node:assert/strict";
import test from "node:test";
import {
  chestRarityUpgraded,
  earnedChestSources,
  rollChestBp,
  rollChestRarity,
  rollChestRewardType,
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

test("higher-rarity chests can upgrade through legendary", () => {
  assert.equal(rollChestRarity("rare", 0.05), "epic");
  assert.equal(rollChestRarity("rare", 0.5), "rare");
  assert.equal(rollChestRarity("epic", 0), "legendary");
  assert.equal(rollChestRarity("legendary", 0), "legendary");
  assert.equal(chestRarityUpgraded("epic", "legendary"), true);
});

test("chests can yield BP and key rewards with bounded BP amounts", () => {
  assert.equal(rollChestRewardType("common", 0.6), "bp");
  assert.equal(rollChestRewardType("common", 0.99), "key");
  assert.equal(rollChestBp("common", 0), 30);
  assert.equal(rollChestBp("legendary", 0.999999), 650);
});
