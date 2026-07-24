import { Router, type IRouter } from "express";
import { eq, desc, asc, and, inArray } from "drizzle-orm";
import { db, tasksTable, checklistItemsTable, projectsTable } from "@workspace/db";
import { completeTaskAndAward, TaskNotFoundError } from "../lib/completeTask";
import { reconcileRewardChests } from "../lib/rewardChests";
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

function taskMetadata(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const update: Partial<typeof tasksTable.$inferInsert> = {};
  if (typeof value.subject === "string") update.subject = value.subject.trim().slice(0, 50) || null;
  if (typeof value.taskKind === "string" && ["assignment","test","quiz","project","note","reading","practice"].includes(value.taskKind)) update.taskKind = value.taskKind;
  if (Number.isInteger(value.difficulty)) update.difficulty = Math.min(3, Math.max(1, Number(value.difficulty)));
  if (typeof value.blocked === "boolean") update.blocked = value.blocked;
  if (typeof value.organized === "boolean") update.organized = value.organized;
  return update;
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
  const conditions: ReturnType<typeof eq>[] = [eq(tasksTable.userId, userId), eq(tasksTable.archived, false)];
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

  const metadata = taskMetadata(req.body);
  if (parsed.data.projectId && !metadata.subject) {
    const [project] = await db.select({ subject: projectsTable.subject }).from(projectsTable).where(and(eq(projectsTable.id, parsed.data.projectId), eq(projectsTable.userId, userId)));
    if (!project) { res.status(400).json({ error: "Project not found." }); return; }
    metadata.subject = project.subject;
  }
  const [task] = await db.insert(tasksTable).values({ ...parsed.data, ...metadata, vpValue, userId }).returning();
  res.status(201).json({ ...task, checklistCount: 0, checklistCompleted: 0 });
});

router.patch("/tasks/bulk-reschedule", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const parsed = BulkRescheduleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { taskIds, newDate } = parsed.data;
  const selected = await db.select({ externalSource: tasksTable.externalSource }).from(tasksTable)
    .where(and(inArray(tasksTable.id, taskIds), eq(tasksTable.userId, userId)));
  if (selected.some((task) => task.externalSource)) { res.status(409).json({ error: "Canvas controls imported due dates. Remove Canvas tasks from this bulk action." }); return; }
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

  const [existing] = await db.select().from(tasksTable)
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  const protectedFields = ["title", "dueDate", "calendarDate", "startDate", "subject", ...(existing.externalSource === "canvas" ? ["status"] : [])];
  if (existing.externalSource && protectedFields.some((field) => Object.prototype.hasOwnProperty.call(parsed.data, field))) {
    res.status(409).json({ error: "Canvas controls this task's title, course, due time, and submission state." });
    return;
  }

  const [task] = await db
    .update(tasksTable)
    .set({ ...parsed.data, ...taskMetadata(req.body) })
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

  const [existing] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, userId)));
  if (existing?.externalSource) { res.status(409).json({ error: "Use Remove from Nimbus for Canvas tasks so they remain ignored on future syncs." }); return; }

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
  const taskId = params.data.id;
  const [existing] = await db.select({ externalSource: tasksTable.externalSource }).from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)));
  if (existing?.externalSource === "canvas") { res.status(409).json({ error: "Canvas controls submission completion for this task." }); return; }

  try {
    const result = await completeTaskAndAward(userId, taskId);
    void reconcileRewardChests(userId).catch((error) =>
      req.log?.warn({ err: error }, "Reward chest reconciliation deferred"),
    );
    const full = await getTaskWithCounts(result.task.id, userId);
    res.json({ ...result, task: full });
    return;
  } catch (error) {
    if (error instanceof TaskNotFoundError) { res.status(404).json({ error: error.message }); return; }
    throw error;
  }

});

export default router;
