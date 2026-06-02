import { Router, type IRouter } from "express";
import { eq, and, count } from "drizzle-orm";
import { db, projectsTable, tasksTable } from "@workspace/db";
import { CreateProjectBody, UpdateProjectParams, UpdateProjectBody, DeleteProjectParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId))
    .orderBy(projectsTable.createdAt);

  const taskCounts = await db
    .select({ projectId: tasksTable.projectId, count: count() })
    .from(tasksTable)
    .where(and(eq(tasksTable.userId, userId)))
    .groupBy(tasksTable.projectId);

  const countMap = new Map(taskCounts.map((r) => [r.projectId, Number(r.count)]));

  res.json(projects.map((p) => ({ ...p, taskCount: countMap.get(p.id) ?? 0 })));
});

router.post("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [project] = await db
    .insert(projectsTable)
    .values({ ...parsed.data, userId })
    .returning();

  res.status(201).json({ ...project, taskCount: 0 });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [project] = await db
    .update(projectsTable)
    .set(parsed.data)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId)))
    .returning();

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const [taskCountRow] = await db
    .select({ count: count() })
    .from(tasksTable)
    .where(and(eq(tasksTable.projectId, project.id), eq(tasksTable.userId, userId)));

  res.json({ ...project, taskCount: Number(taskCountRow?.count ?? 0) });
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db
    .update(tasksTable)
    .set({ projectId: null })
    .where(and(eq(tasksTable.projectId, params.data.id), eq(tasksTable.userId, userId)));

  const [project] = await db
    .delete(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId)))
    .returning();

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  res.sendStatus(204);
});

export default router;
