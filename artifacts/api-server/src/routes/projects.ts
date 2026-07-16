import { Router, type IRouter } from "express";
import { and, count, eq } from "drizzle-orm";
import { db, projectRequirementsTable, projectsTable, tasksTable } from "@workspace/db";

const router: IRouter = Router();

function projectInput(body: unknown, partial = false) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const result: Partial<typeof projectsTable.$inferInsert> = {};
  if (typeof value.name === "string" && value.name.trim()) result.name = value.name.trim().slice(0, 100);
  if (typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)) result.color = value.color;
  if (typeof value.description === "string") result.description = value.description.trim().slice(0, 1000) || null;
  if (typeof value.subject === "string") result.subject = value.subject.trim().slice(0, 50) || null;
  if (typeof value.dueDate === "string") result.dueDate = value.dueDate || null;
  if (typeof value.status === "string" && ["active","planning","waiting","completed"].includes(value.status)) result.status = value.status;
  if (typeof value.priority === "string" && ["critical","high","medium","low"].includes(value.priority)) result.priority = value.priority;
  if (typeof value.notes === "string") result.notes = value.notes.trim().slice(0, 4000) || null;
  if (typeof value.rubric === "string") result.rubric = value.rubric.trim().slice(0, 10000) || null;
  if (typeof value.submissionLink === "string") result.submissionLink = value.submissionLink.trim().slice(0, 500) || null;
  if (value.gradeWeight === null || Number.isFinite(Number(value.gradeWeight))) result.gradeWeight = value.gradeWeight === null ? null : Math.min(100, Math.max(0, Number(value.gradeWeight)));
  if (typeof value.archived === "boolean") result.archived = value.archived;
  if (!partial) { result.color ??= "#2563eb"; result.type = "project"; result.status ??= "active"; result.priority ??= "medium"; }
  return result;
}

async function enriched(project: typeof projectsTable.$inferSelect, userId: string) {
  const [taskRows, requirements] = await Promise.all([db.select().from(tasksTable).where(and(eq(tasksTable.projectId, project.id), eq(tasksTable.userId, userId))), db.select().from(projectRequirementsTable).where(eq(projectRequirementsTable.projectId, project.id))]);
  const completed = taskRows.filter((task) => task.status === "completed").length;
  const requirementsDone = requirements.filter((item) => item.completed).length;
  const denominator = taskRows.length + requirements.length;
  return { ...project, taskCount: taskRows.length, completedTaskCount: completed, progress: denominator ? Math.round((completed + requirementsDone) / denominator * 100) : 0, requirements };
}

router.get("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, req.user.id)).orderBy(projectsTable.createdAt);
  res.json(await Promise.all(projects.map((project) => enriched(project, req.user.id))));
});

router.post("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = projectInput(req.body); if (!input.name) { res.status(400).json({ error: "Project name is required." }); return; }
  const [project] = await db.insert(projectsTable).values({ ...input, name: input.name, userId: req.user.id }).returning();
  res.status(201).json(await enriched(project, req.user.id));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [project] = await db.update(projectsTable).set(projectInput(req.body, true)).where(and(eq(projectsTable.id, Number(req.params.id)), eq(projectsTable.userId, req.user.id))).returning();
  if (!project) { res.status(404).json({ error: "Project not found." }); return; } res.json(await enriched(project, req.user.id));
});

router.post("/projects/:id/requirements", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id); const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, req.user.id)));
  if (!project || !title) { res.status(400).json({ error: "Valid project and requirement are required." }); return; }
  const kind = req.body?.kind === "milestone" ? "milestone" : "requirement";
  const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate || null : null;
  const [item] = await db.insert(projectRequirementsTable).values({ projectId: id, title, kind, dueDate }).returning(); res.status(201).json(item);
});

router.patch("/projects/:projectId/requirements/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.id, Number(req.params.projectId)), eq(projectsTable.userId, req.user.id)));
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }
  const [item] = await db.update(projectRequirementsTable).set({ completed: Boolean(req.body?.completed) }).where(and(eq(projectRequirementsTable.id, Number(req.params.id)), eq(projectRequirementsTable.projectId, project.id))).returning(); res.json(item);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id); await db.update(tasksTable).set({ projectId: null }).where(and(eq(tasksTable.projectId, id), eq(tasksTable.userId, req.user.id)));
  const [project] = await db.delete(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, req.user.id))).returning();
  if (!project) { res.status(404).json({ error: "Project not found." }); return; } res.sendStatus(204);
});

export default router;
