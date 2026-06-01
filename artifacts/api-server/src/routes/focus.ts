import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, focusSessionsTable, userStatsTable } from "@workspace/db";
import {
  CreateFocusSessionBody,
  CompleteFocusSessionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/focus-sessions", async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(focusSessionsTable)
    .orderBy(desc(focusSessionsTable.createdAt))
    .limit(50);
  res.json(sessions);
});

router.post("/focus-sessions", async (req, res): Promise<void> => {
  const parsed = CreateFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.insert(focusSessionsTable).values({
    durationMinutes: parsed.data.durationMinutes,
    status: "active",
    startedAt: new Date(),
  }).returning();

  res.status(201).json(session);
});

router.post("/focus-sessions/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(focusSessionsTable).where(eq(focusSessionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }

  // VP award: 1 VP per minute, with multiplier, bonus for long sessions
  const [stats] = await db.select().from(userStatsTable).limit(1);
  const multiplier = stats?.multiplier ?? 1.0;
  const baseVp = existing.durationMinutes;
  const bonus = existing.durationMinutes >= 90 ? 20 : existing.durationMinutes >= 50 ? 10 : 0;
  const vpAwarded = Math.round((baseVp + bonus) * multiplier);

  const [session] = await db
    .update(focusSessionsTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      vpAwarded,
    })
    .where(eq(focusSessionsTable.id, params.data.id))
    .returning();

  // Update user stats
  if (stats) {
    const newTotal = stats.totalVp + vpAwarded;
    const newTierProgress = stats.tierProgress + vpAwarded;
    const tierUps = Math.floor(newTierProgress / 100);

    // Completing a focus session boosts multiplier
    let newMultiplier = stats.multiplier;
    if (existing.durationMinutes >= 50) {
      newMultiplier = Math.min(2.0, (stats.multiplier ?? 1.0) + 0.1);
    }

    await db.update(userStatsTable).set({
      totalVp: newTotal,
      tier: stats.tier + tierUps,
      tierProgress: newTierProgress % 100,
      focusMinutes: stats.focusMinutes + existing.durationMinutes,
      multiplier: newMultiplier,
      updatedAt: new Date(),
    }).where(eq(userStatsTable.id, stats.id));
  }

  res.json(session);
});

export default router;
