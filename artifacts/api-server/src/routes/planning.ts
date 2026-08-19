import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, focusSessionsTable, projectsTable, subjectsTable, tasksTable, usersTable, userStatsTable, weeklyReviewsTable } from "@workspace/db";
import { scoreTaskRecommendation, type RecommendationEnergy } from "../lib/taskRecommendation";
import { addCalendarDays, calendarDateToUtc, localDateKey, startOfWeekKey } from "../lib/localDate";
import { reconcileRewardChests } from "../lib/rewardChests";
import { awardBpInTransaction, lockEconomyUser } from "../lib/bpEconomy";
import { BP_RULES, VP_RULES } from "../lib/economyConfig";

const router: IRouter = Router();
const defaultSubjects = [
  ["Math", "#2563eb"], ["Science", "#059669"], ["English", "#7c3aed"],
  ["Social Studies", "#b45309"], ["Spanish", "#dc2626"], ["Reading", "#0891b2"],
  ["Band", "#c026d3"], ["Computer Science", "#475569"], ["Other", "#64748b"],
] as const;

async function userDateContext(userId: string) {
  const [user] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  const timezone = user?.timezone ?? "UTC";
  return { timezone, today: localDateKey(new Date(), timezone) };
}

async function ensureSubjects(userId: string) {
  const current = await db.select().from(subjectsTable).where(eq(subjectsTable.userId, userId));
  if (current.length) return current;
  await db
    .insert(subjectsTable)
    .values(defaultSubjects.map(([name, color]) => ({ userId, name, color })))
    .onConflictDoNothing();
  return db.select().from(subjectsTable).where(eq(subjectsTable.userId, userId));
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
  const [existing] = await db.select().from(subjectsTable).where(and(eq(subjectsTable.id, Number(req.params.id)), eq(subjectsTable.userId, req.user.id)));
  if (!existing) { res.status(404).json({ error: "Subject not found." }); return; }
  const [subject] = await db.transaction(async (tx) => {
    const changed = await tx.update(subjectsTable).set(update).where(and(eq(subjectsTable.id, existing.id), eq(subjectsTable.userId, req.user.id))).returning();
    if (update.name && update.name !== existing.name) {
      await Promise.all([
        tx.update(tasksTable).set({ subject: update.name }).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.subject, existing.name))),
        tx.update(projectsTable).set({ subject: update.name }).where(and(eq(projectsTable.userId, req.user.id), eq(projectsTable.subject, existing.name))),
      ]);
    }
    return changed;
  });
  if (!subject) { res.status(404).json({ error: "Subject not found." }); return; } res.json(subject);
});

router.delete("/subjects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [subject] = await db.select().from(subjectsTable).where(and(eq(subjectsTable.id, Number(req.params.id)), eq(subjectsTable.userId, req.user.id)));
  if (!subject) { res.status(404).json({ error: "Subject not found." }); return; }
  await db.transaction(async (tx) => {
    await Promise.all([
      tx.update(tasksTable).set({ subject: "Other" }).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.subject, subject.name))),
      tx.update(projectsTable).set({ subject: "Other" }).where(and(eq(projectsTable.userId, req.user.id), eq(projectsTable.subject, subject.name))),
    ]);
    await tx.delete(subjectsTable).where(and(eq(subjectsTable.id, subject.id), eq(subjectsTable.userId, req.user.id)));
  });
  res.sendStatus(204);
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
  const energy: RecommendationEnergy = ["low","medium","high"].includes(String(req.query.energy)) ? String(req.query.energy) as RecommendationEnergy : "medium";
  const workspaceContext = req.query.workspace === "personal" ? "personal" : "school";
  const { today } = await userDateContext(req.user.id);
  const tasks = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.archived, false), ne(tasksTable.status, "completed"), eq(tasksTable.blocked, false), eq(tasksTable.workspaceContext, workspaceContext)));
  const scored = tasks.map((task) => ({ task, ranking: scoreTaskRecommendation(task, { minutes, energy, today }) }))
    .filter((item) => item.ranking.eligible)
    .sort((a,b) => b.ranking.score - a.ranking.score || a.task.title.localeCompare(b.task.title));
  const best = scored[0];
  if (!best) {
    res.json({
      recommendation: null,
      reason: tasks.length
        ? `No unblocked task can be finished in ${minutes} minutes at ${energy} energy. Add a duration estimate or choose a longer work block.`
        : "Your active task list is clear.",
      fit: null,
    });
    return;
  }
  const dueReason = best.ranking.days < 0 ? "is overdue" : best.ranking.days === 0 ? "is due today" : best.ranking.days === 1 ? "is due tomorrow" : best.task.dueDate ? `is due in ${best.ranking.days} days` : "has no fixed deadline";
  const priorityReason = best.task.priority === "critical" || best.task.priority === "high" ? ` It is ${best.task.priority} priority.` : "";
  const timeReason = best.ranking.canFinish ? `It should fit in about ${best.ranking.duration} minutes.` : `Use the next ${minutes} minutes to make focused progress.`;
  res.json({
    recommendation: best.task,
    reason: `${best.task.title} ${dueReason}.${priorityReason} ${timeReason} It matches ${energy} energy as ${best.ranking.workload}.`,
    fit: {
      requestedMinutes: minutes,
      estimatedMinutes: best.ranking.duration,
      energy,
      workload: best.ranking.workload,
      canFinish: best.ranking.canFinish,
      priority: best.task.priority,
      dueInDays: best.ranking.days,
    },
  });
});

router.get("/weekly-review", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { timezone, today } = await userDateContext(req.user.id);
  const weekStart = startOfWeekKey(today);
  const weekEnd = addCalendarDays(weekStart, 7);
  const nextEnd = addCalendarDays(weekEnd, 7);
  const sessionWindowStart = calendarDateToUtc(addCalendarDays(weekStart, -1));
  const sessionWindowEnd = calendarDateToUtc(addCalendarDays(weekEnd, 1));
  const [tasks, sessions, stats, projects, receipt] = await Promise.all([
    db.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.archived, false))),
    db.select().from(focusSessionsTable).where(and(eq(focusSessionsTable.userId, req.user.id), gte(focusSessionsTable.createdAt, sessionWindowStart), lt(focusSessionsTable.createdAt, sessionWindowEnd))),
    db.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id)).then((rows) => rows[0]),
    db.select().from(projectsTable).where(and(eq(projectsTable.userId, req.user.id), eq(projectsTable.archived, false))),
    db.select().from(weeklyReviewsTable).where(and(eq(weeklyReviewsTable.userId, req.user.id), eq(weeklyReviewsTable.weekStart, weekStart))).then((rows) => rows[0]),
  ]);
  const completed = tasks.filter((task) => task.completedAt && localDateKey(task.completedAt, timezone) >= weekStart && localDateKey(task.completedAt, timezone) < weekEnd);
  const weekSessions = sessions.filter((session) => {
    const key = localDateKey(session.createdAt, timezone);
    return key >= weekStart && key < weekEnd;
  });
  const active = tasks.filter((task) => task.status !== "completed");
  const projectAttention = projects.map((project) => { const related = tasks.filter((task) => task.projectId === project.id); const done = related.filter((task) => task.status === "completed").length; return { ...project, taskCount: related.length, progress: related.length ? Math.round(done / related.length * 100) : 0 }; }).filter((project) => project.progress < 100 && (project.dueDate || project.taskCount > 0));
  res.json({ weekStart, completed, overdue: active.filter((task) => task.dueDate && task.dueDate < today), dueNextWeek: active.filter((task) => task.dueDate && task.dueDate >= weekEnd && task.dueDate < nextEnd), focusMinutes: weekSessions.filter((session) => session.status === "completed").reduce((sum, session) => sum + session.durationMinutes, 0), vpEarned: completed.reduce((sum, task) => sum + task.vpValue, 0) + weekSessions.reduce((sum, session) => sum + (session.vpAwarded ?? 0), 0), streakDays: stats?.streakDays ?? 0, projects: projectAttention, inboxCount: active.filter((task) => !task.organized).length, unfinished: active, completedReview: Boolean(receipt), reviewRewards: { vp: VP_RULES.weeklyReview, bp: BP_RULES.weeklyReview }, review: receipt ?? null });
});

router.post("/weekly-review/complete", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { today } = await userDateContext(req.user.id);
  const weekStart = startOfWeekKey(today); const priorities = Array.isArray(req.body?.topPriorities) ? req.body.topPriorities.filter((value: unknown): value is string => typeof value === "string").slice(0,3) : [];
  const focusGoalMinutes = Math.min(1200, Math.max(0, Number(req.body?.focusGoalMinutes) || 0));
  const award = VP_RULES.weeklyReview;
  const bpAward = BP_RULES.weeklyReview;
  const result = await db.transaction(async (tx) => {
    await lockEconomyUser(tx, req.user.id);
    const [receipt] = await tx.insert(weeklyReviewsTable).values({ userId: req.user.id, weekStart, topPriorities: priorities, focusGoalMinutes, vpAwarded: award, bpAwarded: bpAward }).onConflictDoNothing().returning();
    if (!receipt) return { awarded: 0, bpAwarded: 0, alreadyCompleted: true };
    const [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id));
    if (stats) {
      const progress = stats.tierProgress + award;
      await tx.update(userStatsTable).set({ totalVp: sql`${userStatsTable.totalVp} + ${award}`, lifetimeVp: stats.lifetimeVp + award, tier: stats.tier + Math.floor(progress / VP_RULES.tierSize), tierProgress: progress % VP_RULES.tierSize, updatedAt: new Date() }).where(eq(userStatsTable.id, stats.id));
    } else await tx.insert(userStatsTable).values({ userId: req.user.id, totalVp: award, lifetimeVp: award, tierProgress: award });
    const bpResult = await awardBpInTransaction(tx, req.user.id, bpAward, `weekly-review:${weekStart}`, "Weekly review completed");
    return { awarded: award, bpAwarded: bpResult.awarded, alreadyCompleted: false };
  });
  await reconcileRewardChests(req.user.id).catch((error) =>
    req.log?.warn({ err: error }, "Reward chest reconciliation deferred"),
  );
  res.json(result);
});

export default router;
