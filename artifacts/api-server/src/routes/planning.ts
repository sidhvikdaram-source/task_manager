import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, focusSessionsTable, projectsTable, subjectsTable, tasksTable, userStatsTable, weeklyReviewsTable } from "@workspace/db";

const router: IRouter = Router();
const defaultSubjects = [
  ["Math", "#2563eb"], ["Science", "#059669"], ["English", "#7c3aed"],
  ["Social Studies", "#b45309"], ["Spanish", "#dc2626"], ["Reading", "#0891b2"],
  ["Band", "#c026d3"], ["Computer Science", "#475569"], ["Other", "#64748b"],
] as const;

function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function startOfWeek() { const date = new Date(); date.setUTCHours(0,0,0,0); const day = date.getUTCDay(); date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1)); return date; }
function addDays(date: Date, days: number) { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }

async function ensureSubjects(userId: string) {
  const current = await db.select().from(subjectsTable).where(eq(subjectsTable.userId, userId));
  if (current.length) return current;
  return db.insert(subjectsTable).values(defaultSubjects.map(([name, color]) => ({ userId, name, color }))).returning();
}

router.get("/subjects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json((await ensureSubjects(req.user.id)).filter((subject) => !subject.archived));
});

router.post("/subjects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 40) : "";
  const color = typeof req.body?.color === "string" && /^#[0-9a-f]{6}$/i.test(req.body.color) ? req.body.color : "#2563eb";
  if (!name) { res.status(400).json({ error: "Subject name is required." }); return; }
  try { const [subject] = await db.insert(subjectsTable).values({ userId: req.user.id, name, color }).returning(); res.status(201).json(subject); }
  catch { res.status(409).json({ error: "That subject already exists." }); }
});

router.patch("/subjects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const update: { name?: string; color?: string; archived?: boolean } = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) update.name = req.body.name.trim().slice(0, 40);
  if (typeof req.body?.color === "string" && /^#[0-9a-f]{6}$/i.test(req.body.color)) update.color = req.body.color;
  if (typeof req.body?.archived === "boolean") update.archived = req.body.archived;
  const [subject] = await db.update(subjectsTable).set(update).where(and(eq(subjectsTable.id, Number(req.params.id)), eq(subjectsTable.userId, req.user.id))).returning();
  if (!subject) { res.status(404).json({ error: "Subject not found." }); return; } res.json(subject);
});

router.post("/inbox/capture", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 160) : "";
  if (!title) { res.status(400).json({ error: "Task title is required." }); return; }
  const priority = ["critical","high","medium","low"].includes(req.body?.priority) ? req.body.priority : "medium";
  const [task] = await db.insert(tasksTable).values({ userId: req.user.id, title, dueDate: typeof req.body?.dueDate === "string" ? req.body.dueDate : null, calendarDate: typeof req.body?.dueDate === "string" ? req.body.dueDate : null, subject: typeof req.body?.subject === "string" ? req.body.subject : null, priority, organized: false }).returning();
  res.status(201).json({ ...task, checklistCount: 0, checklistCompleted: 0 });
});

router.patch("/inbox/:id/organize", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [task] = await db.update(tasksTable).set({ organized: true }).where(and(eq(tasksTable.id, Number(req.params.id)), eq(tasksTable.userId, req.user.id))).returning();
  if (!task) { res.status(404).json({ error: "Task not found." }); return; } res.json(task);
});

router.get("/recommendations/next", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const minutes = Math.min(60, Math.max(10, Number(req.query.minutes) || 30));
  const energy = ["low","medium","high"].includes(String(req.query.energy)) ? String(req.query.energy) : "medium";
  const today = dateOnly(new Date());
  const tasks = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed"), eq(tasksTable.blocked, false)));
  const candidates = tasks.filter((task) => (task.estimatedMinutes ?? 30) <= minutes);
  const scored = candidates.map((task) => {
    const duration = task.estimatedMinutes ?? 30;
    const days = task.dueDate ? Math.ceil((new Date(`${task.dueDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000) : 30;
    const urgency = days < 0 ? 50 : days === 0 ? 42 : days === 1 ? 35 : Math.max(0, 20 - days * 2);
    const priority = task.priority === "critical" ? 32 : task.priority === "high" ? 22 : task.priority === "medium" ? 12 : 4;
    const targetDifficulty = energy === "low" ? 1 : energy === "high" ? 3 : 2;
    const energyFit = 16 - Math.abs(task.difficulty - targetDifficulty) * 7;
    const timeFit = 12 - Math.abs(minutes - duration) / 5;
    return { task, score: urgency + priority + energyFit + timeFit, duration, days };
  }).sort((a,b) => b.score - a.score);
  const best = scored[0];
  if (!best) { res.json({ recommendation: null, reason: tasks.length ? `No unblocked task fits within ${minutes} minutes.` : "Your active task list is clear." }); return; }
  const dueReason = best.days < 0 ? "is overdue" : best.days === 0 ? "is due today" : best.days === 1 ? "is due tomorrow" : best.task.dueDate ? `is due in ${best.days} days` : "has no fixed deadline";
  res.json({ recommendation: best.task, reason: `${best.task.title} ${dueReason}, should take about ${best.duration} minutes, and fits ${energy} energy.` });
});

router.get("/weekly-review", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const weekStart = startOfWeek(); const weekEnd = addDays(weekStart, 7); const nextEnd = addDays(weekEnd, 7); const today = dateOnly(new Date());
  const [tasks, sessions, stats, projects, receipt] = await Promise.all([
    db.select().from(tasksTable).where(eq(tasksTable.userId, req.user.id)),
    db.select().from(focusSessionsTable).where(and(eq(focusSessionsTable.userId, req.user.id), gte(focusSessionsTable.createdAt, weekStart), lt(focusSessionsTable.createdAt, weekEnd))),
    db.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id)).then((rows) => rows[0]),
    db.select().from(projectsTable).where(and(eq(projectsTable.userId, req.user.id), eq(projectsTable.archived, false))),
    db.select().from(weeklyReviewsTable).where(and(eq(weeklyReviewsTable.userId, req.user.id), eq(weeklyReviewsTable.weekStart, dateOnly(weekStart)))).then((rows) => rows[0]),
  ]);
  const completed = tasks.filter((task) => task.completedAt && task.completedAt >= weekStart && task.completedAt < weekEnd);
  const active = tasks.filter((task) => task.status !== "completed");
  const projectAttention = projects.map((project) => { const related = tasks.filter((task) => task.projectId === project.id); const done = related.filter((task) => task.status === "completed").length; return { ...project, taskCount: related.length, progress: related.length ? Math.round(done / related.length * 100) : 0 }; }).filter((project) => project.progress < 100 && (project.dueDate || project.taskCount > 0));
  res.json({ weekStart: dateOnly(weekStart), completed, overdue: active.filter((task) => task.dueDate && task.dueDate < today), dueNextWeek: active.filter((task) => task.dueDate && task.dueDate >= dateOnly(weekEnd) && task.dueDate < dateOnly(nextEnd)), focusMinutes: sessions.filter((session) => session.status === "completed").reduce((sum, session) => sum + session.durationMinutes, 0), vpEarned: completed.reduce((sum, task) => sum + task.vpValue, 0) + sessions.reduce((sum, session) => sum + (session.vpAwarded ?? 0), 0), streakDays: stats?.streakDays ?? 0, projects: projectAttention, inboxCount: active.filter((task) => !task.organized).length, unfinished: active, completedReview: Boolean(receipt), review: receipt ?? null });
});

router.post("/weekly-review/complete", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const weekStart = dateOnly(startOfWeek()); const priorities = Array.isArray(req.body?.topPriorities) ? req.body.topPriorities.filter((value: unknown): value is string => typeof value === "string").slice(0,3) : [];
  const focusGoalMinutes = Math.min(1200, Math.max(0, Number(req.body?.focusGoalMinutes) || 0));
  const award = 40;
  const result = await db.transaction(async (tx) => {
    const [receipt] = await tx.insert(weeklyReviewsTable).values({ userId: req.user.id, weekStart, topPriorities: priorities, focusGoalMinutes, vpAwarded: award }).onConflictDoNothing().returning();
    if (!receipt) return { awarded: 0, alreadyCompleted: true };
    const [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id));
    if (stats) await tx.update(userStatsTable).set({ totalVp: sql`${userStatsTable.totalVp} + ${award}`, tierProgress: (stats.tierProgress + award) % 100, updatedAt: new Date() }).where(eq(userStatsTable.id, stats.id));
    else await tx.insert(userStatsTable).values({ userId: req.user.id, totalVp: award, tierProgress: award });
    return { awarded: award, alreadyCompleted: false };
  });
  res.json(result);
});

export default router;
