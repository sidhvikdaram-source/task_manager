import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, userStatsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/user/stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user.id;

  let [stats] = await db
    .select()
    .from(userStatsTable)
    .where(eq(userStatsTable.userId, userId));
  if (!stats) {
    const [newStats] = await db
      .insert(userStatsTable)
      .values({ userId })
      .returning();
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

router.get("/user/preferences", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db
    .select({
      mainGoal: usersTable.mainGoal,
      onboardingCompleted: usersTable.onboardingCompleted,
      advancedFeaturesEnabled: usersTable.advancedFeaturesEnabled,
      tutorialCompleted: usersTable.tutorialCompleted,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

router.patch("/user/preferences", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const update: Partial<typeof usersTable.$inferInsert> = {};
  if (["school", "habits", "projects"].includes(req.body?.mainGoal))
    update.mainGoal = req.body.mainGoal;
  if (typeof req.body?.onboardingCompleted === "boolean")
    update.onboardingCompleted = req.body.onboardingCompleted;
  if (typeof req.body?.advancedFeaturesEnabled === "boolean")
    update.advancedFeaturesEnabled = req.body.advancedFeaturesEnabled;
  if (typeof req.body?.tutorialCompleted === "boolean")
    update.tutorialCompleted = req.body.tutorialCompleted;
  if (!Object.keys(update).length) {
    res.status(400).json({ error: "No supported preferences were provided" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id))
    .returning({
      mainGoal: usersTable.mainGoal,
      onboardingCompleted: usersTable.onboardingCompleted,
      advancedFeaturesEnabled: usersTable.advancedFeaturesEnabled,
      tutorialCompleted: usersTable.tutorialCompleted,
    });
  res.json(user);
});

export default router;
