import { and, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, userCosmeticsTable, userStatsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

const cosmetics = [
  { id: "starter-bolt", name: "Core Bolt", kind: "avatar", cost: 0, style: "bolt" },
  { id: "orbit-frame", name: "Orbit Frame", kind: "frame", cost: 80, style: "orbit" },
  { id: "signal-ring", name: "Signal Ring", kind: "frame", cost: 150, style: "signal" },
  { id: "ember-bolt", name: "Ember Bolt", kind: "avatar", cost: 220, style: "ember" },
  { id: "prism-core", name: "Prism Core", kind: "avatar", cost: 360, style: "prism" },
  { id: "mono-core", name: "Mono Core", kind: "avatar", cost: 120, style: "mono" },
  { id: "aurora-core", name: "Aurora Core", kind: "avatar", cost: 480, style: "aurora" },
  { id: "precision-frame", name: "Precision Frame", kind: "frame", cost: 260, style: "precision" },
  { id: "nova-frame", name: "Nova Frame", kind: "frame", cost: 420, style: "nova" },
  { id: "pixel-spark", name: "Pixel Spark", kind: "pet", cost: 180, style: "spark" },
  { id: "cloud-bit", name: "Cloud Bit", kind: "pet", cost: 300, style: "cloud" },
  { id: "focus-cube", name: "Focus Cube", kind: "pet", cost: 520, style: "cube" },
] as const;

function findItem(itemId: string) { return cosmetics.find((item) => item.id === itemId); }

router.get("/rewards", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [stats] = await db.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id));
  const owned = await db.select({ itemId: userCosmeticsTable.itemId }).from(userCosmeticsTable).where(eq(userCosmeticsTable.userId, req.user.id));
  const [user] = await db.select({ equippedCosmetic: usersTable.equippedCosmetic, equippedFrame: usersTable.equippedFrame, equippedPet: usersTable.equippedPet, avatarStyle: usersTable.avatarStyle }).from(usersTable).where(eq(usersTable.id, req.user.id));
  res.json({ balance: stats?.totalVp ?? 0, owned: ["starter-bolt", ...owned.map((entry) => entry.itemId)], equipped: { avatar: user?.equippedCosmetic ?? "starter-bolt", frame: user?.equippedFrame ?? "none", pet: user?.equippedPet ?? "none" }, avatarStyle: user?.avatarStyle ?? "bolt", items: cosmetics });
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
      if (!stats) throw new Error("INSUFFICIENT_VP");
      const [updated] = await tx.update(userStatsTable).set({ totalVp: sql`${userStatsTable.totalVp} - ${item.cost}`, updatedAt: new Date() }).where(and(eq(userStatsTable.id, stats.id), gte(userStatsTable.totalVp, item.cost))).returning();
      if (!updated) throw new Error("INSUFFICIENT_VP");
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
  const update = item.kind === "avatar" ? { equippedCosmetic: item.id, avatarStyle: item.style } : item.kind === "frame" ? { equippedFrame: item.id } : { equippedPet: item.id };
  await db.update(usersTable).set({ ...update, updatedAt: new Date() }).where(eq(usersTable.id, req.user.id));
  res.json({ equipped: item.id, avatarStyle: item.style });
});

export default router;
