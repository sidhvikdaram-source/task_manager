import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, dailyHabitsTable, dailyHabitCompletionsTable } from "@workspace/db";
import { CreateDailyHabitBody, DeleteDailyHabitParams, ToggleDailyHabitParams } from "@workspace/api-zod";

const router: IRouter = Router();

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/daily-habits", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const habits = await db
    .select()
    .from(dailyHabitsTable)
    .where(eq(dailyHabitsTable.userId, userId))
    .orderBy(dailyHabitsTable.sortOrder, dailyHabitsTable.createdAt);

  if (habits.length === 0) { res.json([]); return; }

  const today = todayDate();
  const completions = await db
    .select()
    .from(dailyHabitCompletionsTable)
    .where(and(
      inArray(dailyHabitCompletionsTable.habitId, habits.map((h) => h.id)),
      eq(dailyHabitCompletionsTable.completedDate, today),
    ));

  const completedIds = new Set(completions.map((c) => c.habitId));
  res.json(habits.map((h) => ({ ...h, completedToday: completedIds.has(h.id) })));
});

router.post("/daily-habits", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const parsed = CreateDailyHabitBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select().from(dailyHabitsTable).where(eq(dailyHabitsTable.userId, userId));
  const [habit] = await db
    .insert(dailyHabitsTable)
    .values({ title: parsed.data.title, userId, sortOrder: existing.length })
    .returning();

  res.status(201).json({ ...habit, completedToday: false });
});

router.post("/daily-habits/:habitId/toggle", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const params = ToggleDailyHabitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const today = todayDate();
  const habitId = params.data.habitId;

  const [habit] = await db.select().from(dailyHabitsTable).where(
    and(eq(dailyHabitsTable.id, habitId), eq(dailyHabitsTable.userId, userId))
  );
  if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }

  const [existing] = await db
    .select()
    .from(dailyHabitCompletionsTable)
    .where(and(eq(dailyHabitCompletionsTable.habitId, habitId), eq(dailyHabitCompletionsTable.completedDate, today)));

  if (existing) {
    await db.delete(dailyHabitCompletionsTable).where(eq(dailyHabitCompletionsTable.id, existing.id));
    res.json({ completedToday: false });
  } else {
    await db.insert(dailyHabitCompletionsTable).values({ habitId, completedDate: today });
    res.json({ completedToday: true });
  }
});

router.delete("/daily-habits/:habitId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const params = DeleteDailyHabitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [habit] = await db
    .delete(dailyHabitsTable)
    .where(and(eq(dailyHabitsTable.id, params.data.habitId), eq(dailyHabitsTable.userId, userId)))
    .returning();

  if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }
  res.sendStatus(204);
});

export default router;
