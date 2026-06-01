import { Router, type IRouter } from "express";
import { eq, gte, desc, and } from "drizzle-orm";
import { db, tasksTable, userStatsTable, milestonesTable, focusSessionsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  let [stats] = await db.select().from(userStatsTable).limit(1);
  if (!stats) {
    const [newStats] = await db.insert(userStatsTable).values({}).returning();
    stats = newStats;
  }

  const criticalCompleted = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.status, "completed"), eq(tasksTable.priority, "critical")));

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

router.get("/analytics/velocity", async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const completed = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.status, "completed"), gte(tasksTable.completedAt, thirtyDaysAgo)));

  // Build day-by-day map
  const dayMap: Record<string, { vp: number; tasksCompleted: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    dayMap[key] = { vp: 0, tasksCompleted: 0 };
  }

  for (const task of completed) {
    if (!task.completedAt) continue;
    const key = new Date(task.completedAt).toISOString().split("T")[0];
    if (dayMap[key]) {
      dayMap[key].vp += task.vpValue ?? 10;
      dayMap[key].tasksCompleted += 1;
    }
  }

  const result = Object.entries(dayMap).map(([date, data]) => ({ date, ...data }));
  res.json(result);
});

router.get("/analytics/milestones", async (_req, res): Promise<void> => {
  const milestones = await db
    .select()
    .from(milestonesTable)
    .orderBy(desc(milestonesTable.achievedAt));
  res.json(milestones);
});

router.get("/dashboard/overview", async (_req, res): Promise<void> => {
  const allTasks = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));

  const today = new Date().toISOString().split("T")[0];
  const todayTasks = allTasks.filter((t) => t.calendarDate === today || t.dueDate === today);
  const upcomingTasks = allTasks
    .filter((t) => t.status !== "completed" && t.dueDate && t.dueDate > today)
    .slice(0, 5);

  let [stats] = await db.select().from(userStatsTable).limit(1);
  if (!stats) {
    const [newStats] = await db.insert(userStatsTable).values({}).returning();
    stats = newStats;
  }

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
