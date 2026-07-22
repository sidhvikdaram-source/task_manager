import { BP_RULES, type EconomyRarity } from "./economyConfig";

export type ChestRarity = EconomyRarity;
export type ChestRewardType = "item" | "bp" | "key";

export type ChestRuleStats = {
  tier: number;
  tasksCompleted: number;
  focusMinutes: number;
};

export type ChestSource = {
  sourceKey: string;
  rarity: ChestRarity;
};

const rarityRank: Record<ChestRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export function rollChestRarity(
  initialRarity: ChestRarity,
  roll = Math.random(),
): ChestRarity {
  const normalizedRoll = Math.min(0.999999, Math.max(0, roll));
  const chances = BP_RULES.chestUpgradeChances[initialRarity];
  let threshold = 0;
  for (const rarity of ["legendary", "epic", "rare"] as const) {
    const chance = chances[rarity] ?? 0;
    threshold += chance;
    if (normalizedRoll < threshold) return rarity;
  }
  return initialRarity;
}

export function rollChestRewardType(
  rarity: ChestRarity,
  roll = Math.random(),
): ChestRewardType {
  const normalizedRoll = Math.min(0.999999, Math.max(0, roll));
  const weights = BP_RULES.chestRewardWeights[rarity];
  if (normalizedRoll < weights.item) return "item";
  if (normalizedRoll < weights.item + weights.bp) return "bp";
  return "key";
}

export function rollChestBp(rarity: ChestRarity, roll = Math.random()) {
  const [minimum, maximum] = BP_RULES.chestBpRanges[rarity];
  const normalizedRoll = Math.min(0.999999, Math.max(0, roll));
  return minimum + Math.floor(normalizedRoll * (maximum - minimum + 1));
}

export function chestRarityUpgraded(
  initialRarity: ChestRarity,
  finalRarity: ChestRarity,
) {
  return rarityRank[finalRarity] > rarityRank[initialRarity];
}

export function earnedChestSources(stats: ChestRuleStats | undefined) {
  if (!stats) return [];
  const sources: ChestSource[] = [];
  for (const tier of [2, 5, 10]) {
    if (stats.tier >= tier) {
      sources.push({
        sourceKey: `tier:${tier}`,
        rarity: tier >= 10 ? "epic" : tier >= 5 ? "rare" : "common",
      });
    }
  }
  for (let tier = 15; tier <= stats.tier; tier += 5) {
    sources.push({ sourceKey: `tier:${tier}`, rarity: tier >= 25 ? "legendary" : "epic" });
  }
  const taskMilestones: Array<[number, ChestRarity]> = [
    [10, "common"],
    [25, "rare"],
    [50, "rare"],
    [100, "epic"],
    [250, "legendary"],
  ];
  for (const [count, rarity] of taskMilestones) {
    if (stats.tasksCompleted >= count) {
      sources.push({ sourceKey: `tasks:${count}`, rarity });
    }
  }
  const focusMilestones: Array<[number, ChestRarity]> = [
    [120, "common"],
    [600, "rare"],
    [1200, "epic"],
    [3000, "legendary"],
  ];
  for (const [minutes, rarity] of focusMilestones) {
    if (stats.focusMinutes >= minutes) {
      sources.push({ sourceKey: `focus:${minutes}`, rarity });
    }
  }
  return sources;
}
