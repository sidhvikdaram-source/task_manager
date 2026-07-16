import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, userCosmeticsTable, userStatsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

const cosmetics = [
  { id: "starter-bolt", name: "Core Bolt", kind: "avatar", cost: 0, style: "bolt" },
  { id: "orbit-frame", name: "Orbit Frame", kind: "frame", cost: 80, style: "orbit" },
  { id: "signal-ring", name: "Signal Ring", kind: "frame", cost: 150, style: "signal" },
  { id: "ember-bolt", name: "Ember Bolt", kind: "avatar", cost: 220, style: "ember" },
  { id: "prism-core", name: "Prism Core", kind: "avatar", cost: 360, style: "prism" },
] as const;

function findItem(itemId: string) { return cosmetics.find((item) => item.id === itemId); }

router.get("/rewards", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [stats] = await db.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id));
  const owned = await db.select({ itemId: userCosmeticsTable.itemId }).from(userCosmeticsTable).where(eq(userCosmeticsTable.userId, req.user.id));
  const [user] = await db.select({ equippedCosmetic: usersTable.equippedCosmetic, avatarStyle: usersTable.avatarStyle }).from(usersTable).where(eq(usersTable.id, req.user.id));
  res.json({ balance: stats?.totalVp ?? 0, owned: ["starter-bolt", ...owned.map((entry) => entry.itemId)], equipped: user?.equippedCosmetic ?? "starter-bolt", avatarStyle: user?.avatarStyle ?? "bolt", items: cosmetics });
});

router.post("/rewards/:itemId/purchase", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const item = findItem(req.params.itemId);
  if (!item) { res.status(404).json({ error: "Unknown reward." }); return; }
  if (item.cost === 0) { res.status(400).json({ error: "This reward is already available." }); return; }
  try {
    const response = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(userCosmeticsTable).where(and(eq(userCosmeticsTable.userId, req.user.id), eq(userCosmeticsTable.itemId, item.id)));
      if (existing) throw new Error("ALREADY_OWNED");
      const [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id));
      if (!stats || stats.totalVp < item.cost) throw new Error("INSUFFICIENT_VP");
      const [updated] = await tx.update(userStatsTable).set({ totalVp: stats.totalVp - item.cost, updatedAt: new Date() }).where(eq(userStatsTable.id, stats.id)).returning();
      await tx.insert(userCosmeticsTable).values({ userId: req.user.id, itemId: item.id });
      return { balance: updated.totalVp };
    });
    res.status(201).json({ ...response, item });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PURCHASE_FAILED";
    res.status(code === "ALREADY_OWNED" || code === "INSUFFICIENT_VP" ? 400 : 500).json({ error: code === "ALREADY_OWNED" ? "You already own this item." : code === "INSUFFICIENT_VP" ? "Not enough VP for that item." : "Could not complete purchase." });
  }
});

router.post("/rewards/:itemId/equip", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const item = findItem(req.params.itemId);
  if (!item) { res.status(404).json({ error: "Unknown reward." }); return; }
  const owned = item.cost === 0 || await db.select().from(userCosmeticsTable).where(and(eq(userCosmeticsTable.userId, req.user.id), eq(userCosmeticsTable.itemId, item.id))).then((rows) => rows.length > 0);
  if (!owned) { res.status(403).json({ error: "Purchase this item before equipping it." }); return; }
  await db.update(usersTable).set({ equippedCosmetic: item.id, avatarStyle: item.style, updatedAt: new Date() }).where(eq(usersTable.id, req.user.id));
  res.json({ equipped: item.id, avatarStyle: item.style });
});

export default router;
