import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  milestonesTable,
  tasksTable,
  usersTable,
  userStatsTable,
} from "@workspace/db";
import { completionDisposition } from "./taskCompletionRules";

export class TaskNotFoundError extends Error {}

function localDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function completeTaskAndAward(userId: string, taskId: number) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(tasksTable)
      .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)));
    if (!existing) throw new TaskNotFoundError("Task not found");

    const disposition = completionDisposition(existing.status, existing.completionAwardedAt);
    if (disposition === "already-complete") {
      if (!existing.completionAwardedAt) {
        await tx.update(tasksTable).set({ completionAwardedAt: existing.completedAt ?? new Date() })
          .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId), isNull(tasksTable.completionAwardedAt)));
      }
      return { task: existing, vpAwarded: 0, multiplier: 1, newTotal: null, tierUp: false, newTier: null, firstCompletionToday: false, streakDays: null };
    }

    const completedAt = new Date();
    if (disposition === "complete-without-award") {
      const [task] = await tx.update(tasksTable)
        .set({ status: "completed", completedAt })
        .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)))
        .returning();
      return { task: task ?? existing, vpAwarded: 0, multiplier: 1, newTotal: null, tierUp: false, newTier: null, firstCompletionToday: false, streakDays: null };
    }

    const [task] = await tx.update(tasksTable)
      .set({ status: "completed", completedAt, completionAwardedAt: completedAt })
      .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId), isNull(tasksTable.completionAwardedAt)))
      .returning();
    if (!task) {
      const [current] = await tx.select().from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)));
      return { task: current ?? existing, vpAwarded: 0, multiplier: 1, newTotal: null, tierUp: false, newTier: null, firstCompletionToday: false, streakDays: null };
    }

    let [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
    if (!stats) [stats] = await tx.insert(userStatsTable).values({ userId }).returning();
    const [user] = await tx
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const multiplier = stats.multiplier ?? 1;
    const vpAwarded = Math.round((task.vpValue ?? 10) * multiplier);
    const newTotal = stats.totalVp + vpAwarded;
    const progress = stats.tierProgress + vpAwarded;
    const tierUps = Math.floor(progress / 100);
    const newTier = stats.tier + tierUps;
    const timezone = user?.timezone ?? "UTC";
    const today = localDateKey(completedAt, timezone);
    const lastActivity = stats.lastActivityDate
      ? localDateKey(stats.lastActivityDate, timezone)
      : null;
    const firstCompletionToday = lastActivity !== today;
    // Momentum counts active days. Missing a day never erases progress.
    const newStreak = firstCompletionToday ? stats.streakDays + 1 : stats.streakDays;
    const newMultiplier = newStreak >= 14 ? 2 : newStreak >= 7 ? 1.5 : newStreak >= 3 ? 1.2 : 1;

    await tx.update(userStatsTable).set({ totalVp: newTotal, lifetimeVp: stats.lifetimeVp + vpAwarded, tier: newTier, tierProgress: progress % 100,
      tasksCompleted: stats.tasksCompleted + 1, streakDays: newStreak, multiplier: newMultiplier,
      lastActivityDate: completedAt, updatedAt: completedAt }).where(eq(userStatsTable.id, stats.id));

    const copy: Record<number, [string, string]> = {
      50: ["First Sprint", "Earned your first 50 VP"], 100: ["Century Mark", "Reached 100 total VP"],
      250: ["Momentum Builder", "250 VP milestone achieved"], 500: ["High Velocity", "500 VP milestone achieved"],
      1000: ["Elite Operator", "1000 VP milestone achieved"], 2500: ["Velocity Master", "2500 VP milestone achieved"],
      5000: ["Legendary Status", "5000 VP achieved"],
    };
    for (const threshold of Object.keys(copy).map(Number)) {
      if (stats.totalVp < threshold && newTotal >= threshold) {
        const [title, description] = copy[threshold];
        await tx.insert(milestonesTable).values({ userId, title, description, vpThreshold: threshold, achievedAt: completedAt });
      }
    }
    return { task, vpAwarded, multiplier, newTotal, tierUp: tierUps > 0, newTier: tierUps > 0 ? newTier : null, firstCompletionToday, streakDays: newStreak };
  });
}
