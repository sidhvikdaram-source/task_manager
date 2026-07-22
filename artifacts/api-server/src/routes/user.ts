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
      socialEnabled: usersTable.socialEnabled,
      timezone: usersTable.timezone,
      calendarView: usersTable.calendarView,
      completionSoundEnabled: usersTable.completionSoundEnabled,
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
  if (typeof req.body?.socialEnabled === "boolean")
    update.socialEnabled = req.body.socialEnabled;
  if (["month", "week", "day", "agenda"].includes(req.body?.calendarView))
    update.calendarView = req.body.calendarView;
  if (typeof req.body?.completionSoundEnabled === "boolean")
    update.completionSoundEnabled = req.body.completionSoundEnabled;
  if (typeof req.body?.timezone === "string") {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: req.body.timezone }).format();
      update.timezone = req.body.timezone;
    } catch {
      res.status(400).json({ error: "Invalid timezone" });
      return;
    }
  }
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
      socialEnabled: usersTable.socialEnabled,
      timezone: usersTable.timezone,
      calendarView: usersTable.calendarView,
      completionSoundEnabled: usersTable.completionSoundEnabled,
    });
  res.json(user);
});

router.patch("/user/profile", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const profileImageUrl = req.body?.profileImageUrl;
  if (
    profileImageUrl !== null &&
    (typeof profileImageUrl !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,/i.test(profileImageUrl) ||
      profileImageUrl.length > 700_000)
  ) {
    res.status(400).json({ error: "Use a PNG, JPEG, or WebP image under 500 KB." });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ profileImageUrl, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id))
    .returning({ profileImageUrl: usersTable.profileImageUrl });
  res.json(user);
});

export default router;
