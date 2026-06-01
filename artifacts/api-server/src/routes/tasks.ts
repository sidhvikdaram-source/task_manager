import { Router, type IRouter } from "express";
import { eq, desc, asc, and } from "drizzle-orm";
import { db, tasksTable, checklistItemsTable, userStatsTable } from "@workspace/db";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
  CompleteTaskParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateUserStats() {
  const [stats] = await db.select().from(userStatsTable).limit(1);
  if (stats) return stats;
  const [newStats] = await db.insert(userStatsTable).values({}).returning();
  return newStats;
}

async function getTaskWithCounts(id: number) {
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) return null;
  const items = await db.select().from(checklistItemsTable).where(eq(checklistItemsTable.taskId, id));
  return {
    ...task,
    checklistCount: items.length,
    checklistCompleted: items.filter((i) => i.completed).length,
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, priority, sortBy } = parsed.data;
  const conditions = [];
  if (status) conditions.push(eq(tasksTable.status, status));
  if (priority) conditions.push(eq(tasksTable.priority, priority));

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      sortBy === "dueDate" ? asc(tasksTable.dueDate) :
      sortBy === "vpValue" ? desc(tasksTable.vpValue) :
      sortBy === "priority" ? asc(tasksTable.priority) :
      desc(tasksTable.createdAt)
    );

  const allItems = await db.select().from(checklistItemsTable);
  const result = tasks.map((t) => {
    const items = allItems.filter((i) => i.taskId === t.id);
    return {
      ...t,
      checklistCount: items.length,
      checklistCompleted: items.filter((i) => i.completed).length,
    };
  });
  res.json(result);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const vpValue = parsed.data.vpValue ?? (
    parsed.data.priority === "critical" ? 25 :
    parsed.data.priority === "high" ? 15 :
    parsed.data.priority === "medium" ? 10 : 5
  );

  const [task] = await db.insert(tasksTable).values({
    ...parsed.data,
    vpValue,
  }).returning();

  res.status(201).json({ ...task, checklistCount: 0, checklistCompleted: 0 });
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const task = await getTaskWithCounts(params.data.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(task);
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db
    .update(tasksTable)
    .set(parsed.data)
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const full = await getTaskWithCounts(task.id);
  res.json(full);
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .delete(tasksTable)
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/tasks/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [task] = await db
    .update(tasksTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  const stats = await getOrCreateUserStats();
  const multiplier = stats.multiplier ?? 1.0;
  const rawVp = task.vpValue ?? 10;
  const vpAwarded = Math.round(rawVp * multiplier);
  const newTotal = stats.totalVp + vpAwarded;
  const newTierProgress = stats.tierProgress + vpAwarded;
  const tierUps = Math.floor(newTierProgress / 100);
  const newTier = stats.tier + tierUps;
  const remainingProgress = newTierProgress % 100;

  // Update streak
  const today = new Date().toDateString();
  const lastActivity = stats.lastActivityDate ? new Date(stats.lastActivityDate).toDateString() : null;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let newStreak = stats.streakDays;
  if (lastActivity === today) {
    // same day, no change
  } else if (lastActivity === yesterday) {
    newStreak = stats.streakDays + 1;
  } else {
    newStreak = 1;
  }

  // Multiplier: 1.2x at 3 streak days, 1.5x at 7, 2.0x at 14
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

  // Check for new milestones
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
      const { milestonesTable } = await import("@workspace/db");
      await db.insert(milestonesTable).values({
        title,
        description,
        vpThreshold: threshold,
        achievedAt: new Date(),
      });
    }
  }

  const full = await getTaskWithCounts(task.id);
  res.json({
    task: full,
    vpAwarded,
    multiplier,
    newTotal,
    tierUp: tierUps > 0,
    newTier: tierUps > 0 ? newTier : null,
  });
});

export default router;
