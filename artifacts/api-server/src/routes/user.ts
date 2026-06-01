import { Router, type IRouter } from "express";
import { db, userStatsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/user/stats", async (_req, res): Promise<void> => {
  let [stats] = await db.select().from(userStatsTable).limit(1);
  if (!stats) {
    const [newStats] = await db.insert(userStatsTable).values({}).returning();
    stats = newStats;
  }
  res.json({
    totalVp: stats.totalVp,
    tier: stats.tier,
    tierProgress: stats.tierProgress,
    streakDays: stats.streakDays,
    multiplier: stats.multiplier,
    tasksCompleted: stats.tasksCompleted,
    focusMinutes: stats.focusMinutes,
  });
});

export default router;
