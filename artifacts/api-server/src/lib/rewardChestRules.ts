export type ChestRarity = "common" | "rare" | "epic";

export type ChestRuleStats = {
  tier: number;
  tasksCompleted: number;
  focusMinutes: number;
};

export type ChestSource = {
  sourceKey: string;
  rarity: ChestRarity;
};

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
    sources.push({ sourceKey: `tier:${tier}`, rarity: "epic" });
  }
  const taskMilestones: Array<[number, ChestRarity]> = [
    [10, "common"],
    [25, "rare"],
    [50, "rare"],
    [100, "epic"],
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
  ];
  for (const [minutes, rarity] of focusMilestones) {
    if (stats.focusMinutes >= minutes) {
      sources.push({ sourceKey: `focus:${minutes}`, rarity });
    }
  }
  return sources;
}
