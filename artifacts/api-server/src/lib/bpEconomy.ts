import { and, eq, gte, sql } from "drizzle-orm";
import { bpTransactionsTable, db, userStatsTable } from "@workspace/db";
import { momentumMilestoneAwards, nextBpBalance } from "./economyRules";

export type EconomyTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockEconomyUser(tx: EconomyTransaction, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`economy:${userId}`}))`);
}

async function statsForUpdate(tx: EconomyTransaction, userId: string) {
  let [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
  if (!stats) [stats] = await tx.insert(userStatsTable).values({ userId }).returning();
  return stats;
}

export async function awardBpInTransaction(
  tx: EconomyTransaction,
  userId: string,
  amount: number,
  sourceKey: string,
  description: string,
) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("INVALID_BP_AWARD");
  const existing = await tx.select({ id: bpTransactionsTable.id, balanceAfter: bpTransactionsTable.balanceAfter })
    .from(bpTransactionsTable)
    .where(and(eq(bpTransactionsTable.userId, userId), eq(bpTransactionsTable.sourceKey, sourceKey)))
    .then((rows) => rows[0]);
  if (existing) return { awarded: 0, balance: existing.balanceAfter, duplicate: true };

  const stats = await statsForUpdate(tx, userId);
  const balance = nextBpBalance(stats.bpBalance, amount);
  const [receipt] = await tx.insert(bpTransactionsTable).values({
    userId,
    amount,
    type: "earn",
    sourceKey,
    description,
    balanceAfter: balance,
  }).onConflictDoNothing().returning();
  if (!receipt) return { awarded: 0, balance: stats.bpBalance, duplicate: true };
  await tx.update(userStatsTable).set({
    bpBalance: balance,
    lifetimeBp: stats.lifetimeBp + amount,
    updatedAt: new Date(),
  }).where(eq(userStatsTable.id, stats.id));
  return { awarded: amount, balance, duplicate: false };
}

export async function awardBp(
  userId: string,
  amount: number,
  sourceKey: string,
  description: string,
) {
  return db.transaction(async (tx) => {
    await lockEconomyUser(tx, userId);
    return awardBpInTransaction(tx, userId, amount, sourceKey, description);
  });
}

export async function spendBpInTransaction(
  tx: EconomyTransaction,
  userId: string,
  amount: number,
  sourceKey: string,
  description: string,
) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("INVALID_BP_SPEND");
  const duplicate = await tx.select({ id: bpTransactionsTable.id })
    .from(bpTransactionsTable)
    .where(and(eq(bpTransactionsTable.userId, userId), eq(bpTransactionsTable.sourceKey, sourceKey)))
    .then((rows) => rows[0]);
  if (duplicate) throw new Error("DUPLICATE_BP_TRANSACTION");
  const stats = await statsForUpdate(tx, userId);
  const [updated] = await tx.update(userStatsTable).set({
    bpBalance: sql`${userStatsTable.bpBalance} - ${amount}`,
    updatedAt: new Date(),
  }).where(and(eq(userStatsTable.id, stats.id), gte(userStatsTable.bpBalance, amount))).returning();
  if (!updated) throw new Error("INSUFFICIENT_BP");
  await tx.insert(bpTransactionsTable).values({
    userId,
    amount: -amount,
    type: "spend",
    sourceKey,
    description,
    balanceAfter: updated.bpBalance,
  });
  return { spent: amount, balance: updated.bpBalance };
}

export async function spendBp(
  userId: string,
  amount: number,
  sourceKey: string,
  description: string,
) {
  return db.transaction(async (tx) => {
    await lockEconomyUser(tx, userId);
    return spendBpInTransaction(tx, userId, amount, sourceKey, description);
  });
}

export async function grantChestKeysInTransaction(
  tx: EconomyTransaction,
  userId: string,
  count: number,
) {
  if (!Number.isInteger(count) || count <= 0) throw new Error("INVALID_KEY_AWARD");
  const stats = await statsForUpdate(tx, userId);
  const [updated] = await tx.update(userStatsTable).set({
    chestKeys: stats.chestKeys + count,
    updatedAt: new Date(),
  }).where(eq(userStatsTable.id, stats.id)).returning();
  return updated.chestKeys;
}

export async function consumeChestKeyInTransaction(
  tx: EconomyTransaction,
  userId: string,
) {
  const stats = await statsForUpdate(tx, userId);
  const [updated] = await tx.update(userStatsTable).set({
    chestKeys: sql`${userStatsTable.chestKeys} - 1`,
    updatedAt: new Date(),
  }).where(and(eq(userStatsTable.id, stats.id), gte(userStatsTable.chestKeys, 1))).returning();
  if (!updated) throw new Error("NO_CHEST_KEYS");
  return updated.chestKeys;
}

export async function awardMomentumMilestonesInTransaction(
  tx: EconomyTransaction,
  userId: string,
  previousMomentum: number,
  currentMomentum: number,
) {
  const rewards: Array<{ days: number; bp: number }> = [];
  for (const { days, bp } of momentumMilestoneAwards(previousMomentum, currentMomentum)) {
      const result = await awardBpInTransaction(
        tx,
        userId,
        bp,
        `momentum:${days}`,
        `${days}-day Momentum milestone`,
      );
      if (result.awarded) rewards.push({ days, bp: result.awarded });
  }
  return rewards;
}
