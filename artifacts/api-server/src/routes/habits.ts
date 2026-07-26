import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, dailyHabitsTable, dailyHabitCompletionsTable, usersTable, userStatsTable } from "@workspace/db";
import { localDateKey } from "../lib/localDate";
import { applyForecastHabitCompletion } from "../lib/forecastRewards";

const router: IRouter = Router();
const allowedIcons = new Set(["target", "book", "brain", "heart", "run", "water", "code", "music"]);

async function todayForUser(userId: string) {
  const [user] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  return localDateKey(new Date(), user?.timezone);
}

function habitInput(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const title = typeof value.title === "string" ? value.title.trim().slice(0, 100) : "";
  const days = Array.isArray(value.daysOfWeek) ? value.daysOfWeek.filter((day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6) : [0,1,2,3,4,5,6];
  const reminderTime = typeof value.reminderTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.reminderTime) ? value.reminderTime : null;
  const icon = typeof value.icon === "string" && allowedIcons.has(value.icon) ? value.icon : "target";
  const vpReward = Math.min(25, Math.max(1, Number(value.vpReward) || 5));
  return { title, daysOfWeek: [...new Set(days)].sort().join(","), reminderTime, icon, vpReward };
}

router.get("/daily-habits", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const habits = await db.select().from(dailyHabitsTable).where(eq(dailyHabitsTable.userId, req.user.id)).orderBy(dailyHabitsTable.sortOrder, dailyHabitsTable.createdAt);
  if (!habits.length) { res.json([]); return; }
  const today = await todayForUser(req.user.id);
  const completions = await db.select().from(dailyHabitCompletionsTable).where(inArray(dailyHabitCompletionsTable.habitId, habits.map((habit) => habit.id))).orderBy(desc(dailyHabitCompletionsTable.completedDate));
  res.json(habits.map((habit) => ({ ...habit, daysOfWeek: habit.daysOfWeek.split(",").map(Number), completedToday: completions.some((entry) => entry.habitId === habit.id && entry.completedDate === today && entry.completed), recentCompletions: completions.filter((entry) => entry.habitId === habit.id && entry.completed).slice(0, 30).map((entry) => entry.completedDate) })));
});

router.post("/daily-habits", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = habitInput(req.body); if (!input.title || !input.daysOfWeek) { res.status(400).json({ error: "Add a title and at least one day." }); return; }
  const existing = await db.select({ id: dailyHabitsTable.id }).from(dailyHabitsTable).where(eq(dailyHabitsTable.userId, req.user.id));
  const [habit] = await db.insert(dailyHabitsTable).values({ ...input, userId: req.user.id, sortOrder: existing.length }).returning();
  res.status(201).json({ ...habit, daysOfWeek: habit.daysOfWeek.split(",").map(Number), completedToday: false, recentCompletions: [] });
});

router.patch("/daily-habits/:habitId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.habitId); const status = req.body?.status;
  if (!["active", "paused", "archived"].includes(status)) { res.status(400).json({ error: "Invalid habit status." }); return; }
  const [habit] = await db.update(dailyHabitsTable).set({ status }).where(and(eq(dailyHabitsTable.id, id), eq(dailyHabitsTable.userId, req.user.id))).returning();
  if (!habit) { res.status(404).json({ error: "Habit not found." }); return; } res.json(habit);
});

router.post("/daily-habits/:habitId/toggle", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.habitId); const [habit] = await db.select().from(dailyHabitsTable).where(and(eq(dailyHabitsTable.id, id), eq(dailyHabitsTable.userId, req.user.id)));
  if (!habit || habit.status !== "active") { res.status(404).json({ error: "Active habit not found." }); return; }
  const today = await todayForUser(req.user.id); const [existing] = await db.select().from(dailyHabitCompletionsTable).where(and(eq(dailyHabitCompletionsTable.habitId, id), eq(dailyHabitCompletionsTable.completedDate, today)));
  if (existing) {
    const completed = !existing.completed; await db.update(dailyHabitCompletionsTable).set({ completed }).where(eq(dailyHabitCompletionsTable.id, existing.id));
    const baseAward = completed && !existing.vpAwarded ? habit.vpReward : 0;
    if (baseAward) { await awardVp(req.user.id, baseAward); await db.update(dailyHabitCompletionsTable).set({ vpAwarded: true }).where(eq(dailyHabitCompletionsTable.id, existing.id)); }
    const forecastReward = completed ? await applyForecastHabitCompletion(req.user.id, habit.id) : null;
    res.json({ completedToday: completed, vpAwarded: baseAward + (forecastReward?.bonusNp ?? 0), forecastReward }); return;
  }
  await db.insert(dailyHabitCompletionsTable).values({ habitId: id, completedDate: today, completed: true, vpAwarded: true }); await awardVp(req.user.id, habit.vpReward);
  const forecastReward = await applyForecastHabitCompletion(req.user.id, habit.id);
  res.json({ completedToday: true, vpAwarded: habit.vpReward + forecastReward.bonusNp, forecastReward });
});

async function awardVp(userId: string, amount: number) {
  const [stats] = await db.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
  if (stats) {
    const progress = stats.tierProgress + amount;
    await db.update(userStatsTable).set({ totalVp: stats.totalVp + amount, lifetimeVp: stats.lifetimeVp + amount, tier: stats.tier + Math.floor(progress / 100), tierProgress: progress % 100, updatedAt: new Date() }).where(eq(userStatsTable.id, stats.id));
  } else await db.insert(userStatsTable).values({ userId, totalVp: amount, lifetimeVp: amount, tier: 1 + Math.floor(amount / 100), tierProgress: amount % 100 });
}

router.delete("/daily-habits/:habitId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [habit] = await db.delete(dailyHabitsTable).where(and(eq(dailyHabitsTable.id, Number(req.params.habitId)), eq(dailyHabitsTable.userId, req.user.id))).returning();
  if (!habit) { res.status(404).json({ error: "Habit not found." }); return; } res.sendStatus(204);
});

export default router;
