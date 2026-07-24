import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

async function getAdminState(userId: string) {
  const [user] = await db
    .select({
      isAdmin: usersTable.isAdmin,
      adminModeEnabled: usersTable.adminModeEnabled,
      adminChestCount: usersTable.adminChestCount,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user;
}

router.get("/admin", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const state = await getAdminState(req.user.id);
  if (!state) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(state);
});

router.patch("/admin/mode", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  const state = await getAdminState(req.user.id);
  if (!state?.isAdmin) {
    res.status(403).json({ error: "Admin sandbox is not available for this account." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      adminModeEnabled: req.body.enabled,
      ...(req.body.enabled
        ? {}
        : { adminLoadout: {}, adminChestCount: 0 }),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.user.id))
    .returning({
      isAdmin: usersTable.isAdmin,
      adminModeEnabled: usersTable.adminModeEnabled,
      adminChestCount: usersTable.adminChestCount,
    });
  res.json(updated);
});

router.post("/admin/chests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const state = await getAdminState(req.user.id);
  if (!state?.isAdmin || !state.adminModeEnabled) {
    res.status(403).json({ error: "Turn on Admin sandbox before generating a test chest." });
    return;
  }
  if (state.adminChestCount >= 1) {
    res.status(400).json({ error: "Open your current test chest before generating another." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      adminChestCount: sql`${usersTable.adminChestCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.user.id))
    .returning({ adminChestCount: usersTable.adminChestCount });
  res.status(201).json(updated);
});

export default router;
