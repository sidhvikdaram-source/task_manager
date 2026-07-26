import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  bpTransactionsTable,
  tasksTable,
  userCosmeticsTable,
  userRewardChestsTable,
  userStatsTable,
  usersTable,
} from "@workspace/db";
import { reconcileRewardChests, type ChestRarity } from "../lib/rewardChests";
import { chestRarityUpgraded, rollChestBp, rollChestRarity, rollChestRewardType } from "../lib/rewardChestRules";
import {
  awardBpInTransaction,
  consumeChestKeyInTransaction,
  grantChestKeysInTransaction,
  lockEconomyUser,
  spendBpInTransaction,
} from "../lib/bpEconomy";
import {
  BP_RULES,
  CHEST_ITEMS,
  DEFAULT_ITEMS,
  ECONOMY_ITEMS,
  STORE_ITEMS,
  itemLockReason,
  type EconomyItem,
  type RewardKind,
} from "../lib/economyConfig";
import { purchaseEligibility } from "../lib/economyRules";
import { localDateKey } from "../lib/localDate";

const router: IRouter = Router();

const DAILY_DRIFT_REWARDS = [
  { amount: 8, name: "Calm Current", weight: 55 },
  { amount: 12, name: "Swift Current", weight: 30 },
  { amount: 18, name: "Nimbus Boost", weight: 15 },
] as const;

function rollDailyDrift() {
  const roll = randomInt(100);
  let cursor = 0;
  return DAILY_DRIFT_REWARDS.find((reward) => {
    cursor += reward.weight;
    return roll < cursor;
  }) ?? DAILY_DRIFT_REWARDS[0];
}

type RewardItem = Omit<EconomyItem, "source"> & {
  requirement?: string;
  source?: EconomyItem["source"] | "quest" | "achievement" | "tier";
};

const storeCollectables: RewardItem[] = STORE_ITEMS;
const freeCollectables: RewardItem[] = DEFAULT_ITEMS;
const chestCollectables: RewardItem[] = CHEST_ITEMS;
const collectables: RewardItem[] = ECONOMY_ITEMS;
const ADMIN_BALANCE = 999_999_999;

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
): TitleDefinition => ({
  id,
  name,
  description: requirement,
  kind: "title",
  category: "profile_customization",
  priceBp: 0,
  style: id,
  rarity: source === "tier" ? "epic" : "rare",
  requirement,
  source,
  equipable: true,
  test,
});

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
  title("trust-the-process", "Trust The Process", "Earn 500 lifetime NP", "tier", (c) => c.earnedVp >= 500),
  title("clutch-player", "Clutch Player", "Complete 5 critical tasks", "quest", (c) => c.completed.filter((task) => task.priority === "critical").length >= 5),
  title("locked-in", "Locked In", "Focus for 600 minutes", "achievement", (c) => c.focusMinutes >= 600),
  title("in-the-zone", "In The Zone", "Focus for 1,200 minutes", "achievement", (c) => c.focusMinutes >= 1200),
  title("dialed-in", "Dialed In", "Focus for 2,400 minutes", "achievement", (c) => c.focusMinutes >= 2400),
  title("zero-backlog", "Zero Backlog", "Clear every active task after completing 10", "quest", (c) => c.tasksCompleted >= 10 && c.activeCount === 0),
  title("top-tier", "Top Tier", "Reach Tier 10", "tier", (c) => c.tier >= 10),
  title("unbothered", "Unbothered", "Earn 1,500 lifetime NP", "tier", (c) => c.earnedVp >= 1500),
  title("built-different", "Built Different", "Complete 100 tasks", "achievement", (c) => c.tasksCompleted >= 100),
  title("overachiever", "Overachiever", "Complete 150 tasks", "achievement", (c) => c.tasksCompleted >= 150),
  title("backend-main", "Backend Main", "Complete 5 backend tasks", "quest", (c) => hasCompleted(c, /\b(backend|server|database|api)\b/i, 5)),
  title("full-stack", "Full Stack", "Complete 8 frontend or backend tasks", "quest", (c) => hasCompleted(c, /\b(frontend|backend|full stack|database|api|react)\b/i, 8)),
  title("bug-fixer", "Bug Fixer", "Complete 5 debugging tasks", "quest", (c) => hasCompleted(c, /\b(bug|debug|fix|repair)\b/i, 5)),
  title("git-push", "Git Push", "Complete 3 Git or deployment tasks", "quest", (c) => hasCompleted(c, /\b(git|push|deploy|release)\b/i, 3)),
  title("terminal-velocity", "Nimbus Strider", "Reach Tier 20", "tier", (c) => c.tier >= 20),
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

async function getRewardAdminUser(userId: string) {
  return db
    .select({
      isAdmin: usersTable.isAdmin,
      adminModeEnabled: usersTable.adminModeEnabled,
      adminLoadout: usersTable.adminLoadout,
      adminChestCount: usersTable.adminChestCount,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((rows) => rows[0]);
}

function isAdminSandbox(user: Awaited<ReturnType<typeof getRewardAdminUser>>) {
  return Boolean(user?.isAdmin && user.adminModeEnabled);
}

const equipUpdates: Partial<Record<RewardKind, (itemId: string) => Partial<typeof usersTable.$inferInsert>>> = {
  frame: (itemId) => ({ equippedFrame: itemId }),
  pet: (itemId) => ({ equippedPet: itemId }),
  title: (itemId) => ({ equippedTitle: itemId }),
  completion_effect: (itemId) => ({ equippedCompletionEffect: itemId }),
  transition: (itemId) => ({ equippedTransition: itemId }),
  profile_theme: (itemId) => ({ equippedProfileTheme: itemId }),
  focus_sound: (itemId) => ({ equippedFocusSound: itemId }),
  badge_display: (itemId) => ({ equippedBadgeDisplay: itemId }),
  momentum_cosmetic: (itemId) => ({ equippedMomentumCosmetic: itemId }),
};

router.post("/rewards/daily-drift", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await db.select({ timezone: usersTable.timezone })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id))
    .then((rows) => rows[0]);
  const rewardDate = localDateKey(new Date(), user?.timezone);
  const reward = rollDailyDrift();
  const result = await db.transaction(async (tx) => {
    await lockEconomyUser(tx, req.user!.id);
    return awardBpInTransaction(
      tx,
      req.user!.id,
      reward.amount,
      `daily-drift:${rewardDate}`,
      `${reward.name} return reward`,
    );
  });
  res.json({
    awarded: result.awarded > 0,
    amount: result.awarded,
    rewardName: result.awarded > 0 ? reward.name : null,
    rewardDate,
    balance: result.balance,
  });
});

router.get("/rewards", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Reset any chests stuck in "opening" state (from crashed/timed-out requests).
  // The transaction inside openChest sets status→"opening" then →"opened" atomically,
  // so "opening" only persists when the process died mid-request.
  await db.update(userRewardChestsTable)
    .set({ status: "unopened" })
    .where(and(eq(userRewardChestsTable.userId, req.user.id), eq(userRewardChestsTable.status, "opening")));
  await reconcileRewardChests(req.user.id);
  const [stats, ownedRows, user, tasks, chests] = await Promise.all([
    db.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id)).then((rows) => rows[0]),
    db.select({ itemId: userCosmeticsTable.itemId }).from(userCosmeticsTable).where(eq(userCosmeticsTable.userId, req.user.id)),
    db.select({ equippedFrame: usersTable.equippedFrame, equippedPet: usersTable.equippedPet, equippedTitle: usersTable.equippedTitle, equippedCompletionEffect: usersTable.equippedCompletionEffect, equippedTransition: usersTable.equippedTransition, equippedProfileTheme: usersTable.equippedProfileTheme, equippedFocusSound: usersTable.equippedFocusSound, equippedBadgeDisplay: usersTable.equippedBadgeDisplay, equippedMomentumCosmetic: usersTable.equippedMomentumCosmetic, profileImageUrl: usersTable.profileImageUrl, isAdmin: usersTable.isAdmin, adminModeEnabled: usersTable.adminModeEnabled, adminLoadout: usersTable.adminLoadout, adminChestCount: usersTable.adminChestCount }).from(usersTable).where(eq(usersTable.id, req.user.id)).then((rows) => rows[0]),
    db.select().from(tasksTable).where(eq(tasksTable.userId, req.user.id)),
    db.select().from(userRewardChestsTable).where(eq(userRewardChestsTable.userId, req.user.id)).orderBy(desc(userRewardChestsTable.awardedAt)),
  ]);
  const sandbox = Boolean(user?.isAdmin && user.adminModeEnabled);
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
  const unlockedTitles = sandbox ? [] : titles.filter((item) => item.test(context));
  const owned = new Set(ownedRows.map((entry) => entry.itemId));
  freeCollectables.forEach((item) => owned.add(item.id));
  if (sandbox) {
    collectables.forEach((item) => owned.add(item.id));
    titles.forEach((item) => owned.add(item.id));
  }
  const newlyUnlocked = unlockedTitles.filter((item) => !owned.has(item.id));
  const achievementBpAwarded = newlyUnlocked.length
    ? await db.transaction(async (tx) => {
        await lockEconomyUser(tx, req.user!.id);
        await tx
          .insert(userCosmeticsTable)
          .values(newlyUnlocked.map((item) => ({ userId: req.user!.id, itemId: item.id })))
          .onConflictDoNothing();
        let awarded = 0;
        for (const item of newlyUnlocked) {
          const result = await awardBpInTransaction(
            tx,
            req.user!.id,
            BP_RULES.achievementUnlock,
            `achievement:${item.id}`,
            `${item.name} unlocked`,
          );
          awarded += result.awarded;
        }
        return awarded;
      })
    : 0;
  newlyUnlocked.forEach((item) => owned.add(item.id));
  const [currentStats, transactions] = await Promise.all([
    db.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id)).then((rows) => rows[0]),
    db.select().from(bpTransactionsTable).where(eq(bpTransactionsTable.userId, req.user.id)).orderBy(desc(bpTransactionsTable.createdAt)).limit(12),
  ]);
  const publicItems = [...collectables, ...titles.map(({ test: _test, ...item }) => item)].map((item) => ({
    ...item,
    lockReason: sandbox ? null : itemLockReason(item, context.tier, context.momentum),
  }));
  const regularEquipped = {
    frame: user?.equippedFrame ?? "none",
    pet: user?.equippedPet ?? "none",
    title: user?.equippedTitle ?? "none",
    completion_effect: user?.equippedCompletionEffect ?? "clean-confetti",
    transition: user?.equippedTransition ?? "velocity-slide",
    profile_theme: user?.equippedProfileTheme ?? "none",
    focus_sound: user?.equippedFocusSound ?? "none",
    badge_display: user?.equippedBadgeDisplay ?? "none",
    momentum_cosmetic: user?.equippedMomentumCosmetic ?? "none",
    chest_key: "none",
  };
  const equipped = sandbox
    ? { ...regularEquipped, ...(user?.adminLoadout ?? {}) }
    : regularEquipped;
  const adminChest = sandbox && (user?.adminChestCount ?? 0) > 0
    ? [{
        id: -1,
        userId: req.user.id,
        sourceKey: "admin-sandbox",
        rarity: "legendary",
        status: "unopened",
        rewardItemId: null,
        vpFallback: 0,
        bpReward: 0,
        chestKeysReward: 0,
        requiresKey: false,
        awardedAt: new Date(),
        openedAt: null,
      }]
    : [];
  const visibleChests = [...adminChest, ...chests];
  res.json({
    adminModeEnabled: sandbox,
    bpBalance: sandbox ? ADMIN_BALANCE : currentStats?.bpBalance ?? 0,
    lifetimeBp: sandbox ? ADMIN_BALANCE : currentStats?.lifetimeBp ?? 0,
    chestKeys: sandbox ? 9_999 : currentStats?.chestKeys ?? 0,
    vpTotal: sandbox ? ADMIN_BALANCE : currentStats?.totalVp ?? 0,
    earnedVp: sandbox ? ADMIN_BALANCE : context.earnedVp,
    owned: [...owned],
    newlyUnlockedTitles: newlyUnlocked.map((item) => item.name),
    achievementBpAwarded,
    equipped,
    profileImageUrl: user?.profileImageUrl ?? null,
    chests: visibleChests,
    unopenedChestCount: visibleChests.filter((chest) => chest.status === "unopened").length,
    transactions,
    items: publicItems,
  });
});

router.post("/rewards/chests/:id/open", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const chestId = Number(req.params.id);
  if (!Number.isInteger(chestId)) { res.status(400).json({ error: "Invalid chest." }); return; }
  if (chestId === -1) {
    const admin = await getRewardAdminUser(req.user.id);
    if (!isAdminSandbox(admin) || (admin?.adminChestCount ?? 0) < 1) {
      res.status(409).json({ error: "This test chest is no longer available." });
      return;
    }
    const finalRarity = ["common", "rare", "epic", "legendary"][randomInt(4)] as ChestRarity;
    const candidates = chestCollectables.filter((item) => item.chestRarity === finalRarity);
    const reward = candidates.length ? candidates[randomInt(candidates.length)] : null;
    await db
      .update(usersTable)
      .set({ adminChestCount: 0, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user.id));
    res.json({
      chest: {
        id: -1,
        userId: req.user.id,
        sourceKey: "admin-sandbox",
        rarity: finalRarity,
        status: "opened",
        rewardItemId: reward?.id ?? null,
        vpFallback: 0,
        bpReward: reward ? 0 : 250,
        chestKeysReward: 0,
        requiresKey: false,
        awardedAt: new Date(),
        openedAt: new Date(),
      },
      reward,
      rewardType: reward ? "item" : "bp",
      bpReward: reward ? 0 : 250,
      chestKeysReward: 0,
      initialRarity: "legendary",
      finalRarity,
      upgraded: false,
      sandbox: true,
    });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await lockEconomyUser(tx, req.user.id);
      const [chest] = await tx.update(userRewardChestsTable).set({ status: "opening" }).where(and(eq(userRewardChestsTable.id, chestId), eq(userRewardChestsTable.userId, req.user.id), eq(userRewardChestsTable.status, "unopened"))).returning();
      if (!chest) throw new Error("CHEST_UNAVAILABLE");
      if (chest.requiresKey) await consumeChestKeyInTransaction(tx, req.user.id);
      const initialRarity = chest.rarity as ChestRarity;
      let finalRarity = rollChestRarity(initialRarity, randomInt(10_000) / 10_000);
      const ownedRows = await tx.select({ itemId: userCosmeticsTable.itemId }).from(userCosmeticsTable).where(eq(userCosmeticsTable.userId, req.user.id));
      const owned = new Set(ownedRows.map((entry) => entry.itemId));
      let rewardType = rollChestRewardType(finalRarity, randomInt(10_000) / 10_000);
      const candidates = chestCollectables.filter((item) => item.chestRarity === finalRarity && !owned.has(item.id));
      if (rewardType === "item" && !candidates.length) rewardType = "bp";
      const reward = rewardType === "item" ? candidates[randomInt(candidates.length)] : null;
      const bpReward = rewardType === "bp" ? rollChestBp(finalRarity, randomInt(10_000) / 10_000) : 0;
      const chestKeysReward = rewardType === "key" ? (finalRarity === "legendary" ? 2 : 1) : 0;
      if (reward) {
        await tx.insert(userCosmeticsTable).values({ userId: req.user.id, itemId: reward.id }).onConflictDoNothing();
      }
      if (bpReward) await awardBpInTransaction(tx, req.user.id, bpReward, `chest:${chest.id}:bp`, `${finalRarity} chest reward`);
      if (chestKeysReward) await grantChestKeysInTransaction(tx, req.user.id, chestKeysReward);
      const [opened] = await tx.update(userRewardChestsTable).set({ rarity: finalRarity, status: "opened", rewardItemId: reward?.id ?? null, vpFallback: 0, bpReward, chestKeysReward, openedAt: new Date() }).where(and(eq(userRewardChestsTable.id, chest.id), eq(userRewardChestsTable.userId, req.user.id))).returning();
      return {
        chest: opened,
        reward,
        rewardType,
        bpReward,
        chestKeysReward,
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

router.post("/rewards/chests/key/use", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      await lockEconomyUser(tx, req.user.id);
      const chestKeys = await consumeChestKeyInTransaction(tx, req.user.id);
      const [chest] = await tx.insert(userRewardChestsTable).values({
        userId: req.user.id,
        sourceKey: `key:${randomUUID()}`,
        rarity: "common",
      }).returning();
      return { chest, chestKeys };
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CHEST_KEYS") {
      res.status(400).json({ error: "You do not have a chest key." });
      return;
    }
    throw error;
  }
});

router.post("/rewards/:itemId/purchase", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const item = findItem(req.params.itemId);
  if (!item) { res.status(404).json({ error: "Unknown reward." }); return; }
  const admin = await getRewardAdminUser(req.user.id);
  if (isAdminSandbox(admin)) {
    res.status(201).json({
      bpBalance: ADMIN_BALANCE,
      chestKeys: 9_999,
      item,
      sandbox: true,
    });
    return;
  }
  if (item.source !== "store" || item.priceBp <= 0) { res.status(400).json({ error: "This reward must be earned, not purchased." }); return; }
  try {
    const response = await db.transaction(async (tx) => {
      await lockEconomyUser(tx, req.user.id);
      const [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, req.user.id));
      const lockReason = itemLockReason(item, stats?.tier ?? 1, stats?.streakDays ?? 0);
      if (lockReason) throw new Error(`LOCKED:${lockReason}`);
      const [existing] = item.repeatable ? [] : await tx.select().from(userCosmeticsTable).where(and(eq(userCosmeticsTable.userId, req.user.id), eq(userCosmeticsTable.itemId, item.id)));
      const eligibility = purchaseEligibility({ balance: stats?.bpBalance ?? 0, priceBp: item.priceBp, owned: Boolean(existing), repeatable: Boolean(item.repeatable), lockReason });
      if (!eligibility.allowed) throw new Error(eligibility.reason ?? "PURCHASE_FAILED");
      const purchaseKey = item.repeatable ? `purchase:${item.id}:${randomUUID()}` : `purchase:${item.id}`;
      const spent = await spendBpInTransaction(tx, req.user.id, item.priceBp, purchaseKey, `Purchased ${item.name}`);
      let chestKeys = stats?.chestKeys ?? 0;
      if (item.kind === "chest_key") {
        chestKeys = await grantChestKeysInTransaction(tx, req.user.id, 1);
      } else {
        await tx.insert(userCosmeticsTable).values({ userId: req.user.id, itemId: item.id });
      }
      return { bpBalance: spent.balance, chestKeys };
    });
    res.status(201).json({ ...response, item });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PURCHASE_FAILED";
    const locked = code.startsWith("LOCKED:");
    res.status(code === "ALREADY_OWNED" || code === "INSUFFICIENT_BP" || locked ? 400 : 500).json({ error: code === "ALREADY_OWNED" ? "You already own this item." : code === "INSUFFICIENT_BP" ? "Not enough BP for that item." : locked ? code.slice(7) : "Could not complete purchase." });
  }
});

router.post("/rewards/:itemId/equip", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const item = findItem(req.params.itemId);
  if (!item) { res.status(404).json({ error: "Unknown reward." }); return; }
  const makeUpdate = equipUpdates[item.kind];
  if (!item.equipable || !makeUpdate) { res.status(400).json({ error: "This item is used rather than equipped." }); return; }
  const admin = await getRewardAdminUser(req.user.id);
  if (isAdminSandbox(admin)) {
    const adminLoadout = { ...(admin?.adminLoadout ?? {}), [item.kind]: item.id };
    await db
      .update(usersTable)
      .set({ adminLoadout, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user.id));
    res.json({ kind: item.kind, equipped: item.id, sandbox: true });
    return;
  }
  const owned = item.source === "default" || await db.select().from(userCosmeticsTable).where(and(eq(userCosmeticsTable.userId, req.user.id), eq(userCosmeticsTable.itemId, item.id))).then((rows) => rows.length > 0);
  if (!owned) { res.status(403).json({ error: item.kind === "title" ? "Complete its requirement before equipping this title." : "Purchase this item before equipping it." }); return; }
  const update = makeUpdate(item.id);
  await db.update(usersTable).set({ ...update, updatedAt: new Date() }).where(eq(usersTable.id, req.user.id));
  res.json({ kind: item.kind, equipped: item.id });
});

router.delete("/rewards/equipped/:kind", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const makeUpdate = equipUpdates[req.params.kind as RewardKind];
  if (!makeUpdate) {
    res.status(400).json({ error: "Unknown reward type." });
    return;
  }
  const defaultItem = req.params.kind === "completion_effect"
    ? "clean-confetti"
    : req.params.kind === "transition"
      ? "velocity-slide"
      : "none";
  const admin = await getRewardAdminUser(req.user.id);
  if (isAdminSandbox(admin)) {
    const adminLoadout = {
      ...(admin?.adminLoadout ?? {}),
      [req.params.kind]: defaultItem,
    };
    await db
      .update(usersTable)
      .set({ adminLoadout, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user.id));
    res.json({ kind: req.params.kind, equipped: defaultItem, sandbox: true });
    return;
  }
  const update = makeUpdate(defaultItem);
  await db.update(usersTable).set({ ...update, updatedAt: new Date() }).where(eq(usersTable.id, req.user.id));
  res.json({ kind: req.params.kind, equipped: defaultItem });
});

export default router;
