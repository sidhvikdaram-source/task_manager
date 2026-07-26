import { randomInt } from "node:crypto";
import { and, eq, gte, inArray, ne } from "drizzle-orm";
import {
  dailyHabitCompletionsTable,
  dailyHabitsTable,
  dailyForecastsTable,
  db,
  tasksTable,
  userCosmeticsTable,
  usersTable,
  userStatsTable,
} from "@workspace/db";
import { awardBpInTransaction, lockEconomyUser, spendBpInTransaction, type EconomyTransaction } from "./bpEconomy";
import { ECONOMY_ITEMS, VP_RULES } from "./economyConfig";
import { addCalendarDays, localDateKey, startOfWeekKey } from "./localDate";
import {
  FORECAST_COSTS,
  FORECAST_DETAILS,
  isChargeableTask,
  isHabitScheduledToday,
  rollForecast,
  windyReward,
  type ForecastWeather,
} from "./forecastRules";

type ForecastInsert = typeof dailyForecastsTable.$inferInsert;
type ForecastRow = typeof dailyForecastsTable.$inferSelect;

async function stormCandidates(tx: EconomyTransaction, userId: string, forecastDate: string) {
  const [tasks, habits] = await Promise.all([
    tx.select().from(tasksTable)
      .where(and(eq(tasksTable.userId, userId), ne(tasksTable.status, "completed"), eq(tasksTable.archived, false))),
    tx.select().from(dailyHabitsTable)
      .where(and(eq(dailyHabitsTable.userId, userId), eq(dailyHabitsTable.status, "active"))),
  ]);
  const scheduledHabits = habits.filter((habit) => isHabitScheduledToday(habit.daysOfWeek, forecastDate));
  const completedHabitIds = scheduledHabits.length
    ? new Set(await tx.select({ habitId: dailyHabitCompletionsTable.habitId }).from(dailyHabitCompletionsTable)
      .where(and(
        inArray(dailyHabitCompletionsTable.habitId, scheduledHabits.map((habit) => habit.id)),
        eq(dailyHabitCompletionsTable.completedDate, forecastDate),
        eq(dailyHabitCompletionsTable.completed, true),
      )).then((rows) => rows.map((row) => row.habitId)))
    : new Set<number>();
  return [
    ...tasks.filter((task) => isChargeableTask(task, forecastDate)).map((task) => ({ taskId: task.id, habitId: null })),
    ...scheduledHabits.filter((habit) => !completedHabitIds.has(habit.id)).map((habit) => ({ taskId: null, habitId: habit.id })),
  ];
}

async function rolledForecastValues(tx: EconomyTransaction, userId: string, forecastDate: string) {
  let weather = rollForecast(randomInt(100));
  let targetTaskId: number | null = null;
  let targetHabitId: number | null = null;
  let freeItemId: string | null = null;
  if (weather === "stormy") {
    const candidates = await stormCandidates(tx, userId, forecastDate);
    const target = candidates.length ? candidates[randomInt(candidates.length)] : null;
    targetTaskId = target?.taskId ?? null;
    targetHabitId = target?.habitId ?? null;
    // A forecast can offer an extra opportunity, but it must never invent an
    // impossible requirement. Clear skies are the fair, no-target fallback.
    if (!target) weather = "sunny";
  }
  if (weather === "rainbow") {
    const owned = new Set(await tx.select({ itemId: userCosmeticsTable.itemId }).from(userCosmeticsTable)
      .where(eq(userCosmeticsTable.userId, userId)).then((rows) => rows.map((row) => row.itemId)));
    const candidates = ECONOMY_ITEMS.filter((item) =>
      item.source === "store" && item.equipable && !item.repeatable && !owned.has(item.id),
    );
    freeItemId = candidates.length ? candidates[randomInt(candidates.length)].id : null;
  }
  return { weather, targetTaskId, targetHabitId, freeItemId };
}

async function createForecast(tx: EconomyTransaction, userId: string, forecastDate: string) {
  const existing = await tx.select().from(dailyForecastsTable)
    .where(and(eq(dailyForecastsTable.userId, userId), eq(dailyForecastsTable.forecastDate, forecastDate)))
    .then((rows) => rows[0]);
  if (existing) return { forecast: existing, created: false };
  const values = await rolledForecastValues(tx, userId, forecastDate);
  const [created] = await tx.insert(dailyForecastsTable).values({
    userId,
    forecastDate,
    ...values,
  }).onConflictDoNothing().returning();
  if (!created) {
    const raced = await tx.select().from(dailyForecastsTable)
      .where(and(eq(dailyForecastsTable.userId, userId), eq(dailyForecastsTable.forecastDate, forecastDate)))
      .then((rows) => rows[0]);
    return { forecast: raced!, created: false };
  }
  if (created.weather === "rainbow") {
    if (created.freeItemId) {
      await tx.insert(userCosmeticsTable).values({ userId, itemId: created.freeItemId }).onConflictDoNothing();
    } else {
      const fallback = await awardBpInTransaction(tx, userId, 100, `forecast:${forecastDate}:rainbow-fallback`, "Rainbow forecast fallback");
      const [updated] = await tx.update(dailyForecastsTable)
        .set({ rewardBp: fallback.awarded, updatedAt: new Date() })
        .where(eq(dailyForecastsTable.id, created.id))
        .returning();
      return { forecast: updated, created: true };
    }
  }
  return { forecast: created, created: true };
}

function publicForecast(forecast: ForecastRow, targetTitle?: string | null) {
  const details = FORECAST_DETAILS[forecast.weather as ForecastWeather];
  return {
    id: forecast.id,
    date: forecast.forecastDate,
    weather: forecast.weather as ForecastWeather,
    name: details.name,
    headline: details.headline,
    description: details.description,
    targetTaskId: forecast.targetTaskId,
    targetHabitId: forecast.targetHabitId,
    targetKind: forecast.targetHabitId ? "habit" : forecast.targetTaskId ? "task" : null,
    targetTitle: targetTitle ?? null,
    targetTaskTitle: forecast.targetTaskId ? targetTitle ?? null : null,
    freeItemId: forecast.freeItemId,
    freeItemName: forecast.freeItemId ? ECONOMY_ITEMS.find((item) => item.id === forecast.freeItemId)?.name ?? null : null,
    taskCompletions: forecast.taskCompletions,
    rewardNp: forecast.weather === "foggy" ? 0 : forecast.rewardNp,
    rewardBp: forecast.weather === "foggy" ? 0 : forecast.rewardBp,
    boostPercent: forecast.boostPercent,
    canReroll: !forecast.rerolledAt && forecast.taskCompletions === 0 && forecast.weather !== "rainbow",
  };
}

async function repairStormTarget(tx: EconomyTransaction, userId: string, forecast: ForecastRow) {
  if (forecast.weather !== "stormy" || forecast.chargeClaimedAt) return forecast;
  const candidates = await stormCandidates(tx, userId, forecast.forecastDate);
  const stillEligible = candidates.some((candidate) =>
    (forecast.targetTaskId && candidate.taskId === forecast.targetTaskId)
    || (forecast.targetHabitId && candidate.habitId === forecast.targetHabitId),
  );
  if (stillEligible) return forecast;
  const target = candidates.length ? candidates[randomInt(candidates.length)] : null;
  const [updated] = await tx.update(dailyForecastsTable).set({
    weather: target ? "stormy" : "sunny",
    targetTaskId: target?.taskId ?? null,
    targetHabitId: target?.habitId ?? null,
    updatedAt: new Date(),
  }).where(eq(dailyForecastsTable.id, forecast.id)).returning();
  return updated;
}

export async function loadForecastDashboard(userId: string) {
  const now = new Date();
  const [user, stats] = await Promise.all([
    db.select({
      timezone: usersTable.timezone,
      tutorialCompleted: usersTable.tutorialCompleted,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).then((rows) => rows[0]),
    db.select().from(userStatsTable).where(eq(userStatsTable.userId, userId)).then((rows) => rows[0]),
  ]);
  const timezone = user?.timezone ?? "UTC";
  const today = localDateKey(now, timezone);
  const eligible = Boolean(
    user?.tutorialCompleted
    && (stats?.tasksCompleted ?? 0) >= 3
    && user.createdAt
    && localDateKey(user.createdAt, timezone) !== today,
  );
  if (!eligible) {
    return {
      eligible: false,
      requirements: {
        tutorial: Boolean(user?.tutorialCompleted),
        tasksCompleted: stats?.tasksCompleted ?? 0,
        returningDay: Boolean(user?.createdAt && localDateKey(user.createdAt, timezone) !== today),
      },
      today: null,
      shouldReveal: false,
      yesterdayReveal: null,
      tomorrow: null,
      weeklyReport: null,
    };
  }

  const { forecast, shouldReveal } = await db.transaction(async (tx) => {
    await lockEconomyUser(tx, userId);
    const result = await createForecast(tx, userId, today);
    const safeForecast = await repairStormTarget(tx, userId, result.forecast);
    const reveal = !safeForecast.revealedAt && !safeForecast.peekedAt;
    const [updated] = reveal
      ? await tx.update(dailyForecastsTable).set({ revealedAt: now, updatedAt: now })
        .where(eq(dailyForecastsTable.id, safeForecast.id)).returning()
      : [safeForecast];
    return { forecast: updated, shouldReveal: reveal };
  });
  const targetTitle = forecast.targetTaskId
    ? await db.select({ title: tasksTable.title }).from(tasksTable)
      .where(and(eq(tasksTable.id, forecast.targetTaskId), eq(tasksTable.userId, userId)))
      .then((rows) => rows[0]?.title ?? null)
    : forecast.targetHabitId
      ? await db.select({ title: dailyHabitsTable.title }).from(dailyHabitsTable)
        .where(and(eq(dailyHabitsTable.id, forecast.targetHabitId), eq(dailyHabitsTable.userId, userId)))
        .then((rows) => rows[0]?.title ?? null)
      : null;
  const yesterday = addCalendarDays(today, -1);
  const yesterdayForecast = await db.transaction(async (tx) => {
    await lockEconomyUser(tx, userId);
    const previous = await tx.select().from(dailyForecastsTable)
      .where(and(eq(dailyForecastsTable.userId, userId), eq(dailyForecastsTable.forecastDate, yesterday), eq(dailyForecastsTable.weather, "foggy")))
      .then((rows) => rows[0]);
    if (!previous || previous.settledAt || previous.rewardBp <= 0) return previous;
    await awardBpInTransaction(tx, userId, previous.rewardBp, `forecast:${yesterday}:fog-reveal`, "Foggy forecast revealed");
    const [settled] = await tx.update(dailyForecastsTable).set({ settledAt: now, updatedAt: now })
      .where(eq(dailyForecastsTable.id, previous.id)).returning();
    return settled;
  });
  const tomorrowForecast = await db.select().from(dailyForecastsTable)
    .where(and(eq(dailyForecastsTable.userId, userId), eq(dailyForecastsTable.forecastDate, addCalendarDays(today, 1))))
    .then((rows) => rows[0]);

  let weeklyReport: null | {
    tasksDone: number;
    npEarned: number;
    forecastBp: number;
    luckiestWeather: string;
    nextWeekPrediction: string;
  } = null;
  if (new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now) === "Sun") {
    const weekStart = startOfWeekKey(today);
    const recentTasks = await db.select({ completedAt: tasksTable.completedAt, vpValue: tasksTable.vpValue }).from(tasksTable)
      .where(and(eq(tasksTable.userId, userId), gte(tasksTable.completedAt, new Date(Date.now() - 8 * 86_400_000))));
    const completed = recentTasks.filter((task) => task.completedAt && localDateKey(task.completedAt, timezone) >= weekStart);
    const forecasts = await db.select().from(dailyForecastsTable)
      .where(and(eq(dailyForecastsTable.userId, userId), gte(dailyForecastsTable.forecastDate, weekStart)));
    const luckiest = [...forecasts].sort((a, b) => (b.rewardNp + b.rewardBp) - (a.rewardNp + a.rewardBp))[0];
    const predictions = ["bright starts with a late-week gust", "a calm front followed by surprise thunder", "scattered focus with a rainbow window", "steady skies and one high-energy day"];
    const predictionIndex = [...`${userId}:${weekStart}`].reduce((sum, char) => sum + char.charCodeAt(0), 0) % predictions.length;
    weeklyReport = {
      tasksDone: completed.length,
      npEarned: completed.reduce((sum, task) => sum + task.vpValue, 0),
      forecastBp: forecasts.reduce((sum, item) => sum + item.rewardBp, 0),
      luckiestWeather: luckiest?.weather ?? "clear",
      nextWeekPrediction: predictions[predictionIndex],
    };
  }

  return {
    eligible: true,
    requirements: null,
    today: publicForecast(forecast, targetTitle),
    shouldReveal,
    yesterdayReveal: yesterdayForecast ? {
      weather: "foggy",
      rewardBp: yesterdayForecast.rewardBp,
      rewardNp: yesterdayForecast.rewardNp,
      taskCompletions: yesterdayForecast.taskCompletions,
    } : null,
    tomorrow: tomorrowForecast?.peekedAt ? publicForecast(tomorrowForecast) : null,
    weeklyReport,
  };
}

export async function purchaseForecastConsumable(userId: string, itemId: string) {
  return db.transaction(async (tx) => {
    await lockEconomyUser(tx, userId);
    const [user] = await tx.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
    const today = localDateKey(new Date(), user?.timezone);
    const current = await createForecast(tx, userId, today);
    if (itemId === "weather-reroll") {
      if (current.forecast.rerolledAt || current.forecast.taskCompletions > 0 || current.forecast.weather === "rainbow") throw new Error("FORECAST_LOCKED");
      const spent = await spendBpInTransaction(tx, userId, FORECAST_COSTS.reroll, `forecast-reroll:${today}`, "Rerolled today's forecast");
      const values = await rolledForecastValues(tx, userId, today);
      const [forecast] = await tx.update(dailyForecastsTable).set({ ...values, chargeClaimedAt: null, rerolledAt: new Date(), updatedAt: new Date() })
        .where(eq(dailyForecastsTable.id, current.forecast.id)).returning();
      if (forecast.weather === "rainbow" && forecast.freeItemId) {
        await tx.insert(userCosmeticsTable).values({ userId, itemId: forecast.freeItemId }).onConflictDoNothing();
      }
      return { bpBalance: spent.balance, forecast: publicForecast(forecast) };
    }
    if (itemId === "tomorrow-peek") {
      const tomorrow = addCalendarDays(today, 1);
      const next = await createForecast(tx, userId, tomorrow);
      if (next.forecast.peekedAt) throw new Error("ALREADY_PEEKED");
      const spent = await spendBpInTransaction(tx, userId, FORECAST_COSTS.peek, `forecast-peek:${tomorrow}`, "Peeked at tomorrow's forecast");
      const [forecast] = await tx.update(dailyForecastsTable).set({ peekedAt: new Date(), updatedAt: new Date() })
        .where(eq(dailyForecastsTable.id, next.forecast.id)).returning();
      return { bpBalance: spent.balance, forecast: publicForecast(forecast) };
    }
    if (itemId === "tailwind-boost") {
      if (current.forecast.boostPercent > 0) throw new Error("BOOST_ACTIVE");
      const spent = await spendBpInTransaction(tx, userId, FORECAST_COSTS.boost, `forecast-boost:${today}`, "Activated a 25% NP Tailwind");
      const [forecast] = await tx.update(dailyForecastsTable).set({ boostPercent: 25, updatedAt: new Date() })
        .where(eq(dailyForecastsTable.id, current.forecast.id)).returning();
      return { bpBalance: spent.balance, forecast: publicForecast(forecast) };
    }
    throw new Error("UNKNOWN_FORECAST_ITEM");
  });
}

export async function applyForecastCompletionInTransaction(
  tx: EconomyTransaction,
  userId: string,
  task: typeof tasksTable.$inferSelect,
  completedAt: Date,
  baseNp: number,
  timezone: string,
) {
  const date = localDateKey(completedAt, timezone);
  const forecast = await tx.select().from(dailyForecastsTable)
    .where(and(eq(dailyForecastsTable.userId, userId), eq(dailyForecastsTable.forecastDate, date)))
    .then((rows) => rows[0]);
  if (!forecast) return { bonusNp: 0, bonusBp: 0, weather: null, triggered: false, hidden: false };
  let bonusNp = forecast.boostPercent ? Math.round(baseNp * forecast.boostPercent / 100) : 0;
  let bonusBp = 0;
  let triggered = bonusNp > 0;
  const weather = forecast.weather as ForecastWeather;
  if (weather === "sunny") {
    bonusNp += Math.round(baseNp * 0.5);
    triggered = true;
  } else if (weather === "stormy" && forecast.targetTaskId === task.id) {
    bonusNp += 50;
    bonusBp += 25;
    triggered = true;
  } else if (weather === "foggy") {
    bonusBp += 5;
    triggered = true;
  } else if (weather === "windy") {
    bonusBp += windyReward(randomInt(100), randomInt(11));
    triggered = bonusBp > 0 || triggered;
  }
  if (bonusBp && weather !== "foggy") {
    const result = await awardBpInTransaction(tx, userId, bonusBp, `forecast:${date}:task:${task.id}:bp`, `${FORECAST_DETAILS[weather].name} forecast reward`);
    bonusBp = result.awarded;
  }
  await tx.update(dailyForecastsTable).set({
    taskCompletions: forecast.taskCompletions + 1,
    rewardNp: forecast.rewardNp + bonusNp,
    rewardBp: forecast.rewardBp + bonusBp,
    chargeClaimedAt: weather === "stormy" && forecast.targetTaskId === task.id ? completedAt : forecast.chargeClaimedAt,
    updatedAt: completedAt,
  }).where(eq(dailyForecastsTable.id, forecast.id));
  return { bonusNp, bonusBp, weather, triggered, hidden: weather === "foggy" };
}

export async function applyForecastHabitCompletion(userId: string, habitId: number, completedAt = new Date()) {
  return db.transaction(async (tx) => {
    await lockEconomyUser(tx, userId);
    const [user] = await tx.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
    const date = localDateKey(completedAt, user?.timezone);
    const forecast = await tx.select().from(dailyForecastsTable)
      .where(and(eq(dailyForecastsTable.userId, userId), eq(dailyForecastsTable.forecastDate, date)))
      .then((rows) => rows[0]);
    if (!forecast || forecast.weather !== "stormy" || forecast.targetHabitId !== habitId || forecast.chargeClaimedAt) {
      return { triggered: false, bonusNp: 0, bonusBp: 0, weather: forecast?.weather ?? null };
    }
    let [stats] = await tx.select().from(userStatsTable).where(eq(userStatsTable.userId, userId));
    if (!stats) [stats] = await tx.insert(userStatsTable).values({ userId }).returning();
    const bonusNp = 50;
    const progress = stats.tierProgress + bonusNp;
    await tx.update(userStatsTable).set({
      totalVp: stats.totalVp + bonusNp,
      lifetimeVp: stats.lifetimeVp + bonusNp,
      tier: stats.tier + Math.floor(progress / VP_RULES.tierSize),
      tierProgress: progress % VP_RULES.tierSize,
      updatedAt: completedAt,
    }).where(eq(userStatsTable.id, stats.id));
    const bp = await awardBpInTransaction(tx, userId, 25, `forecast:${date}:habit:${habitId}:bp`, "Storm forecast habit reward");
    await tx.update(dailyForecastsTable).set({
      taskCompletions: forecast.taskCompletions + 1,
      rewardNp: forecast.rewardNp + bonusNp,
      rewardBp: forecast.rewardBp + bp.awarded,
      chargeClaimedAt: completedAt,
      updatedAt: completedAt,
    }).where(eq(dailyForecastsTable.id, forecast.id));
    return { triggered: true, bonusNp, bonusBp: bp.awarded, weather: "stormy" as const };
  });
}
