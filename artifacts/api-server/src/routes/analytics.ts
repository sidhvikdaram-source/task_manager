import { Router, type IRouter } from "express";
import { eq, gte, desc, and } from "drizzle-orm";
import { db, tasksTable, userStatsTable, milestonesTable, usersTable } from "@workspace/db";
import { addCalendarDays, localDateKey, localHour } from "../lib/localDate";

const router: IRouter = Router();

async function getOrCreateUserStats(userId: string) {
  const [stats] = await db.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
  if (stats) return stats;
  const [newStats] = await db.insert(userStatsTable).values({ userId }).returning();
  return newStats;
}

async function userTimeZone(userId: string) {
  const [user] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.timezone ?? "UTC";
}

router.get("/analytics/summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;
  const stats = await getOrCreateUserStats(userId);

  const criticalCompleted = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.userId, userId), eq(tasksTable.archived, false), eq(tasksTable.status, "completed"), eq(tasksTable.priority, "critical")));

  res.json({
    totalVp: stats.totalVp,
    tier: stats.tier,
    streakDays: stats.streakDays,
    tasksCompleted: stats.tasksCompleted,
    focusMinutes: stats.focusMinutes,
    avgDailyVp: stats.tasksCompleted > 0 ? Math.round(stats.totalVp / Math.max(stats.streakDays, 1)) : 0,
    topPriorityCompleted: criticalCompleted.length,
  });
});

router.get("/analytics/velocity", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;
  const timezone = await userTimeZone(userId);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const completed = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.userId, userId), eq(tasksTable.archived, false), eq(tasksTable.status, "completed"), gte(tasksTable.completedAt, thirtyDaysAgo)));

  const dayMap: Record<string, { vp: number; tasksCompleted: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const key = addCalendarDays(localDateKey(new Date(), timezone), -i);
    dayMap[key] = { vp: 0, tasksCompleted: 0 };
  }

  for (const task of completed) {
    if (!task.completedAt) continue;
    const key = localDateKey(new Date(task.completedAt), timezone);
    if (dayMap[key]) {
      dayMap[key].vp += task.vpValue ?? 10;
      dayMap[key].tasksCompleted += 1;
    }
  }

  res.json(Object.entries(dayMap).map(([date, data]) => ({ date, ...data })));
});

router.get("/analytics/milestones", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const milestones = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.userId, userId))
    .orderBy(desc(milestonesTable.achievedAt));
  res.json(milestones);
});

router.get("/analytics/insights", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const stats = await getOrCreateUserStats(req.user.id);
  const timezone = await userTimeZone(req.user.id);
  const completed = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.archived, false), eq(tasksTable.status, "completed")));
  const insights: Array<{ type: string; text: string; sampleSize: number }> = [];

  const hourCounts = new Array<number>(24).fill(0);
  completed.forEach((task) => { if (task.completedAt) hourCounts[localHour(new Date(task.completedAt), timezone)] += 1; });
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  if (completed.filter((task) => task.completedAt).length >= 5 && hourCounts[peakHour] > 0) {
    const formatHour = (hour: number) => `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
    insights.push({ type: "peak-time", text: `You complete the most tasks between ${formatHour(peakHour)} and ${formatHour((peakHour + 2) % 24)}.`, sampleSize: completed.filter((task) => task.completedAt).length });
  }

  const mathTasks = completed.filter((task) => /\b(math|algebra|geometry|calculus|amc)\b/i.test(`${task.title} ${task.description ?? ""}`) && task.estimatedMinutes && task.actualMinutes);
  if (mathTasks.length >= 3) {
    const estimate = mathTasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0);
    const actual = mathTasks.reduce((sum, task) => sum + (task.actualMinutes ?? 0), 0);
    const difference = Math.round((actual / estimate - 1) * 100);
    insights.push({ type: "estimate", text: difference > 0 ? `Math tasks take approximately ${difference}% longer than your estimate.` : `Your math task estimates are within ${Math.abs(difference)}% of actual time.`, sampleSize: mathTasks.length });
  }

  const vpRemaining = stats.tierProgress === 0 && stats.totalVp > 0 ? 100 : 100 - stats.tierProgress;
  insights.push({ type: "tier", text: `You are ${vpRemaining} NP away from your next tier.`, sampleSize: 1 });
  res.json(insights);
});

router.get("/dashboard/overview", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;
  const timezone = await userTimeZone(userId);

  const allTasks = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.userId, userId), eq(tasksTable.archived, false)))
    .orderBy(desc(tasksTable.createdAt));

  const today = localDateKey(new Date(), timezone);
  const todayTasks = allTasks.filter((t) => t.calendarDate === today || t.dueDate === today);
  const upcomingTasks = allTasks
    .filter((t) => t.status !== "completed" && t.dueDate && t.dueDate > today)
    .slice(0, 5);

  const stats = await getOrCreateUserStats(userId);

  res.json({
    totalTasks: allTasks.length,
    todoCount: allTasks.filter((t) => t.status === "todo").length,
    inProgressCount: allTasks.filter((t) => t.status === "in_progress").length,
    completedCount: allTasks.filter((t) => t.status === "completed").length,
    criticalCount: allTasks.filter((t) => t.priority === "critical" && t.status !== "completed").length,
    todayTasks: todayTasks.map((t) => ({ ...t, checklistCount: 0, checklistCompleted: 0 })),
    upcomingTasks: upcomingTasks.map((t) => ({ ...t, checklistCount: 0, checklistCompleted: 0 })),
    userStats: {
      totalVp: stats.totalVp,
      tier: stats.tier,
      tierProgress: stats.tierProgress,
      streakDays: stats.streakDays,
      multiplier: stats.multiplier,
      tasksCompleted: stats.tasksCompleted,
      focusMinutes: stats.focusMinutes,
    },
  });
});

export default router;
