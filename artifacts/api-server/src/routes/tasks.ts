import { Router, type IRouter } from "express";
import { eq, desc, asc, and, inArray } from "drizzle-orm";
import { db, tasksTable, checklistItemsTable, userStatsTable, milestonesTable } from "@workspace/db";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
  CompleteTaskParams,
  BulkRescheduleBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateUserStats(userId: string) {
  const [stats] = await db.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
  if (stats) return stats;
  const [newStats] = await db.insert(userStatsTable).values({ userId }).returning();
  return newStats;
}

async function getTaskWithCounts(id: number, userId: string) {
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId)));
  if (!task) return null;
  const items = await db.select().from(checklistItemsTable).where(eq(checklistItemsTable.taskId, id));
  return {
    ...task,
    checklistCount: items.length,
    checklistCompleted: items.filter((i) => i.completed).length,
  };
}

function withChecklistCounts<T extends { id: number }>(tasks: T[], items: Array<{ taskId: number; completed: boolean }>) {
  const countMap = new Map<number, { total: number; completed: number }>();
  for (const item of items) {
    const counts = countMap.get(item.taskId) ?? { total: 0, completed: 0 };
    counts.total += 1;
    if (item.completed) counts.completed += 1;
    countMap.set(item.taskId, counts);
  }

  return tasks.map((task) => {
    const counts = countMap.get(task.id) ?? { total: 0, completed: 0 };
    return { ...task, checklistCount: counts.total, checklistCompleted: counts.completed };
  });
}

router.get("/tasks", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { status, priority, sortBy, projectId } = parsed.data;
  const conditions: ReturnType<typeof eq>[] = [eq(tasksTable.userId, userId)];
  if (status) conditions.push(eq(tasksTable.status, status));
  if (priority) conditions.push(eq(tasksTable.priority, priority));
  if (projectId) conditions.push(eq(tasksTable.projectId, projectId));

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(and(...conditions))
    .orderBy(
      sortBy === "dueDate" ? asc(tasksTable.dueDate) :
      sortBy === "vpValue" ? desc(tasksTable.vpValue) :
      sortBy === "priority" ? asc(tasksTable.priority) :
      desc(tasksTable.createdAt)
    );

  if (tasks.length === 0) {
    res.json([]);
    return;
  }

  const checklistItems = await db
    .select({
      taskId: checklistItemsTable.taskId,
      completed: checklistItemsTable.completed,
    })
    .from(checklistItemsTable)
    .where(inArray(checklistItemsTable.taskId, tasks.map((task) => task.id)));

  res.json(withChecklistCounts(tasks, checklistItems));
});

router.post("/tasks", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const vpValue = parsed.data.vpValue ?? (
    parsed.data.priority === "critical" ? 25 :
    parsed.data.priority === "high" ? 15 :
    parsed.data.priority === "medium" ? 10 : 5
  );

  const [task] = await db.insert(tasksTable).values({ ...parsed.data, vpValue, userId }).returning();
  res.status(201).json({ ...task, checklistCount: 0, checklistCompleted: 0 });
});

router.patch("/tasks/bulk-reschedule", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const parsed = BulkRescheduleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { taskIds, newDate } = parsed.data;
  const updated = await db
    .update(tasksTable)
    .set({ dueDate: newDate })
    .where(and(inArray(tasksTable.id, taskIds), eq(tasksTable.userId, userId)))
    .returning();

  res.json({ updated: updated.length });
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const task = await getTaskWithCounts(params.data.id, req.user.id);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [task] = await db
    .update(tasksTable)
    .set(parsed.data)
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, userId)))
    .returning();

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const full = await getTaskWithCounts(task.id, userId);
  res.json(full);
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [task] = await db
    .delete(tasksTable)
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, userId)))
    .returning();

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.sendStatus(204);
});

router.post("/tasks/:id/complete", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const params = CompleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }

  const [task] = await db
    .update(tasksTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, userId)))
    .returning();

  const stats = await getOrCreateUserStats(userId);
  const multiplier = stats.multiplier ?? 1.0;
  const rawVp = task.vpValue ?? 10;
  const vpAwarded = Math.round(rawVp * multiplier);
  const newTotal = stats.totalVp + vpAwarded;
  const newTierProgress = stats.tierProgress + vpAwarded;
  const tierUps = Math.floor(newTierProgress / 100);
  const newTier = stats.tier + tierUps;
  const remainingProgress = newTierProgress % 100;

  const today = new Date().toDateString();
  const lastActivity = stats.lastActivityDate ? new Date(stats.lastActivityDate).toDateString() : null;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let newStreak = stats.streakDays;
  if (lastActivity === today) {
    // same day, streak unchanged
  } else if (lastActivity === yesterday) {
    newStreak = stats.streakDays + 1;
  } else {
    newStreak = 1;
  }

  let newMultiplier = 1.0;
  if (newStreak >= 14) newMultiplier = 2.0;
  else if (newStreak >= 7) newMultiplier = 1.5;
  else if (newStreak >= 3) newMultiplier = 1.2;

  await db.update(userStatsTable).set({
    totalVp: newTotal,
    tier: newTier,
    tierProgress: remainingProgress,
    tasksCompleted: stats.tasksCompleted + 1,
    streakDays: newStreak,
    multiplier: newMultiplier,
    lastActivityDate: new Date(),
    updatedAt: new Date(),
  }).where(eq(userStatsTable.id, stats.id));

  const milestoneThresholds = [50, 100, 250, 500, 1000, 2500, 5000];
  for (const threshold of milestoneThresholds) {
    if (stats.totalVp < threshold && newTotal >= threshold) {
      const titles: Record<number, [string, string]> = {
        50: ["First Sprint", "Earned your first 50 VP"],
        100: ["Century Mark", "Reached 100 total VP"],
        250: ["Momentum Builder", "250 VP milestone achieved"],
        500: ["High Velocity", "500 VP — serious momentum"],
        1000: ["Elite Operator", "1000 VP — top 1% territory"],
        2500: ["Velocity Master", "2500 VP milestone"],
        5000: ["Legendary Status", "5000 VP achieved"],
      };
      const [title, description] = titles[threshold] ?? [`${threshold} VP`, `Reached ${threshold} VP`];
      await db.insert(milestonesTable).values({ title, description, vpThreshold: threshold, achievedAt: new Date(), userId });
    }
  }

  const full = await getTaskWithCounts(task.id, userId);
  res.json({ task: full, vpAwarded, multiplier, newTotal, tierUp: tierUps > 0, newTier: tierUps > 0 ? newTier : null });
});

export default router;
