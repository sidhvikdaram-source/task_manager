import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userStatsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/user/stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  let [stats] = await db.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
  if (!stats) {
    const [newStats] = await db.insert(userStatsTable).values({ userId }).returning();
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
