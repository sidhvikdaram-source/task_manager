import { Router, type IRouter } from "express";
import { eq, gte, desc, and } from "drizzle-orm";
import { db, tasksTable, userStatsTable, milestonesTable } from "@workspace/db";

const router: IRouter = Router();

async function getOrCreateUserStats(userId: string) {
  const [stats] = await db.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
  if (stats) return stats;
  const [newStats] = await db.insert(userStatsTable).values({ userId }).returning();
  return newStats;
}

router.get("/analytics/summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;
  const stats = await getOrCreateUserStats(userId);

  const criticalCompleted = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "completed"), eq(tasksTable.priority, "critical")));

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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const completed = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "completed"), gte(tasksTable.completedAt, thirtyDaysAgo)));

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

router.get("/dashboard/overview", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const allTasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.userId, userId))
    .orderBy(desc(tasksTable.createdAt));

  const today = new Date().toISOString().split("T")[0];
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
