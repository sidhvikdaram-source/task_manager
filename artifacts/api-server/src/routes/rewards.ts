import { randomInt } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  tasksTable,
  userCosmeticsTable,
  userRewardChestsTable,
  userStatsTable,
  usersTable,
} from "@workspace/db";
import { reconcileRewardChests, type ChestRarity } from "../lib/rewardChests";
import { chestRarityUpgraded, rollChestRarity } from "../lib/rewardChestRules";

const router: IRouter = Router();

type RewardKind = "frame" | "pet" | "title" | "completion_effect" | "transition";
type RewardItem = {
  id: string;
  name: string;
  kind: RewardKind;
  cost: number;
  style: string;
  requirement?: string;
  source?: "quest" | "achievement" | "tier" | "chest" | "default";
  chestRarity?: ChestRarity;
};

const storeCollectables: RewardItem[] = [
  { id: "orbit-frame", name: "Orbit Frame", kind: "frame", cost: 80, style: "orbit" },
  { id: "signal-ring", name: "Signal Ring", kind: "frame", cost: 150, style: "signal" },
  { id: "precision-frame", name: "Precision Frame", kind: "frame", cost: 260, style: "precision" },
  { id: "nova-frame", name: "Nova Frame", kind: "frame", cost: 420, style: "nova" },
  { id: "studio-frame", name: "Studio Frame", kind: "frame", cost: 540, style: "studio" },
  { id: "summit-frame", name: "Summit Frame", kind: "frame", cost: 620, style: "summit" },
  { id: "terminal-frame", name: "Terminal Frame", kind: "frame", cost: 700, style: "terminal" },
  { id: "honor-frame", name: "Honor Frame", kind: "frame", cost: 820, style: "honor" },
  { id: "zen-frame", name: "Zen Frame", kind: "frame", cost: 940, style: "zen" },
  { id: "velocity-frame", name: "Velocity Frame", kind: "frame", cost: 1100, style: "velocity" },
  { id: "pixel-spark", name: "Pixel Spark", kind: "pet", cost: 180, style: "spark" },
  { id: "cloud-bit", name: "Cloud Bit", kind: "pet", cost: 300, style: "cloud" },
  { id: "focus-cube", name: "Focus Cube", kind: "pet", cost: 520, style: "cube" },
  { id: "study-bot", name: "Study Bot", kind: "pet", cost: 420, style: "bot" },
  { id: "leafling", name: "Leafling", kind: "pet", cost: 250, style: "leaf" },
  { id: "orbit-orb", name: "Orbit Orb", kind: "pet", cost: 380, style: "orb" },
  { id: "book-bit", name: "Book Bit", kind: "pet", cost: 460, style: "book" },
  { id: "tempo-dot", name: "Tempo Dot", kind: "pet", cost: 560, style: "tempo" },
  { id: "comet", name: "Comet", kind: "pet", cost: 680, style: "comet" },
  { id: "pebble", name: "Pebble", kind: "pet", cost: 760, style: "pebble" },
];

const freeCollectables: RewardItem[] = [
  { id: "clean-confetti", name: "Clean Confetti", kind: "completion_effect", cost: 0, style: "clean-confetti", source: "default" },
  { id: "velocity-slide", name: "Velocity Slide", kind: "transition", cost: 0, style: "velocity-slide", source: "default" },
];

const chestCollectables: RewardItem[] = [
  { id: "nova-pod", name: "Nova Pod", kind: "pet", cost: 0, style: "nova-pod", source: "chest", chestRarity: "common" },
  { id: "aperture-frame", name: "Aperture Frame", kind: "frame", cost: 0, style: "aperture", source: "chest", chestRarity: "common" },
  { id: "clear-intent", name: "Clear Intent", kind: "title", cost: 0, style: "clear-intent", source: "chest", chestRarity: "common" },
  { id: "prism-pop", name: "Prism Pop", kind: "completion_effect", cost: 0, style: "prism-pop", source: "chest", chestRarity: "common" },
  { id: "soft-glide", name: "Soft Glide", kind: "transition", cost: 0, style: "soft-glide", source: "chest", chestRarity: "common" },
  { id: "lumen-bot", name: "Lumen Bot", kind: "pet", cost: 0, style: "lumen-bot", source: "chest", chestRarity: "rare" },
  { id: "orbit-bud", name: "Orbit Bud", kind: "pet", cost: 0, style: "orbit-bud", source: "chest", chestRarity: "rare" },
  { id: "pulse-grid", name: "Pulse Grid", kind: "frame", cost: 0, style: "pulse-grid", source: "chest", chestRarity: "rare" },
  { id: "aurora-edge", name: "Aurora Edge", kind: "frame", cost: 0, style: "aurora-edge", source: "chest", chestRarity: "rare" },
  { id: "deep-work", name: "Deep Work", kind: "title", cost: 0, style: "deep-work", source: "chest", chestRarity: "rare" },
  { id: "week-architect", name: "Week Architect", kind: "title", cost: 0, style: "week-architect", source: "chest", chestRarity: "rare" },
  { id: "signal-rings", name: "Signal Rings", kind: "completion_effect", cost: 0, style: "signal-rings", source: "chest", chestRarity: "rare" },
  { id: "panel-sweep", name: "Panel Sweep", kind: "transition", cost: 0, style: "panel-sweep", source: "chest", chestRarity: "rare" },
  { id: "tempo-kite", name: "Tempo Kite", kind: "pet", cost: 0, style: "tempo-kite", source: "chest", chestRarity: "epic" },
  { id: "carbon-halo", name: "Carbon Halo", kind: "frame", cost: 0, style: "carbon-halo", source: "chest", chestRarity: "epic" },
  { id: "steady-hand", name: "Steady Hand", kind: "title", cost: 0, style: "steady-hand", source: "chest", chestRarity: "epic" },
  { id: "paper-stream", name: "Paper Stream", kind: "completion_effect", cost: 0, style: "paper-stream", source: "chest", chestRarity: "epic" },
  { id: "quick-stack", name: "Quick Stack", kind: "transition", cost: 0, style: "quick-stack", source: "chest", chestRarity: "epic" },
];

const collectables = [...storeCollectables, ...freeCollectables, ...chestCollectables];

type UnlockContext = {
  tier: number;
  earnedVp: number;
  tasksCompleted: number;
  focusMinutes: number;
  momentum: number;
  completed: Array<typeof tasksTable.$inferSelect>;
  activeCount: number;
};

type TitleDefinition = RewardItem & { test: (context: UnlockContext) => boolean };
const title = (
  id: string,
  name: string,
  requirement: string,
  source: NonNullable<RewardItem["source"]>,
  test: TitleDefinition["test"],
): TitleDefinition => ({ id, name, kind: "title", cost: 0, style: id, requirement, source, test });

const hasCompleted = (context: UnlockContext, pattern: RegExp, count = 1) =>
  context.completed.filter((task) => pattern.test(`${task.title} ${task.subject ?? ""}`)).length >= count;
const lateTasks = (context: UnlockContext, start: number, end: number) =>
  context.completed.filter((task) => {
    const hour = task.completedAt?.getHours();
    return hour !== undefined && (start <= end ? hour >= start && hour <= end : hour >= start || hour <= end);
  }).length;

const titles: TitleDefinition[] = [
  title("getting-started", "Getting Started", "Complete your first task", "achievement", (c) => c.tasksCompleted >= 1),
  title("on-a-roll", "On a Roll", "Build 3 Momentum days", "achievement", (c) => c.momentum >= 3),
  title("consistent", "Consistent", "Build 7 Momentum days", "achievement", (c) => c.momentum >= 7),
  title("daily-driver", "Daily Driver", "Build 14 Momentum days", "achievement", (c) => c.momentum >= 14),
  title("unstoppable", "Unstoppable", "Build 30 Momentum days", "achievement", (c) => c.momentum >= 30),
  title("night-grinder", "Night Grinder", "Complete a task after 10 PM", "quest", (c) => lateTasks(c, 22, 4) >= 1),
  title("3-am-strategist", "3 AM Strategist", "Complete a task during the 3 AM hour", "quest", (c) => lateTasks(c, 3, 3) >= 1),
  title("submitting-1159", "Submitting at 11:59 PM", "Finish a task between 11:55 PM and midnight", "quest", (c) => c.completed.some((task) => task.completedAt?.getHours() === 23 && (task.completedAt?.getMinutes() ?? 0) >= 55)),
  title("driven-by-panic", "Driven By Panic", "Complete 5 overdue tasks", "achievement", (c) => c.completed.filter((task) => task.dueDate && task.completedAt && task.completedAt > new Date(`${task.dueDate}T23:59:59`)).length >= 5),
  title("caffeine-fueled", "Caffeine Fueled", "Focus for 300 minutes", "achievement", (c) => c.focusMinutes >= 300),
  title("dark-mode-main", "Dark Mode Main", "Reach Tier 5", "tier", (c) => c.tier >= 5),
  title("midnight-coder", "Midnight Coder", "Finish coding work late at night", "quest", (c) => lateTasks({ ...c, completed: c.completed.filter((task) => /\b(code|coding|program|debug|api|frontend|backend)\b/i.test(task.title)) }, 22, 4) >= 1),
  title("sleep-deprived", "Sleep Deprived", "Complete 5 late-night tasks", "achievement", (c) => lateTasks(c, 22, 4) >= 5),
  title("academic-comeback", "Academic Comeback", "Complete 10 school tasks", "achievement", (c) => c.completed.filter((task) => Boolean(task.subject)).length >= 10),
  title("procrastinator", "Procrastinator", "Complete 10 overdue tasks", "achievement", (c) => c.completed.filter((task) => task.dueDate && task.completedAt && task.completedAt > new Date(`${task.dueDate}T23:59:59`)).length >= 10),
  title("surviving", "Surviving", "Complete 10 tasks", "achievement", (c) => c.tasksCompleted >= 10),
  title("lock-in-era", "Lock In Era", "Focus for 120 minutes", "achievement", (c) => c.focusMinutes >= 120),
  title("canvas-clear", "Canvas Clear", "Complete 20 Canvas tasks", "achievement", (c) => c.completed.filter((task) => task.externalSource === "canvas").length >= 20),
  title("gg-wp", "GG WP", "Complete 25 tasks", "achievement", (c) => c.tasksCompleted >= 25),
  title("trust-the-process", "Trust The Process", "Earn 500 lifetime VP", "tier", (c) => c.earnedVp >= 500),
  title("clutch-player", "Clutch Player", "Complete 5 critical tasks", "quest", (c) => c.completed.filter((task) => task.priority === "critical").length >= 5),
  title("locked-in", "Locked In", "Focus for 600 minutes", "achievement", (c) => c.focusMinutes >= 600),
  title("in-the-zone", "In The Zone", "Focus for 1,200 minutes", "achievement", (c) => c.focusMinutes >= 1200),
  title("dialed-in", "Dialed In", "Focus for 2,400 minutes", "achievement", (c) => c.focusMinutes >= 2400),
  title("zero-backlog", "Zero Backlog", "Clear every active task after completing 10", "quest", (c) => c.tasksCompleted >= 10 && c.activeCount === 0),
  title("top-tier", "Top Tier", "Reach Tier 10", "tier", (c) => c.tier >= 10),
  title("unbothered", "Unbothered", "Earn 1,500 lifetime VP", "tier", (c) => c.earnedVp >= 1500),
  title("built-different", "Built Different", "Complete 100 tasks", "achievement", (c) => c.tasksCompleted >= 100),
  title("overachiever", "Overachiever", "Complete 150 tasks", "achievement", (c) => c.tasksCompleted >= 150),
  title("backend-main", "Backend Main", "Complete 5 backend tasks", "quest", (c) => hasCompleted(c, /\b(backend|server|database|api)\b/i, 5)),
  title("full-stack", "Full Stack", "Complete 8 frontend or backend tasks", "quest", (c) => hasCompleted(c, /\b(frontend|backend|full stack|database|api|react)\b/i, 8)),
  title("bug-fixer", "Bug Fixer", "Complete 5 debugging tasks", "quest", (c) => hasCompleted(c, /\b(bug|debug|fix|repair)\b/i, 5)),
  title("git-push", "Git Push", "Complete 3 Git or deployment tasks", "quest", (c) => hasCompleted(c, /\b(git|push|deploy|release)\b/i, 3)),
  title("terminal-velocity", "Terminal Velocity", "Reach Tier 20", "tier", (c) => c.tier >= 20),
  title("calc-ready", "Calc Ready", "Complete 10 math tasks", "achievement", (c) => hasCompleted(c, /\b(math|algebra|geometry|calculus|trig)\b/i, 10)),
  title("4-0-grind", "4.0 Grind", "Complete 50 school tasks", "achievement", (c) => c.completed.filter((task) => Boolean(task.subject)).length >= 50),
  title("mathletes", "Mathletes", "Complete 25 math tasks", "achievement", (c) => hasCompleted(c, /\b(math|algebra|geometry|calculus|trig|amc)\b/i, 25)),
  title("proof-master", "Proof Master", "Complete 50 math tasks", "achievement", (c) => hasCompleted(c, /\b(math|algebra|geometry|calculus|proof|amc)\b/i, 50)),
  title("honor-roll", "Honor Roll", "Reach Tier 8", "tier", (c) => c.tier >= 8),
  title("a-star", "A Star", "Complete 75 tasks", "achievement", (c) => c.tasksCompleted >= 75),
  title("class-rank-1", "Class Rank 1", "Reach Tier 15", "tier", (c) => c.tier >= 15),
  title("inbox-zero", "Inbox Zero", "Clear your backlog after completing 20 tasks", "quest", (c) => c.tasksCompleted >= 20 && c.activeCount === 0),
];

function findItem(itemId: string) {
  return collectables.find((item) => item.id === itemId) ?? titles.find((item) => item.id === itemId);
}

router.get("/rewards", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  await reconcileRewardChests(req.user.id);
  const [stats, ownedRows, user, tasks, chests] = await Promise.all([
    db.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id)).then((rows) => rows[0]),
    db.select({ itemId: userCosmeticsTable.itemId }).from(userCosmeticsTable).where(eq(userCosmeticsTable.userId, req.user.id)),
    db.select({ equippedFrame: usersTable.equippedFrame, equippedPet: usersTable.equippedPet, equippedTitle: usersTable.equippedTitle, equippedCompletionEffect: usersTable.equippedCompletionEffect, equippedTransition: usersTable.equippedTransition, profileImageUrl: usersTable.profileImageUrl }).from(usersTable).where(eq(usersTable.id, req.user.id)).then((rows) => rows[0]),
    db.select().from(tasksTable).where(eq(tasksTable.userId, req.user.id)),
    db.select().from(userRewardChestsTable).where(eq(userRewardChestsTable.userId, req.user.id)).orderBy(desc(userRewardChestsTable.awardedAt)),
  ]);
  const completed = tasks.filter((task) => task.status === "completed");
  const context: UnlockContext = {
    tier: stats?.tier ?? 1,
    earnedVp: stats?.lifetimeVp ?? 0,
    tasksCompleted: stats?.tasksCompleted ?? completed.length,
    focusMinutes: stats?.focusMinutes ?? 0,
    momentum: stats?.streakDays ?? 0,
    completed,
    activeCount: tasks.filter((task) => task.status !== "completed" && !task.archived).length,
  };
  const unlockedTitles = titles.filter((item) => item.test(context));
  const owned = new Set(ownedRows.map((entry) => entry.itemId));
  freeCollectables.forEach((item) => owned.add(item.id));
  const newlyUnlocked = unlockedTitles.filter((item) => !owned.has(item.id));
  if (newlyUnlocked.length) {
    await db.insert(userCosmeticsTable).values(newlyUnlocked.map((item) => ({ userId: req.user!.id, itemId: item.id }))).onConflictDoNothing();
    newlyUnlocked.forEach((item) => owned.add(item.id));
  }
  res.json({
    balance: stats?.totalVp ?? 0,
    earnedVp: context.earnedVp,
    owned: [...owned],
    newlyUnlockedTitles: newlyUnlocked.map((item) => item.name),
    equipped: { frame: user?.equippedFrame ?? "none", pet: user?.equippedPet ?? "none", title: user?.equippedTitle ?? "none", completion_effect: user?.equippedCompletionEffect ?? "clean-confetti", transition: user?.equippedTransition ?? "velocity-slide" },
    profileImageUrl: user?.profileImageUrl ?? null,
    chests,
    unopenedChestCount: chests.filter((chest) => chest.status === "unopened").length,
    items: [...collectables, ...titles.map(({ test: _test, ...item }) => item)],
  });
});

router.post("/rewards/chests/:id/open", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const chestId = Number(req.params.id);
  if (!Number.isInteger(chestId)) { res.status(400).json({ error: "Invalid chest." }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))`);
      const [chest] = await tx.update(userRewardChestsTable).set({ status: "opening" }).where(and(eq(userRewardChestsTable.id, chestId), eq(userRewardChestsTable.userId, req.user.id), eq(userRewardChestsTable.status, "unopened"))).returning();
      if (!chest) throw new Error("CHEST_UNAVAILABLE");
      const initialRarity = chest.rarity as ChestRarity;
      let finalRarity = rollChestRarity(initialRarity, randomInt(10_000) / 10_000);
      const ownedRows = await tx.select({ itemId: userCosmeticsTable.itemId }).from(userCosmeticsTable).where(eq(userCosmeticsTable.userId, req.user.id));
      const owned = new Set(ownedRows.map((entry) => entry.itemId));
      let candidates = chestCollectables.filter((item) => item.chestRarity === finalRarity && !owned.has(item.id));
      if (!candidates.length) {
        candidates = chestCollectables.filter((item) => !owned.has(item.id));
        if (candidates.length) {
          const availableRarities = (["epic", "rare", "common"] as const).filter((rarity) =>
            candidates.some((item) => item.chestRarity === rarity),
          );
          const higherRarity = availableRarities.find((rarity) => chestRarityUpgraded(initialRarity, rarity));
          if (higherRarity) {
            finalRarity = higherRarity;
            candidates = candidates.filter((item) => item.chestRarity === finalRarity);
          }
        }
      }
      const reward = candidates.length ? candidates[randomInt(candidates.length)] : null;
      const fallbackByRarity: Record<ChestRarity, number> = { common: 50, rare: 100, epic: 180 };
      const fallback = reward ? 0 : fallbackByRarity[finalRarity];
      if (reward) {
        await tx.insert(userCosmeticsTable).values({ userId: req.user.id, itemId: reward.id }).onConflictDoNothing();
      } else {
        let [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id));
        if (!stats) [stats] = await tx.insert(userStatsTable).values({ userId: req.user.id }).returning();
        const progress = stats.tierProgress + fallback;
        await tx.update(userStatsTable).set({ totalVp: stats.totalVp + fallback, lifetimeVp: stats.lifetimeVp + fallback, tier: stats.tier + Math.floor(progress / 100), tierProgress: progress % 100, updatedAt: new Date() }).where(eq(userStatsTable.id, stats.id));
      }
      const [opened] = await tx.update(userRewardChestsTable).set({ rarity: finalRarity, status: "opened", rewardItemId: reward?.id ?? null, vpFallback: fallback, openedAt: new Date() }).where(eq(userRewardChestsTable.id, chest.id)).returning();
      return {
        chest: opened,
        reward,
        vpFallback: fallback,
        initialRarity,
        finalRarity,
        upgraded: chestRarityUpgraded(initialRarity, finalRarity),
      };
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "CHEST_UNAVAILABLE") {
      res.status(409).json({ error: "This chest was already opened or is unavailable." });
      return;
    }
    throw error;
  }
});

router.post("/rewards/:itemId/purchase", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const item = findItem(req.params.itemId);
  if (!item) { res.status(404).json({ error: "Unknown reward." }); return; }
  if (item.kind === "title" || item.source === "chest" || item.source === "default" || item.cost <= 0) { res.status(400).json({ error: "This reward must be earned, not purchased." }); return; }
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
  const owned = item.source === "default" || await db.select().from(userCosmeticsTable).where(and(eq(userCosmeticsTable.userId, req.user.id), eq(userCosmeticsTable.itemId, item.id))).then((rows) => rows.length > 0);
  if (!owned) { res.status(403).json({ error: item.kind === "title" ? "Complete its requirement before equipping this title." : "Purchase this item before equipping it." }); return; }
  const update = item.kind === "frame" ? { equippedFrame: item.id } : item.kind === "pet" ? { equippedPet: item.id } : item.kind === "title" ? { equippedTitle: item.id } : item.kind === "completion_effect" ? { equippedCompletionEffect: item.id } : { equippedTransition: item.id };
  await db.update(usersTable).set({ ...update, updatedAt: new Date() }).where(eq(usersTable.id, req.user.id));
  res.json({ equipped: item.id });
});

router.delete("/rewards/equipped/:kind", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(["frame", "pet", "title", "completion_effect", "transition"] as const).includes(req.params.kind as RewardKind)) {
    res.status(400).json({ error: "Unknown reward type." });
    return;
  }
  const update = req.params.kind === "frame" ? { equippedFrame: "none" } : req.params.kind === "pet" ? { equippedPet: "none" } : req.params.kind === "title" ? { equippedTitle: "none" } : req.params.kind === "completion_effect" ? { equippedCompletionEffect: "clean-confetti" } : { equippedTransition: "velocity-slide" };
  await db.update(usersTable).set({ ...update, updatedAt: new Date() }).where(eq(usersTable.id, req.user.id));
  res.json({ equipped: "none" });
});

export default router;
