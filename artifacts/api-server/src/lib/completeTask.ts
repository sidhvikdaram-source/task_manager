import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  milestonesTable,
  tasksTable,
  usersTable,
  userStatsTable,
} from "@workspace/db";
import { completionDisposition } from "./taskCompletionRules";
import { awardBpInTransaction, awardMomentumMilestonesInTransaction, lockEconomyUser } from "./bpEconomy";
import { BP_RULES, VP_RULES } from "./economyConfig";
import { areConsecutiveCalendarDates, localDateKey } from "./localDate";
import { applyForecastCompletionInTransaction } from "./forecastRewards";

export class TaskNotFoundError extends Error {}

export async function completeTaskAndAward(userId: string, taskId: number) {
  return db.transaction(async (tx) => {
    await lockEconomyUser(tx, userId);
    const [existing] = await tx.select().from(tasksTable)
      .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)));
    if (!existing) throw new TaskNotFoundError("Task not found");

    const disposition = completionDisposition(existing.status, existing.completionAwardedAt);
    if (disposition === "already-complete") {
      if (!existing.completionAwardedAt) {
        await tx.update(tasksTable).set({ completionAwardedAt: existing.completedAt ?? new Date() })
          .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId), isNull(tasksTable.completionAwardedAt)));
      }
      return { task: existing, vpAwarded: 0, bpAwarded: 0, momentumRewards: [], multiplier: 1, newTotal: null, tierUp: false, newTier: null, firstCompletionToday: false, consecutiveMomentum: false, streakDays: null };
    }

    const completedAt = new Date();
    if (disposition === "complete-without-award") {
      const [task] = await tx.update(tasksTable)
        .set({ status: "completed", completedAt })
        .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)))
        .returning();
      return { task: task ?? existing, vpAwarded: 0, bpAwarded: 0, momentumRewards: [], multiplier: 1, newTotal: null, tierUp: false, newTier: null, firstCompletionToday: false, consecutiveMomentum: false, streakDays: null };
    }

    const [task] = await tx.update(tasksTable)
      .set({ status: "completed", completedAt, completionAwardedAt: completedAt })
      .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId), isNull(tasksTable.completionAwardedAt)))
      .returning();
    if (!task) {
      const [current] = await tx.select().from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)));
      return { task: current ?? existing, vpAwarded: 0, bpAwarded: 0, momentumRewards: [], multiplier: 1, newTotal: null, tierUp: false, newTier: null, firstCompletionToday: false, consecutiveMomentum: false, streakDays: null };
    }

    let [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
    if (!stats) [stats] = await tx.insert(userStatsTable).values({ userId }).returning();
    const [user] = await tx
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const baseMultiplier = stats.multiplier ?? 1;
    const baseVpAwarded = Math.round((task.vpValue ?? 10) * baseMultiplier);
    const timezone = user?.timezone ?? "UTC";
    const forecastReward = await applyForecastCompletionInTransaction(
      tx,
      userId,
      task,
      completedAt,
      baseVpAwarded,
      timezone,
    );
    const vpAwarded = baseVpAwarded + forecastReward.bonusNp;
    const multiplier = (task.vpValue ?? 10) > 0 ? vpAwarded / (task.vpValue ?? 10) : baseMultiplier;
    const newTotal = stats.totalVp + vpAwarded;
    const progress = stats.tierProgress + vpAwarded;
    const tierUps = Math.floor(progress / VP_RULES.tierSize);
    const newTier = stats.tier + tierUps;
    const today = localDateKey(completedAt, timezone);
    const lastActivity = stats.lastActivityDate
      ? localDateKey(stats.lastActivityDate, timezone)
      : null;
    const firstCompletionToday = lastActivity !== today;
    const consecutiveMomentum = firstCompletionToday && lastActivity !== null && areConsecutiveCalendarDates(lastActivity, today);
    // Momentum counts active days. Missing a day never erases progress.
    const newStreak = firstCompletionToday ? stats.streakDays + 1 : stats.streakDays;
    const newMultiplier = newStreak >= 14 ? 2 : newStreak >= 7 ? 1.5 : newStreak >= 3 ? 1.2 : 1;

    await tx.update(userStatsTable).set({ totalVp: newTotal, lifetimeVp: stats.lifetimeVp + vpAwarded, tier: newTier, tierProgress: progress % VP_RULES.tierSize,
      tasksCompleted: stats.tasksCompleted + 1, streakDays: newStreak, multiplier: newMultiplier,
      lastActivityDate: completedAt, updatedAt: completedAt }).where(eq(userStatsTable.id, stats.id));

    const momentumRewards = firstCompletionToday
      ? await awardMomentumMilestonesInTransaction(tx, userId, stats.streakDays, newStreak)
      : [];
    const dailyBp = firstCompletionToday
      ? await awardBpInTransaction(tx, userId, BP_RULES.dailyCompletion, `daily-task:${today}`, "Daily task reward")
      : { awarded: 0 };
    const visibleForecastBp = forecastReward.hidden ? 0 : forecastReward.bonusBp;
    const bpAwarded = dailyBp.awarded + momentumRewards.reduce((sum, reward) => sum + reward.bp, 0) + visibleForecastBp;

    const copy: Record<number, [string, string]> = {
      50: ["First Sprint", "Earned your first 50 NP"], 100: ["Century Mark", "Reached 100 total NP"],
      250: ["Momentum Builder", "250 NP milestone achieved"], 500: ["High Momentum", "500 NP milestone achieved"],
      1000: ["Elite Operator", "1000 NP milestone achieved"], 2500: ["Nimbus Master", "2500 NP milestone achieved"],
      5000: ["Legendary Status", "5000 NP achieved"],
    };
    for (const threshold of Object.keys(copy).map(Number)) {
      if (stats.totalVp < threshold && newTotal >= threshold) {
        const [title, description] = copy[threshold];
        await tx.insert(milestonesTable).values({ userId, title, description, vpThreshold: threshold, achievedAt: completedAt });
      }
    }
    return {
      task,
      vpAwarded,
      bpAwarded,
      momentumRewards,
      multiplier,
      newTotal,
      tierUp: tierUps > 0,
      newTier: tierUps > 0 ? newTier : null,
      firstCompletionToday,
      consecutiveMomentum,
      streakDays: newStreak,
      forecastReward: {
        weather: forecastReward.weather,
        triggered: forecastReward.triggered,
        bonusNp: forecastReward.bonusNp,
        bonusBp: visibleForecastBp,
        hidden: forecastReward.hidden,
      },
    };
  });
}
