import {
  db,
  userRewardChestsTable,
  userStatsTable,
  weeklyReviewsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { earnedChestSources } from "./rewardChestRules";

export type { ChestRarity } from "./rewardChestRules";

export async function reconcileRewardChests(userId: string) {
  const [stats, reviews] = await Promise.all([
    db
      .select()
      .from(userStatsTable)
      .where(eq(userStatsTable.userId, userId))
      .then((rows) => rows[0]),
    db
      .select({ weekStart: weeklyReviewsTable.weekStart })
      .from(weeklyReviewsTable)
      .where(eq(weeklyReviewsTable.userId, userId)),
  ]);
  const sources = [
    ...earnedChestSources(stats),
    ...reviews.map((review) => ({
      sourceKey: `weekly-review:${review.weekStart}`,
      rarity: "common" as const,
    })),
  ];
  if (!sources.length) return [];
  return db
    .insert(userRewardChestsTable)
    .values(sources.map((source) => ({ userId, ...source })))
    .onConflictDoNothing()
    .returning();
}
