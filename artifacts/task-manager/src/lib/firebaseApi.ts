import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@workspace/replit-auth-web";
import { firebaseApp } from "@workspace/replit-auth-web";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { parseQuickCapture } from "../../../api-server/src/lib/quickCapture";
import {
  scoreTaskRecommendation,
  type RecommendationEnergy,
} from "../../../api-server/src/lib/taskRecommendation";
import {
  DEFAULT_ITEMS,
  ECONOMY_ITEMS,
  itemLockReason,
  type EconomyItem,
  type RewardKind,
} from "../../../api-server/src/lib/economyConfig";

type JsonObject = Record<string, unknown>;
type Stored = JsonObject & { id: number };

const ADMIN_EMAILS = new Set([
  "sidhvik.daram@gmail.com",
  "sidhvik.daram@k12.friscoisd.org",
]);
const DEFAULT_SUBJECTS = [
  ["Math", "#2563eb"],
  ["Science", "#059669"],
  ["English", "#7c3aed"],
  ["Social Studies", "#b45309"],
  ["Spanish", "#dc2626"],
  ["Reading", "#0891b2"],
  ["Band", "#c026d3"],
  ["Computer Science", "#475569"],
  ["Other", "#64748b"],
] as const;
const EQUIPPED_FIELDS: Record<string, string> = {
  frame: "equippedFrame",
  pet: "equippedPet",
  title: "equippedTitle",
  completion_effect: "equippedCompletionEffect",
  transition: "equippedTransition",
  profile_theme: "equippedProfileTheme",
  focus_sound: "equippedFocusSound",
  badge_display: "equippedBadgeDisplay",
  momentum_cosmetic: "equippedMomentumCosmetic",
};

const now = () => new Date().toISOString();
const dateKey = (date = new Date()) => date.toLocaleDateString("en-CA");
const userPath = (uid: string) => doc(firebaseDb, "users", uid);
const child = (uid: string, name: string) =>
  collection(firebaseDb, "users", uid, name);
const childDoc = (uid: string, name: string, id: number | string) =>
  doc(firebaseDb, "users", uid, name, String(id));

function json(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function body(request: Request): Promise<JsonObject> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  return request.json().catch(() => ({})) as Promise<JsonObject>;
}

function clean<T extends JsonObject>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function normalizedName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function canonicalSubjectName(value: unknown, subjects: JsonObject[]) {
  const target = normalizedName(value);
  if (!target) return null;
  const match = subjects.find((subject) => {
    const name = String(subject.name ?? "");
    const initials = name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .toLowerCase();
    return (
      normalizedName(name) === target ||
      (target.length >= 2 && initials === target)
    );
  });
  return match ? String(match.name) : null;
}

function completedOnDate(value: unknown, targetDate: string) {
  if (typeof value !== "string" || !value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === targetDate;
}

function adminEmail(email?: string | null) {
  return ADMIN_EMAILS.has(email?.trim().toLowerCase() ?? "");
}

function userDefaults() {
  const current = firebaseAuth.currentUser!;
  const names = current.displayName?.trim().split(/\s+/) ?? [];
  return {
    id: current.uid,
    email: current.email ?? null,
    firstName: names[0] ?? null,
    lastName: names.slice(1).join(" ") || null,
    profileImageUrl: current.photoURL ?? null,
    username: null,
    mainGoal: null,
    onboardingCompleted: false,
    advancedFeaturesEnabled: false,
    tutorialCompleted: false,
    tutorialStep: 0,
    socialEnabled: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    calendarView: "month",
    completionSoundEnabled: true,
    equippedFrame: "none",
    equippedPet: "none",
    equippedTitle: "none",
    equippedCompletionEffect: "clean-confetti",
    equippedTransition: "none",
    equippedProfileTheme: "none",
    equippedFocusSound: "none",
    equippedBadgeDisplay: "none",
    equippedMomentumCosmetic: "none",
    isAdmin: adminEmail(current.email),
    adminModeEnabled: false,
    adminLoadout: {},
    adminChestCount: 0,
    ownedItems: DEFAULT_ITEMS.map((item) => item.id),
    stats: {
      totalVp: 0,
      lifetimeVp: 0,
      bpBalance: 0,
      lifetimeBp: 0,
      chestKeys: 0,
      tier: 1,
      tierProgress: 0,
      streakDays: 0,
      multiplier: 1,
      tasksCompleted: 0,
      focusMinutes: 0,
      lastActivityDate: null,
    },
    counters: {
      task: 0,
      checklist: 0,
      project: 0,
      requirement: 0,
      subject: 9,
      habit: 0,
      focus: 0,
      chest: 0,
      transaction: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

const initialized = new Map<string, Promise<JsonObject>>();
async function ensureUser(uid: string) {
  let pending = initialized.get(uid);
  if (pending) return pending;
  pending = (async () => {
    const ref = userPath(uid);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      const defaults = userDefaults();
      const batch = writeBatch(firebaseDb);
      batch.set(ref, defaults);
      DEFAULT_SUBJECTS.forEach(([name, color], index) => {
        batch.set(childDoc(uid, "subjects", index + 1), {
          id: index + 1,
          userId: uid,
          name,
          color,
          archived: false,
          createdAt: now(),
        });
      });
      batch.set(doc(firebaseDb, "publicProfiles", uid), {
        id: uid,
        email: defaults.email,
        displayName: defaults.firstName,
        username: null,
        profileImageUrl: defaults.profileImageUrl,
        tier: 1,
        streakDays: 0,
        socialEnabled: false,
      });
      await batch.commit();
      return defaults;
    }
    const current = snapshot.data() as JsonObject;
    const patch: JsonObject = {
      email: firebaseAuth.currentUser?.email ?? current.email ?? null,
      isAdmin: adminEmail(firebaseAuth.currentUser?.email),
      updatedAt: now(),
    };
    await setDoc(ref, patch, { merge: true });
    return { ...current, ...patch };
  })();
  initialized.set(uid, pending);
  try {
    return await pending;
  } catch (error) {
    initialized.delete(uid);
    throw error;
  }
}

async function nextId(uid: string, kind: string) {
  const ref = userPath(uid);
  return runTransaction(firebaseDb, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const counters = (snapshot.data()?.counters ?? {}) as Record<
      string,
      number
    >;
    const id = (counters[kind] ?? 0) + 1;
    transaction.update(ref, { [`counters.${kind}`]: id, updatedAt: now() });
    return id;
  });
}

async function list(uid: string, name: string) {
  const snapshot = await getDocs(child(uid, name));
  return snapshot.docs.map((entry) => entry.data() as Stored);
}

async function find(uid: string, name: string, id: number) {
  const snapshot = await getDoc(childDoc(uid, name, id));
  return snapshot.exists() ? (snapshot.data() as Stored) : null;
}

function taskDefaults(uid: string, id: number, input: JsonObject) {
  const priority = ["critical", "high", "medium", "low"].includes(
    String(input.priority),
  )
    ? String(input.priority)
    : "medium";
  const vpValue =
    Number(input.vpValue) ||
    (priority === "critical"
      ? 25
      : priority === "high"
        ? 15
        : priority === "low"
          ? 5
          : 10);
  return clean({
    id,
    userId: uid,
    title: String(input.title ?? "")
      .trim()
      .slice(0, 160),
    description:
      typeof input.description === "string" ? input.description : null,
    status: typeof input.status === "string" ? input.status : "todo",
    priority,
    vpValue,
    dueDate:
      typeof input.dueDate === "string" && input.dueDate ? input.dueDate : null,
    startDate:
      typeof input.startDate === "string" && input.startDate
        ? input.startDate
        : null,
    calendarDate:
      typeof input.calendarDate === "string" && input.calendarDate
        ? input.calendarDate
        : typeof input.dueDate === "string"
          ? input.dueDate
          : null,
    projectId:
      Number.isInteger(Number(input.projectId)) && input.projectId !== null
        ? Number(input.projectId)
        : null,
    estimatedMinutes:
      Number.isFinite(Number(input.estimatedMinutes)) &&
      input.estimatedMinutes !== null
        ? Number(input.estimatedMinutes)
        : null,
    actualMinutes:
      Number.isFinite(Number(input.actualMinutes)) &&
      input.actualMinutes !== null
        ? Number(input.actualMinutes)
        : null,
    links: Array.isArray(input.links) ? input.links : [],
    notes: typeof input.notes === "string" ? input.notes : null,
    subject:
      typeof input.subject === "string" && input.subject.trim()
        ? input.subject.trim().slice(0, 50)
        : null,
    taskKind:
      typeof input.taskKind === "string" ? input.taskKind : "assignment",
    difficulty: Math.min(3, Math.max(1, Number(input.difficulty) || 2)),
    blocked: Boolean(input.blocked),
    organized: input.organized !== false,
    externalSource:
      typeof input.externalSource === "string" ? input.externalSource : null,
    externalId: typeof input.externalId === "string" ? input.externalId : null,
    externalUrl:
      typeof input.externalUrl === "string" ? input.externalUrl : null,
    externalCourseId:
      typeof input.externalCourseId === "string"
        ? input.externalCourseId
        : null,
    archived: Boolean(input.archived),
    completionAwardedAt: null,
    completedAt: null,
    createdAt: now(),
    checklistCount: 0,
    checklistCompleted: 0,
  });
}

async function updateStats(
  uid: string,
  updater: (
    stats: Record<string, number | string | null>,
  ) => Record<string, number | string | null>,
) {
  const ref = userPath(uid);
  return runTransaction(firebaseDb, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? userDefaults();
    const current = (data.stats ?? {}) as Record<
      string,
      number | string | null
    >;
    const stats = updater({ ...current });
    transaction.update(ref, { stats, updatedAt: now() });
    return stats;
  });
}

function awardNp(
  stats: Record<string, number | string | null>,
  amount: number,
): Record<string, number | string | null> {
  const progress = Number(stats.tierProgress ?? 0) + amount;
  return {
    ...stats,
    totalVp: Number(stats.totalVp ?? 0) + amount,
    lifetimeVp: Number(stats.lifetimeVp ?? 0) + amount,
    tier: Number(stats.tier ?? 1) + Math.floor(progress / 100),
    tierProgress: progress % 100,
  };
}

function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1)
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

const WEATHER = [
  "sunny",
  "sunny",
  "windy",
  "windy",
  "foggy",
  "stormy",
  "stormy",
  "rainbow",
] as const;
function forecastFor(
  uid: string,
  date: string,
  tasks: Stored[],
  habits: Stored[],
) {
  const roll = hash(`${uid}:${date}`) % 100;
  const weather =
    roll < 5
      ? "rainbow"
      : WEATHER[hash(`weather:${uid}:${date}`) % (WEATHER.length - 1)];
  const due = tasks.filter(
    (task) =>
      !task.archived &&
      task.status !== "completed" &&
      task.dueDate === date &&
      task.taskKind !== "test",
  );
  const activeHabits = habits.filter((habit) => habit.status === "active");
  const target = due[0] ?? activeHabits[0] ?? null;
  const targetKind = target ? ("vpReward" in target ? "habit" : "task") : null;
  const free = ECONOMY_ITEMS.filter(
    (item) => item.source === "store" && item.equipable,
  )[
    hash(`free:${uid}:${date}`) %
      ECONOMY_ITEMS.filter((item) => item.source === "store" && item.equipable)
        .length
  ];
  const copy = {
    sunny: [
      "Sunny",
      "Momentum is running warm.",
      "Every completed task earns 50% more NP today.",
    ],
    stormy: [
      "Thunder",
      target
        ? "One fair target is charged."
        : "The storm found no fair target.",
      target
        ? `Complete ${target.title} for a large bonus. Skipping it never costs you anything.`
        : "Your next completion earns a small weather bonus instead.",
    ],
    foggy: [
      "Fog",
      "The reward stays out of sight.",
      "Complete tasks normally. Nimbus will reveal the hidden bonus tomorrow.",
    ],
    windy: [
      "Tailwind",
      "BP is moving through the day.",
      "Task completions scatter small BP bonuses across your balance.",
    ],
    rainbow: [
      "Rainbow",
      "A free unlock appeared.",
      `${free?.name ?? "A Nimbus cosmetic"} is yours for opening Nimbus today.`,
    ],
  } as const;
  return {
    id: Number(date.replaceAll("-", "")),
    date,
    weather,
    name: copy[weather][0],
    headline: copy[weather][1],
    description: copy[weather][2],
    targetTaskId: targetKind === "task" ? (target?.id ?? null) : null,
    targetHabitId: targetKind === "habit" ? (target?.id ?? null) : null,
    targetKind,
    targetTitle: target ? String(target.title) : null,
    targetTaskTitle: targetKind === "task" ? String(target?.title) : null,
    freeItemId: weather === "rainbow" ? (free?.id ?? null) : null,
    freeItemName: weather === "rainbow" ? (free?.name ?? null) : null,
    taskCompletions: 0,
    rewardNp: 0,
    rewardBp: 0,
    boostPercent: 0,
    canReroll: true,
    createdAt: now(),
    revealedAt: null,
  };
}

async function getForecast(uid: string, date = dateKey()) {
  const ref = childDoc(uid, "forecasts", date);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) return snapshot.data() as JsonObject;
  const [tasks, habits] = await Promise.all([
    list(uid, "tasks"),
    list(uid, "habits"),
  ]);
  const forecast = forecastFor(uid, date, tasks, habits);
  await setDoc(ref, forecast);
  if (forecast.weather === "rainbow" && forecast.freeItemId) {
    const userRef = userPath(uid);
    await runTransaction(firebaseDb, async (transaction) => {
      const user = (await transaction.get(userRef)).data() ?? {};
      const owned = new Set((user.ownedItems ?? []) as string[]);
      owned.add(String(forecast.freeItemId));
      transaction.update(userRef, { ownedItems: [...owned], updatedAt: now() });
    });
  }
  return forecast;
}

async function applyForecastReward(
  uid: string,
  kind: "task" | "habit",
  id: number,
  baseNp: number,
) {
  const forecastRef = childDoc(uid, "forecasts", dateKey());
  const userRef = userPath(uid);
  return runTransaction(firebaseDb, async (transaction) => {
    const [forecastSnapshot, userSnapshot] = await Promise.all([
      transaction.get(forecastRef),
      transaction.get(userRef),
    ]);
    if (!forecastSnapshot.exists())
      return {
        triggered: false,
        weather: "sunny",
        bonusNp: 0,
        bonusBp: 0,
        hidden: false,
      };
    const forecast = forecastSnapshot.data();
    const stats = { ...(userSnapshot.data()?.stats ?? {}) } as Record<
      string,
      number | string | null
    >;
    const weather = String(forecast.weather);
    const matches =
      (kind === "task" && forecast.targetTaskId === id) ||
      (kind === "habit" && forecast.targetHabitId === id);
    const firstStorm = !forecast.rewardTriggered;
    let bonusNp = 0;
    let bonusBp = 0;
    let hidden = false;
    if (weather === "sunny") bonusNp = Math.max(1, Math.round(baseNp * 0.5));
    if (Number(forecast.boostPercent ?? 0) > 0)
      bonusNp += Math.max(
        1,
        Math.round((baseNp * Number(forecast.boostPercent)) / 100),
      );
    if (weather === "windy")
      bonusBp = 2 + (hash(`${uid}:${dateKey()}:${kind}:${id}`) % 7);
    if (weather === "foggy") {
      bonusBp = 5 + (hash(`fog:${uid}:${id}`) % 11);
      hidden = true;
    }
    if (
      weather === "stormy" &&
      firstStorm &&
      (matches || (!forecast.targetTaskId && !forecast.targetHabitId))
    )
      bonusNp = Math.max(20, baseNp * 3);
    const triggered = bonusNp > 0 || bonusBp > 0;
    if (triggered) {
      const next = awardNp(stats, bonusNp);
      next.bpBalance = Number(next.bpBalance ?? 0) + bonusBp;
      next.lifetimeBp = Number(next.lifetimeBp ?? 0) + bonusBp;
      transaction.update(userRef, { stats: next, updatedAt: now() });
      transaction.update(forecastRef, {
        rewardTriggered: forecast.rewardTriggered || weather === "stormy",
        taskCompletions: Number(forecast.taskCompletions ?? 0) + 1,
        rewardNp: Number(forecast.rewardNp ?? 0) + bonusNp,
        rewardBp: Number(forecast.rewardBp ?? 0) + bonusBp,
        updatedAt: now(),
      });
    }
    return {
      triggered,
      weather,
      bonusNp,
      bonusBp,
      hidden,
      targetKind: forecast.targetKind ?? null,
      targetTitle: forecast.targetTitle ?? null,
    };
  });
}

async function enrichedProjects(uid: string) {
  const [projects, tasks, requirements] = await Promise.all([
    list(uid, "projects"),
    list(uid, "tasks"),
    list(uid, "requirements"),
  ]);
  return projects.map((project) => {
    const related = tasks.filter(
      (task) => task.projectId === project.id && !task.archived,
    );
    const completed = related.filter(
      (task) => task.status === "completed",
    ).length;
    return {
      ...project,
      taskCount: related.length,
      completedTaskCount: completed,
      progress: related.length
        ? Math.round((completed / related.length) * 100)
        : 0,
      requirements: requirements
        .filter((item) => item.projectId === project.id)
        .map((item) => ({
          ...item,
          completed: item.taskId
            ? tasks.find((task) => task.id === item.taskId)?.status ===
              "completed"
            : item.completed,
        })),
    };
  });
}

async function rewardsResponse(uid: string, user: JsonObject) {
  const stats = (user.stats ?? {}) as Record<string, number>;
  const sandbox = Boolean(user.isAdmin && user.adminModeEnabled);
  const owned = new Set((user.ownedItems ?? []) as string[]);
  DEFAULT_ITEMS.forEach((item) => owned.add(item.id));
  if (sandbox) ECONOMY_ITEMS.forEach((item) => owned.add(item.id));
  const equipped: Record<string, string> = {};
  Object.entries(EQUIPPED_FIELDS).forEach(([kind, field]) => {
    equipped[kind] = String(user[field] ?? "none");
  });
  const items = ECONOMY_ITEMS.map((item) => ({
    ...item,
    lockReason: sandbox
      ? null
      : itemLockReason(
          item,
          Number(stats.tier ?? 1),
          Number(stats.streakDays ?? 0),
        ),
  }));
  const chests = await list(uid, "chests");
  const transactions = (await list(uid, "transactions"))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 20);
  return {
    adminModeEnabled: sandbox,
    bpBalance: sandbox ? 999_999_999 : Number(stats.bpBalance ?? 0),
    lifetimeBp: Number(stats.lifetimeBp ?? 0),
    chestKeys: sandbox ? 999_999_999 : Number(stats.chestKeys ?? 0),
    vpTotal: sandbox ? 999_999_999 : Number(stats.totalVp ?? 0),
    earnedVp: Number(stats.lifetimeVp ?? 0),
    owned: [...owned],
    newlyUnlockedTitles: [],
    achievementBpAwarded: 0,
    equipped,
    profileImageUrl: user.profileImageUrl ?? null,
    chests,
    unopenedChestCount: chests.filter((chest) => chest.status === "unopened")
      .length,
    items,
    transactions,
  };
}

async function handleTasks(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
) {
  if (path === "/api/tasks" && request.method === "GET") {
    const url = new URL(request.url);
    let tasks = (await list(uid, "tasks")).filter((task) => !task.archived);
    const checklist = await list(uid, "checklist");
    tasks = tasks.map((task) => {
      const items = checklist.filter((item) => item.taskId === task.id);
      return {
        ...task,
        checklistCount: items.length,
        checklistCompleted: items.filter((item) => item.completed).length,
      };
    });
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const projectId = Number(url.searchParams.get("projectId"));
    if (status) tasks = tasks.filter((task) => task.status === status);
    if (priority) tasks = tasks.filter((task) => task.priority === priority);
    if (projectId) tasks = tasks.filter((task) => task.projectId === projectId);
    const sortBy = url.searchParams.get("sortBy");
    tasks.sort((a, b) =>
      sortBy === "dueDate"
        ? String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999"))
        : String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    return json(tasks);
  }
  if (path === "/api/tasks" && request.method === "POST") {
    if (!String(input.title ?? "").trim())
      return json({ error: "Task title is required." }, 400);
    const id = await nextId(uid, "task");
    const task = taskDefaults(uid, id, input);
    await setDoc(childDoc(uid, "tasks", id), task);
    return json(task, 201);
  }
  if (path === "/api/tasks/bulk-reschedule" && request.method === "PATCH") {
    const ids = Array.isArray(input.taskIds) ? input.taskIds.map(Number) : [];
    const batch = writeBatch(firebaseDb);
    ids.forEach((id) =>
      batch.update(childDoc(uid, "tasks", id), {
        dueDate: input.newDate ?? null,
        calendarDate: input.newDate ?? null,
      }),
    );
    await batch.commit();
    return json({ updated: ids.length });
  }
  const match = path.match(/^\/api\/tasks\/(\d+)(?:\/(complete))?$/);
  if (!match) return null;
  const id = Number(match[1]);
  const existing = await find(uid, "tasks", id);
  if (!existing) return json({ error: "Task not found" }, 404);
  if (match[2] === "complete" && request.method === "POST") {
    if (String(existing.externalSource ?? "").startsWith("canvas"))
      return json({ error: "Canvas controls completion for this task." }, 409);
    if (existing.status === "completed")
      return json({ task: existing, vpAwarded: 0, bpAwarded: 0 });
    const completedAt = now();
    const base = Number(existing.vpValue ?? 10);
    const beforeUser = (await getDoc(userPath(uid))).data() ?? {};
    const priorStats = (beforeUser.stats ?? {}) as Record<
      string,
      number | string | null
    >;
    const today = dateKey();
    const last = String(priorStats.lastActivityDate ?? "");
    const completedToday = (await list(uid, "tasks")).some(
      (task) =>
        task.id !== id &&
        task.status === "completed" &&
        completedOnDate(task.completedAt, today),
    );
    const firstToday = last !== today && !completedToday;
    let streakDays = Number(priorStats.streakDays ?? 0);
    if (firstToday && last !== today) streakDays += 1;
    await updateDoc(childDoc(uid, "tasks", id), {
      status: "completed",
      completedAt,
      completionAwardedAt: completedAt,
    });
    const stats = await updateStats(uid, (current) => ({
      ...awardNp(current, base),
      tasksCompleted: Number(current.tasksCompleted ?? 0) + 1,
      streakDays,
      lastActivityDate: today,
    }));
    await setDoc(
      doc(firebaseDb, "publicProfiles", uid),
      { tier: stats.tier, streakDays },
      { merge: true },
    );
    const forecastReward = await applyForecastReward(uid, "task", id, base);
    if ([3, 10, 25, 50, 100].includes(Number(stats.tasksCompleted))) {
      const chestId = await nextId(uid, "chest");
      const rarity =
        Number(stats.tasksCompleted) >= 100
          ? "legendary"
          : Number(stats.tasksCompleted) >= 50
            ? "epic"
            : Number(stats.tasksCompleted) >= 25
              ? "rare"
              : "common";
      await setDoc(childDoc(uid, "chests", chestId), {
        id: chestId,
        sourceKey: `tasks:${stats.tasksCompleted}`,
        rarity,
        status: "unopened",
        rewardItemId: null,
        vpFallback: 0,
        bpReward: 0,
        chestKeysReward: 0,
        requiresKey: false,
        awardedAt: now(),
        openedAt: null,
      });
    }
    const task = {
      ...existing,
      status: "completed",
      completedAt,
      completionAwardedAt: completedAt,
    };
    return json({
      task,
      vpAwarded: base + forecastReward.bonusNp,
      bpAwarded: forecastReward.bonusBp,
      firstCompletionToday: firstToday,
      consecutiveMomentum: firstToday,
      streakDays,
      momentumRewards: [],
      forecastReward,
    });
  }
  if (request.method === "GET") return json(existing);
  if (request.method === "PATCH") {
    const allowed = [
      "title",
      "description",
      "status",
      "priority",
      "vpValue",
      "dueDate",
      "startDate",
      "calendarDate",
      "projectId",
      "estimatedMinutes",
      "actualMinutes",
      "links",
      "notes",
      "subject",
      "taskKind",
      "difficulty",
      "blocked",
      "organized",
      "archived",
    ];
    const changes = Object.fromEntries(
      allowed
        .filter((key) => Object.hasOwn(input, key))
        .map((key) => [key, input[key]]),
    );
    await updateDoc(childDoc(uid, "tasks", id), clean(changes));
    return json({ ...existing, ...changes });
  }
  if (request.method === "DELETE") {
    await deleteDoc(childDoc(uid, "tasks", id));
    return json(null, 204);
  }
  return null;
}

async function handleChecklist(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
) {
  const taskMatch = path.match(/^\/api\/tasks\/(\d+)\/checklist$/);
  if (taskMatch) {
    const taskId = Number(taskMatch[1]);
    if (request.method === "GET")
      return json(
        (await list(uid, "checklist")).filter((item) => item.taskId === taskId),
      );
    if (request.method === "POST") {
      const id = await nextId(uid, "checklist");
      const item = {
        id,
        taskId,
        title: String(input.title ?? "")
          .trim()
          .slice(0, 200),
        completed: false,
        createdAt: now(),
      };
      await setDoc(childDoc(uid, "checklist", id), item);
      return json(item, 201);
    }
    if (request.method === "DELETE") {
      const items = (await list(uid, "checklist")).filter(
        (item) => item.taskId === taskId,
      );
      const batch = writeBatch(firebaseDb);
      items.forEach((item) =>
        batch.delete(childDoc(uid, "checklist", item.id)),
      );
      await batch.commit();
      return json(null, 204);
    }
  }
  const itemMatch = path.match(/^\/api\/checklist\/(\d+)$/);
  if (!itemMatch) return null;
  const id = Number(itemMatch[1]);
  const item = await find(uid, "checklist", id);
  if (!item) return json({ error: "Checklist item not found" }, 404);
  if (request.method === "PATCH") {
    const changes = clean({ title: input.title, completed: input.completed });
    await updateDoc(childDoc(uid, "checklist", id), changes);
    return json({ ...item, ...changes });
  }
  if (request.method === "DELETE") {
    await deleteDoc(childDoc(uid, "checklist", id));
    return json(null, 204);
  }
  return null;
}

async function handlePlanning(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
) {
  if (path === "/api/subjects" && request.method === "GET")
    return json(
      (await list(uid, "subjects"))
        .filter((item) => !item.archived)
        .sort((a, b) => a.id - b.id),
    );
  if (path === "/api/subjects" && request.method === "POST") {
    const name = String(input.name ?? "")
      .trim()
      .slice(0, 40);
    if (!name) return json({ error: "Subject name is required." }, 400);
    const id = await nextId(uid, "subject");
    const item = {
      id,
      userId: uid,
      name,
      color: /^#[0-9a-f]{6}$/i.test(String(input.color))
        ? input.color
        : "#2563eb",
      archived: false,
      createdAt: now(),
    };
    await setDoc(childDoc(uid, "subjects", id), item);
    return json(item, 201);
  }
  const subjectMatch = path.match(/^\/api\/subjects\/(\d+)$/);
  if (subjectMatch) {
    const id = Number(subjectMatch[1]);
    const existing = await find(uid, "subjects", id);
    if (!existing) return json({ error: "Subject not found." }, 404);
    if (request.method === "PATCH") {
      const color = /^#[0-9a-f]{6}$/i.test(String(input.color))
        ? input.color
        : undefined;
      const changes = clean({
        name: input.name,
        color,
        archived: input.archived,
      });
      const oldName = String(existing.name);
      const newName =
        typeof changes.name === "string" ? changes.name.trim() : oldName;
      const batch = writeBatch(firebaseDb);
      batch.update(childDoc(uid, "subjects", id), {
        ...changes,
        ...(changes.name ? { name: newName } : {}),
      });
      if (newName !== oldName) {
        (await list(uid, "tasks"))
          .filter(
            (task) => normalizedName(task.subject) === normalizedName(oldName),
          )
          .forEach((task) =>
            batch.update(childDoc(uid, "tasks", task.id), {
              subject: newName,
              organized: true,
            }),
          );
        (await list(uid, "projects"))
          .filter(
            (project) =>
              normalizedName(project.subject) === normalizedName(oldName),
          )
          .forEach((project) =>
            batch.update(childDoc(uid, "projects", project.id), {
              subject: newName,
            }),
          );
      }
      await batch.commit();
      return json({ ...existing, ...changes, name: newName });
    }
    if (request.method === "DELETE") {
      const oldName = String(existing.name);
      const batch = writeBatch(firebaseDb);
      (await list(uid, "tasks"))
        .filter(
          (task) => normalizedName(task.subject) === normalizedName(oldName),
        )
        .forEach((task) =>
          batch.update(childDoc(uid, "tasks", task.id), {
            subject: "Other",
            organized: true,
          }),
        );
      (await list(uid, "projects"))
        .filter(
          (project) =>
            normalizedName(project.subject) === normalizedName(oldName),
        )
        .forEach((project) =>
          batch.update(childDoc(uid, "projects", project.id), {
            subject: "Other",
          }),
        );
      batch.delete(childDoc(uid, "subjects", id));
      await batch.commit();
      return json(null, 204);
    }
  }
  if (path === "/api/inbox/capture" && request.method === "POST") {
    if (!String(input.title ?? "").trim())
      return json({ error: "Task title is required." }, 400);
    const id = await nextId(uid, "task");
    const task = taskDefaults(uid, id, {
      ...input,
      organized: false,
      calendarDate: input.dueDate ?? null,
    });
    await setDoc(childDoc(uid, "tasks", id), task);
    return json(task, 201);
  }
  const organize = path.match(/^\/api\/inbox\/(\d+)\/organize$/);
  if (organize && request.method === "PATCH") {
    const id = Number(organize[1]);
    await updateDoc(childDoc(uid, "tasks", id), { organized: true });
    return json(await find(uid, "tasks", id));
  }
  if (path === "/api/recommendations/next" && request.method === "GET") {
    const url = new URL(request.url);
    const minutes = Math.min(
      60,
      Math.max(10, Number(url.searchParams.get("minutes")) || 30),
    );
    const energy = (
      ["low", "medium", "high"].includes(String(url.searchParams.get("energy")))
        ? url.searchParams.get("energy")
        : "medium"
    ) as RecommendationEnergy;
    const tasks = (await list(uid, "tasks")).filter(
      (task) => !task.archived && task.status !== "completed" && !task.blocked,
    );
    const ranked = tasks
      .map((task) => ({
        task,
        ranking: scoreTaskRecommendation(task as never, {
          minutes,
          energy,
          today: dateKey(),
        }),
      }))
      .filter((entry) => entry.ranking.eligible)
      .sort((a, b) => b.ranking.score - a.ranking.score);
    const best = ranked[0];
    if (!best)
      return json({
        recommendation: null,
        reason: tasks.length
          ? `No unblocked task can be finished in ${minutes} minutes at ${energy} energy.`
          : "Your active task list is clear.",
        fit: null,
      });
    return json({
      recommendation: best.task,
      reason: `${best.task.title} is the strongest fit. It should fit in about ${best.ranking.duration} minutes and matches ${energy} energy as ${best.ranking.workload}.`,
      fit: {
        requestedMinutes: minutes,
        estimatedMinutes: best.ranking.duration,
        energy,
        workload: best.ranking.workload,
        canFinish: best.ranking.canFinish,
        priority: best.task.priority,
        dueInDays: best.ranking.days,
      },
    });
  }
  if (path === "/api/quick-capture/preview" || path === "/api/quick-capture") {
    const text = String(input.text ?? "").trim();
    if (!text) return json({ error: "Enter a task to create." }, 400);
    const [projects, subjects] = await Promise.all([
      enrichedProjects(uid),
      list(uid, "subjects"),
    ]);
    const parsed = parseQuickCapture(
      text,
      projects.map((p) => ({ id: p.id, name: String((p as Stored).name) })),
      subjects.map((s) => ({ id: s.id, name: String(s.name) })),
      dateKey(),
    );
    if (path.endsWith("preview")) return json(parsed);
    const id = await nextId(uid, "task");
    const task = taskDefaults(uid, id, {
      title: parsed.title,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      calendarDate: parsed.dueDate,
      description: parsed.time ? `Time: ${parsed.time}` : null,
      notes: parsed.time ? `Time: ${parsed.time}` : null,
      projectId: parsed.projectId,
      subject: parsed.subject ?? input.contextSubject,
      estimatedMinutes: parsed.estimatedMinutes,
      organized: Boolean(
        parsed.projectId || parsed.subject || input.contextSubject,
      ),
      taskKind: ["test", "quiz", "assignment", "task"].includes(
        String(input.contextTaskKind ?? ""),
      )
        ? String(input.contextTaskKind)
        : "assignment",
    });
    const batch = writeBatch(firebaseDb);
    batch.set(childDoc(uid, "tasks", id), task);
    const checklist: Stored[] = [];
    for (const title of parsed.checklist) {
      const checklistId = await nextId(uid, "checklist");
      const item = {
        id: checklistId,
        taskId: id,
        title,
        completed: false,
        createdAt: now(),
      };
      checklist.push(item);
      batch.set(childDoc(uid, "checklist", checklistId), item);
    }
    await batch.commit();
    return json(
      {
        task: { ...task, checklistCount: checklist.length },
        checklist,
        parsed,
      },
      201,
    );
  }
  return null;
}

async function handleProjects(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
) {
  if (path === "/api/projects" && request.method === "GET")
    return json(await enrichedProjects(uid));
  if (path === "/api/projects" && request.method === "POST") {
    const name = String(input.name ?? "")
      .trim()
      .slice(0, 100);
    if (!name) return json({ error: "Project name is required." }, 400);
    const id = await nextId(uid, "project");
    const project = {
      id,
      userId: uid,
      name,
      color: input.color ?? "#2563eb",
      type: "project",
      description: input.description ?? null,
      subject: input.subject ?? null,
      dueDate: input.dueDate ?? null,
      status: input.status ?? "active",
      priority: input.priority ?? "medium",
      notes: input.notes ?? null,
      rubric: input.rubric ?? null,
      submissionLink: input.submissionLink ?? null,
      gradeWeight: input.gradeWeight ?? null,
      archived: false,
      createdAt: now(),
      taskCount: 0,
      completedTaskCount: 0,
      progress: 0,
      requirements: [],
    };
    await setDoc(childDoc(uid, "projects", id), project);
    return json(project, 201);
  }
  const requirement = path.match(
    /^\/api\/projects\/(\d+)\/requirements(?:\/(\d+))?$/,
  );
  if (requirement) {
    const projectId = Number(requirement[1]);
    const project = await find(uid, "projects", projectId);
    if (!project) return json({ error: "Project not found." }, 404);
    if (!requirement[2] && request.method === "POST") {
      const id = await nextId(uid, "requirement");
      const taskId = await nextId(uid, "task");
      const task = taskDefaults(uid, taskId, {
        title: input.title,
        projectId,
        subject: project.subject,
        priority: project.priority,
        dueDate: input.dueDate ?? project.dueDate,
        taskKind: input.kind === "milestone" ? "project" : "assignment",
      });
      const item = {
        id,
        projectId,
        title: String(input.title ?? "").trim(),
        completed: false,
        kind: input.kind === "milestone" ? "milestone" : "requirement",
        dueDate: input.dueDate ?? null,
        taskId,
        createdAt: now(),
      };
      const batch = writeBatch(firebaseDb);
      batch.set(childDoc(uid, "tasks", taskId), task);
      batch.set(childDoc(uid, "requirements", id), item);
      await batch.commit();
      return json(item, 201);
    }
    if (requirement[2] && request.method === "PATCH") {
      const id = Number(requirement[2]);
      await updateDoc(childDoc(uid, "requirements", id), {
        completed: Boolean(input.completed),
      });
      const item = await find(uid, "requirements", id);
      if (item?.taskId)
        await updateDoc(childDoc(uid, "tasks", Number(item.taskId)), {
          status: input.completed ? "completed" : "todo",
          completedAt: input.completed ? now() : null,
        });
      return json({ ...item, completed: Boolean(input.completed) });
    }
  }
  const match = path.match(/^\/api\/projects\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  const existing = await find(uid, "projects", id);
  if (!existing) return json({ error: "Project not found." }, 404);
  if (request.method === "PATCH") {
    const changes = clean(input);
    await updateDoc(childDoc(uid, "projects", id), changes);
    return json({ ...existing, ...changes });
  }
  if (request.method === "DELETE") {
    await deleteDoc(childDoc(uid, "projects", id));
    return json(null, 204);
  }
  return null;
}

async function handleHabitsAndFocus(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
) {
  if (path === "/api/daily-habits" && request.method === "GET") {
    const completions = await list(uid, "habitCompletions");
    return json(
      (await list(uid, "habits"))
        .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
        .map((habit) => ({
          ...habit,
          daysOfWeek: Array.isArray(habit.daysOfWeek)
            ? habit.daysOfWeek
            : [0, 1, 2, 3, 4, 5, 6],
          completedToday: completions.some(
            (entry) =>
              entry.habitId === habit.id &&
              entry.completedDate === dateKey() &&
              entry.completed,
          ),
          recentCompletions: completions
            .filter((entry) => entry.habitId === habit.id && entry.completed)
            .map((entry) => entry.completedDate)
            .slice(-30),
        })),
    );
  }
  if (path === "/api/daily-habits" && request.method === "POST") {
    const id = await nextId(uid, "habit");
    const current = await list(uid, "habits");
    const habit = {
      id,
      userId: uid,
      title: String(input.title ?? "")
        .trim()
        .slice(0, 100),
      daysOfWeek: Array.isArray(input.daysOfWeek)
        ? input.daysOfWeek
        : [0, 1, 2, 3, 4, 5, 6],
      reminderTime: input.reminderTime ?? null,
      icon: input.icon ?? "target",
      vpReward: Math.min(25, Math.max(1, Number(input.vpReward) || 5)),
      status: "active",
      sortOrder: current.length,
      createdAt: now(),
      completedToday: false,
      recentCompletions: [],
    };
    await setDoc(childDoc(uid, "habits", id), habit);
    return json(habit, 201);
  }
  const habit = path.match(/^\/api\/daily-habits\/(\d+)(?:\/(toggle))?$/);
  if (habit) {
    const id = Number(habit[1]);
    const existing = await find(uid, "habits", id);
    if (!existing) return json({ error: "Habit not found." }, 404);
    if (habit[2] && request.method === "POST") {
      const completionRef = childDoc(
        uid,
        "habitCompletions",
        `${id}-${dateKey()}`,
      );
      const prior = await getDoc(completionRef);
      const completed = !prior.exists() || !prior.data().completed;
      let awarded = 0;
      if (completed && (!prior.exists() || !prior.data().vpAwarded)) {
        awarded = Number(existing.vpReward ?? 5);
        await updateStats(uid, (stats) => awardNp(stats, awarded));
      }
      await setDoc(completionRef, {
        id: Number(`${id}${dateKey().replaceAll("-", "")}`),
        habitId: id,
        completedDate: dateKey(),
        completed,
        vpAwarded: completed || prior.data()?.vpAwarded,
        createdAt: prior.data()?.createdAt ?? now(),
      });
      const forecastReward = completed
        ? await applyForecastReward(uid, "habit", id, awarded)
        : {
            triggered: false,
            weather: "sunny",
            bonusNp: 0,
            bonusBp: 0,
            hidden: false,
          };
      return json({
        completedToday: completed,
        vpAwarded: awarded + forecastReward.bonusNp,
        forecastReward,
      });
    }
    if (request.method === "PATCH") {
      await updateDoc(childDoc(uid, "habits", id), { status: input.status });
      return json({ ...existing, status: input.status });
    }
    if (request.method === "DELETE") {
      await deleteDoc(childDoc(uid, "habits", id));
      return json(null, 204);
    }
  }
  if (path === "/api/focus-sessions" && request.method === "GET")
    return json(
      (await list(uid, "focusSessions"))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 50),
    );
  if (path === "/api/focus-sessions" && request.method === "POST") {
    const id = await nextId(uid, "focus");
    const session = {
      id,
      userId: uid,
      durationMinutes: Number(input.durationMinutes),
      status: "active",
      vpAwarded: null,
      startedAt: now(),
      completedAt: null,
      createdAt: now(),
    };
    await setDoc(childDoc(uid, "focusSessions", id), session);
    return json(session, 201);
  }
  const focus = path.match(/^\/api\/focus-sessions\/(\d+)\/complete$/);
  if (focus && request.method === "POST") {
    const id = Number(focus[1]);
    const session = await find(uid, "focusSessions", id);
    if (!session) return json({ error: "Focus session not found" }, 404);
    if (session.status === "completed") return json(session);
    const minutes = Number(session.durationMinutes);
    const vpAwarded = minutes + (minutes >= 90 ? 20 : minutes >= 50 ? 10 : 0);
    const completed = {
      ...session,
      status: "completed",
      completedAt: now(),
      vpAwarded,
    };
    await updateDoc(childDoc(uid, "focusSessions", id), completed);
    await updateStats(uid, (stats) => ({
      ...awardNp(stats, vpAwarded),
      focusMinutes: Number(stats.focusMinutes ?? 0) + minutes,
      multiplier: Math.min(
        2,
        Number(stats.multiplier ?? 1) + (minutes >= 50 ? 0.1 : 0),
      ),
    }));
    return json(completed);
  }
  return null;
}

async function handleUserAndRewards(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
  user: JsonObject,
) {
  const sandbox = Boolean(user.isAdmin && user.adminModeEnabled);
  if (path === "/api/user/stats" && request.method === "GET") {
    const stats = user.stats as Record<string, number>;
    return json({
      ...stats,
      totalVp: sandbox ? 999_999_999 : stats.totalVp,
      tier: sandbox ? 99 : stats.tier,
      tierProgress: sandbox ? 100 : stats.tierProgress,
      multiplier: sandbox ? 9.9 : stats.multiplier,
      adminModeEnabled: sandbox,
    });
  }
  if (path === "/api/user/preferences" && request.method === "GET") {
    const keys = [
      "mainGoal",
      "onboardingCompleted",
      "advancedFeaturesEnabled",
      "tutorialCompleted",
      "tutorialStep",
      "socialEnabled",
      "timezone",
      "calendarView",
      "completionSoundEnabled",
    ];
    return json(Object.fromEntries(keys.map((key) => [key, user[key]])));
  }
  if (path === "/api/user/preferences" && request.method === "PATCH") {
    const keys = [
      "mainGoal",
      "onboardingCompleted",
      "advancedFeaturesEnabled",
      "tutorialCompleted",
      "tutorialStep",
      "socialEnabled",
      "timezone",
      "calendarView",
      "completionSoundEnabled",
    ];
    const changes = Object.fromEntries(
      keys
        .filter((key) => Object.hasOwn(input, key))
        .map((key) => [key, input[key]]),
    );
    await updateDoc(userPath(uid), { ...changes, updatedAt: now() });
    await setDoc(
      doc(firebaseDb, "publicProfiles", uid),
      { socialEnabled: changes.socialEnabled ?? user.socialEnabled },
      { merge: true },
    );
    return json({ ...user, ...changes });
  }
  if (path === "/api/user/profile" && request.method === "PATCH") {
    await updateDoc(userPath(uid), {
      profileImageUrl: input.profileImageUrl ?? null,
      updatedAt: now(),
    });
    await setDoc(
      doc(firebaseDb, "publicProfiles", uid),
      { profileImageUrl: input.profileImageUrl ?? null },
      { merge: true },
    );
    return json({ profileImageUrl: input.profileImageUrl ?? null });
  }
  if (path === "/api/admin" && request.method === "GET")
    return json({
      isAdmin: Boolean(user.isAdmin),
      adminModeEnabled: sandbox,
      adminChestCount: Number(user.adminChestCount ?? 0),
    });
  if (path === "/api/admin/mode" && request.method === "PATCH") {
    if (!user.isAdmin)
      return json({ error: "Admin access is unavailable." }, 403);
    await updateDoc(userPath(uid), {
      adminModeEnabled: Boolean(input.enabled),
      adminLoadout: input.enabled ? (user.adminLoadout ?? {}) : {},
      adminChestCount: input.enabled ? (user.adminChestCount ?? 0) : 0,
    });
    return json({
      isAdmin: true,
      adminModeEnabled: Boolean(input.enabled),
      adminChestCount: input.enabled ? Number(user.adminChestCount ?? 0) : 0,
    });
  }
  if (path === "/api/admin/chests" && request.method === "POST") {
    if (!sandbox) return json({ error: "Enable admin mode first." }, 403);
    const chestId = await nextId(uid, "chest");
    await setDoc(childDoc(uid, "chests", chestId), {
      id: chestId,
      sourceKey: `admin:${Date.now()}`,
      rarity: "legendary",
      status: "unopened",
      rewardItemId: null,
      vpFallback: 0,
      bpReward: 0,
      chestKeysReward: 0,
      requiresKey: false,
      awardedAt: now(),
      openedAt: null,
    });
    await updateDoc(userPath(uid), { adminChestCount: 1 });
    return json({ adminChestCount: 1 });
  }
  if (path === "/api/rewards/forecast" && request.method === "GET") {
    const forecast = (await getForecast(uid)) as JsonObject;
    const stats = user.stats as Record<string, number>;
    const returningDay =
      dateKey(new Date(String(user.createdAt ?? now()))) !== dateKey();
    const eligible =
      Boolean(user.tutorialCompleted) &&
      Number(stats.tasksCompleted ?? 0) >= 3 &&
      returningDay;
    const shouldReveal = eligible && !forecast.revealedAt;
    if (shouldReveal)
      await setDoc(
        childDoc(uid, "forecasts", dateKey()),
        { revealedAt: now() },
        { merge: true },
      );
    return json({
      eligible,
      requirements: eligible
        ? null
        : {
            tutorial: Boolean(user.tutorialCompleted),
            tasksCompleted: Number(stats.tasksCompleted ?? 0),
            returningDay,
          },
      today: eligible ? forecast : null,
      shouldReveal,
      yesterdayReveal: null,
      tomorrow: forecast.tomorrowForecast ?? null,
      weeklyReport: null,
    });
  }
  if (path === "/api/rewards" && request.method === "GET")
    return json(await rewardsResponse(uid, user));
  const purchase = path.match(/^\/api\/rewards\/([^/]+)\/purchase$/);
  if (purchase && request.method === "POST") {
    const item = ECONOMY_ITEMS.find(
      (candidate) => candidate.id === purchase[1],
    );
    if (!item) return json({ error: "Reward not found." }, 404);
    const price = sandbox ? 0 : item.priceBp;
    const stats = { ...(user.stats as Record<string, number>) };
    if (Number(stats.bpBalance ?? 0) < price)
      return json({ error: "Not enough BP." }, 400);
    stats.bpBalance = Number(stats.bpBalance ?? 0) - price;
    const owned = new Set((user.ownedItems ?? []) as string[]);
    if (!item.repeatable) owned.add(item.id);
    if (item.kind === "chest_key")
      stats.chestKeys = Number(stats.chestKeys ?? 0) + 1;
    if (item.id === "weather-reroll") {
      const ref = childDoc(uid, "forecasts", dateKey());
      const prior = await getForecast(uid);
      const tasks = await list(uid, "tasks");
      const habits = await list(uid, "habits");
      const next = forecastFor(
        `${uid}:${Date.now()}`,
        dateKey(),
        tasks,
        habits,
      );
      await setDoc(ref, {
        ...next,
        id: prior.id,
        rerolledAt: now(),
        canReroll: false,
      });
    }
    if (item.id === "tailwind-boost") {
      await setDoc(
        childDoc(uid, "forecasts", dateKey()),
        { boostPercent: 25 },
        { merge: true },
      );
    }
    if (item.id === "tomorrow-peek") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const next = await getForecast(uid, dateKey(tomorrow));
      await setDoc(
        childDoc(uid, "forecasts", dateKey()),
        { tomorrowForecast: next },
        { merge: true },
      );
    }
    await updateDoc(userPath(uid), {
      stats,
      ownedItems: [...owned],
      updatedAt: now(),
    });
    return json({
      bpBalance: sandbox ? 999_999_999 : stats.bpBalance,
      chestKeys: sandbox ? 999_999_999 : stats.chestKeys,
      item,
    });
  }
  const equip = path.match(/^\/api\/rewards\/([^/]+)\/equip$/);
  if (equip && request.method === "POST") {
    const item = ECONOMY_ITEMS.find((candidate) => candidate.id === equip[1]);
    if (!item?.equipable)
      return json({ error: "That item cannot be equipped." }, 400);
    const owned = new Set((user.ownedItems ?? []) as string[]);
    if (!sandbox && !owned.has(item.id))
      return json({ error: "Unlock this item first." }, 403);
    const field = EQUIPPED_FIELDS[item.kind];
    if (!field) return json({ error: "That item cannot be equipped." }, 400);
    await updateDoc(userPath(uid), { [field]: item.id, updatedAt: now() });
    return json({ equipped: { [item.kind]: item.id } });
  }
  const unequip = path.match(/^\/api\/rewards\/equipped\/([^/]+)$/);
  if (unequip && request.method === "DELETE") {
    const field = EQUIPPED_FIELDS[unequip[1]];
    if (field)
      await updateDoc(userPath(uid), {
        [field]: unequip[1] === "completion_effect" ? "clean-confetti" : "none",
        updatedAt: now(),
      });
    return json({
      equipped: {
        [unequip[1]]:
          unequip[1] === "completion_effect" ? "clean-confetti" : "none",
      },
    });
  }
  const openChest = path.match(/^\/api\/rewards\/chests\/(\d+)\/open$/);
  if (openChest && request.method === "POST") {
    const id = Number(openChest[1]);
    const chest = await find(uid, "chests", id);
    if (!chest || chest.status !== "unopened")
      return json({ error: "Chest is unavailable." }, 404);
    const candidates = ECONOMY_ITEMS.filter(
      (item) => item.source === "chest" && item.chestRarity === chest.rarity,
    );
    const reward =
      candidates[
        hash(`${uid}:${id}:${chest.awardedAt}`) % Math.max(1, candidates.length)
      ] ?? null;
    const stats = { ...(user.stats as Record<string, number>) };
    const owned = new Set((user.ownedItems ?? []) as string[]);
    let bpReward = 0;
    if (reward) owned.add(reward.id);
    else {
      bpReward = Number(
        chest.rarity === "legendary"
          ? 500
          : chest.rarity === "epic"
            ? 220
            : chest.rarity === "rare"
              ? 100
              : 45,
      );
      stats.bpBalance = Number(stats.bpBalance ?? 0) + bpReward;
      stats.lifetimeBp = Number(stats.lifetimeBp ?? 0) + bpReward;
    }
    const opened = {
      ...chest,
      status: "opened",
      rewardItemId: reward?.id ?? null,
      bpReward,
      openedAt: now(),
    };
    const batch = writeBatch(firebaseDb);
    batch.set(childDoc(uid, "chests", id), opened);
    batch.update(userPath(uid), {
      stats,
      ownedItems: [...owned],
      adminChestCount: 0,
      updatedAt: now(),
    });
    await batch.commit();
    return json({
      chest: opened,
      reward,
      bpReward,
      chestKeysReward: 0,
      initialRarity: chest.rarity,
      finalRarity: chest.rarity,
      upgraded: false,
    });
  }
  if (path === "/api/rewards/chests/key/use" && request.method === "POST")
    return json({
      ok: true,
      chestKeys: Number((user.stats as Record<string, number>).chestKeys ?? 0),
    });
  return null;
}

async function handleDashboard(
  uid: string,
  request: Request,
  path: string,
  user: JsonObject,
) {
  if (request.method !== "GET") return null;
  const tasks = await list(uid, "tasks");
  const active = tasks.filter(
    (task) => !task.archived && task.status !== "completed",
  );
  const completed = tasks.filter((task) => task.status === "completed");
  const stats = user.stats as Record<string, number>;
  if (path === "/api/dashboard/overview") {
    const today = dateKey();
    return json({
      totalTasks: tasks.length,
      todoCount: tasks.filter((task) => task.status === "todo").length,
      inProgressCount: tasks.filter((task) => task.status === "in_progress")
        .length,
      completedCount: completed.length,
      criticalCount: active.filter((task) => task.priority === "critical")
        .length,
      todayTasks: tasks.filter(
        (task) => task.calendarDate === today || task.dueDate === today,
      ),
      upcomingTasks: active
        .filter((task) => task.dueDate && String(task.dueDate) > today)
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
        .slice(0, 5),
      userStats: {
        totalVp: stats.totalVp ?? 0,
        tier: stats.tier ?? 1,
        tierProgress: stats.tierProgress ?? 0,
        streakDays: stats.streakDays ?? 0,
        multiplier: stats.multiplier ?? 1,
        tasksCompleted: stats.tasksCompleted ?? 0,
        focusMinutes: stats.focusMinutes ?? 0,
      },
    });
  }
  if (path === "/api/analytics/summary")
    return json({
      totalVp: stats.totalVp ?? 0,
      tier: stats.tier ?? 1,
      streakDays: stats.streakDays ?? 0,
      tasksCompleted: stats.tasksCompleted ?? completed.length,
      focusMinutes: stats.focusMinutes ?? 0,
      avgDailyVp: Math.round(
        Number(stats.totalVp ?? 0) / Math.max(1, Number(stats.streakDays ?? 0)),
      ),
      topPriorityCompleted: completed.filter(
        (task) => task.priority === "critical",
      ).length,
    });
  if (path === "/api/analytics/velocity") {
    const days = [];
    for (let offset = 29; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const key = dateKey(day);
      const dayTasks = completed.filter((task) =>
        String(task.completedAt ?? "").startsWith(key),
      );
      days.push({
        date: key,
        vp: dayTasks.reduce((sum, task) => sum + Number(task.vpValue ?? 10), 0),
        tasksCompleted: dayTasks.length,
      });
    }
    return json(days);
  }
  if (path === "/api/analytics/milestones") return json([]);
  if (path === "/api/analytics/insights")
    return json([
      {
        type: "tier",
        text: `You are ${100 - Number(stats.tierProgress ?? 0)} NP away from your next tier.`,
        sampleSize: 1,
      },
    ]);
  return null;
}

function weekStartKey() {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return dateKey(date);
}
async function handleWeeklyReview(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
  user: JsonObject,
) {
  if (!path.startsWith("/api/weekly-review")) return null;
  const tasks = await list(uid, "tasks");
  const sessions = await list(uid, "focusSessions");
  const weekStart = weekStartKey();
  const weekEnd = new Date(`${weekStart}T12:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const endKey = dateKey(weekEnd);
  const completed = tasks.filter(
    (task) =>
      task.status === "completed" &&
      String(task.completedAt ?? "").slice(0, 10) >= weekStart &&
      String(task.completedAt ?? "").slice(0, 10) < endKey,
  );
  const active = tasks.filter(
    (task) => task.status !== "completed" && !task.archived,
  );
  const review = await getDoc(childDoc(uid, "weeklyReviews", weekStart));
  if (request.method === "GET")
    return json({
      weekStart,
      completed,
      overdue: active.filter(
        (task) => task.dueDate && String(task.dueDate) < dateKey(),
      ),
      dueNextWeek: active.filter(
        (task) => task.dueDate && String(task.dueDate) >= endKey,
      ),
      focusMinutes: sessions
        .filter(
          (session) =>
            session.status === "completed" &&
            String(session.completedAt ?? "").slice(0, 10) >= weekStart,
        )
        .reduce(
          (sum, session) => sum + Number(session.durationMinutes ?? 0),
          0,
        ),
      vpEarned: completed.reduce(
        (sum, task) => sum + Number(task.vpValue ?? 10),
        0,
      ),
      streakDays: Number(
        (user.stats as Record<string, number>).streakDays ?? 0,
      ),
      projects: await enrichedProjects(uid),
      inboxCount: active.filter((task) => !task.organized).length,
      unfinished: active,
      completedReview: review.exists(),
      reviewRewards: { vp: 40, bp: 35 },
      review: review.exists() ? review.data() : null,
    });
  if (request.method === "POST" && path.endsWith("/complete")) {
    if (review.exists())
      return json({ awarded: 0, bpAwarded: 0, alreadyCompleted: true });
    const receipt = {
      id: Number(weekStart.replaceAll("-", "")),
      userId: uid,
      weekStart,
      topPriorities: Array.isArray(input.topPriorities)
        ? input.topPriorities.slice(0, 3)
        : [],
      focusGoalMinutes: Math.min(
        1200,
        Math.max(0, Number(input.focusGoalMinutes) || 0),
      ),
      vpAwarded: 40,
      bpAwarded: 35,
      completedAt: now(),
    };
    await setDoc(childDoc(uid, "weeklyReviews", weekStart), receipt);
    await updateStats(uid, (stats) => {
      const next = awardNp(stats, 40);
      next.bpBalance = Number(next.bpBalance ?? 0) + 35;
      next.lifetimeBp = Number(next.lifetimeBp ?? 0) + 35;
      return next;
    });
    return json({ awarded: 40, bpAwarded: 35, alreadyCompleted: false });
  }
  return null;
}

function calendarDate(value: string | undefined) {
  if (!value) return null;
  if (/^\d{8}$/.test(value))
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString("en-CA");
}

async function importCalendarEvents(
  uid: string,
  events: Array<JsonObject>,
  calendarName: string,
) {
  const tasks = await list(uid, "tasks");
  const existing = new Map(
    tasks
      .filter((task) => task.externalSource === "canvas_calendar")
      .map((task) => [String(task.externalId), task]),
  );
  let created = 0;
  let updated = 0;
  const batch = writeBatch(firebaseDb);
  for (const event of events) {
    const externalId = String(event.id ?? "");
    const title = String(event.summary ?? "Untitled Canvas item")
      .trim()
      .slice(0, 160);
    if (!externalId || !title) continue;
    const start = (event.start ?? {}) as JsonObject;
    const dueDate = calendarDate(String(start.dateTime ?? start.date ?? ""));
    const prior = existing.get(externalId);
    const changes = {
      title,
      dueDate,
      calendarDate: dueDate,
      subject: calendarName,
      externalUrl: event.htmlLink ?? null,
      externalLastSeenAt: now(),
      archived: false,
    };
    if (prior) {
      batch.update(childDoc(uid, "tasks", prior.id), changes);
      updated += 1;
    } else {
      const id = await nextId(uid, "task");
      batch.set(
        childDoc(uid, "tasks", id),
        taskDefaults(uid, id, {
          ...changes,
          externalSource: "canvas_calendar",
          externalId,
          taskKind: /\b(test|exam|quiz)\b/i.test(title) ? "test" : "assignment",
          organized: true,
        }),
      );
      created += 1;
    }
  }
  await batch.commit();
  return {
    newTasks: created,
    updatedTasks: updated,
    completedTasks: 0,
    archivedItems: 0,
    calendarEvents: events.length,
    projectSuggestions: 0,
    errors: 0,
  };
}

function unfoldIcs(text: string) {
  return text.replace(/\r?\n[ \t]/g, "");
}
function parseIcs(text: string) {
  return unfoldIcs(text)
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((chunk) => chunk.split("END:VEVENT")[0])
    .map((chunk) => {
      const fields = Object.fromEntries(
        chunk.split(/\r?\n/).map((line) => {
          const separator = line.indexOf(":");
          if (separator < 0) return ["", ""];
          return [
            line.slice(0, separator).split(";")[0],
            line
              .slice(separator + 1)
              .replace(/\\n/g, "\n")
              .replace(/\\,/g, ","),
          ];
        }),
      );
      return {
        id: fields.UID,
        summary: fields.SUMMARY,
        htmlLink: fields.URL ?? null,
        start: { date: calendarDate(fields.DTSTART) },
      } as JsonObject;
    })
    .filter((event) => event.id && event.summary);
}

async function handleCanvas(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
  user: JsonObject,
) {
  const config = (user.canvasCalendar ?? null) as JsonObject | null;
  if (path === "/api/canvas/status" && request.method === "GET")
    return json({
      connected: Boolean(config?.calendarId),
      oauthAvailable: true,
      defaultBaseUrl: "https://calendar.google.com",
      needsCourseSelection: false,
      integration: config
        ? {
            id: 1,
            mode: "google_calendar",
            baseUrl: "https://calendar.google.com",
            status: "connected",
            lastSyncedAt: config.lastSyncedAt ?? null,
            lastError: config.lastError ?? null,
          }
        : undefined,
      courses: [],
      latestRun: config?.latestRun ?? null,
      suggestionCount: 0,
      ignoredCount: 0,
    });
  if (path === "/api/canvas/google/connect" && request.method === "POST") {
    const accessToken = String(input.accessToken ?? "");
    const calendarId = String(input.calendarId ?? "");
    if (!accessToken || !calendarId)
      return json({ error: "Choose a Google Calendar first." }, 400);
    sessionStorage.setItem("nimbus-google-calendar-token", accessToken);
    const canvasCalendar = {
      calendarId,
      calendarName: String(input.calendarName ?? "Canvas"),
      lastSyncedAt: null,
      lastError: null,
      latestRun: null,
    };
    await updateDoc(userPath(uid), { canvasCalendar, updatedAt: now() });
    return json({ connected: true });
  }
  if (path === "/api/canvas/ics/import" && request.method === "POST") {
    const events = parseIcs(String(input.text ?? ""));
    if (!events.length)
      return json(
        { error: "No calendar events were found in that file." },
        400,
      );
    const summary = await importCalendarEvents(
      uid,
      events,
      String(input.calendarName ?? "Canvas"),
    );
    const canvasCalendar = {
      calendarId: "ics",
      calendarName: String(input.calendarName ?? "Canvas"),
      lastSyncedAt: now(),
      lastError: null,
      latestRun: { id: Date.now(), status: "completed", summary, error: null },
    };
    await updateDoc(userPath(uid), { canvasCalendar, updatedAt: now() });
    return json(summary);
  }
  if (path === "/api/canvas/sync" && request.method === "POST") {
    if (!config?.calendarId)
      return json({ error: "Connect Google Calendar first." }, 400);
    if (config.calendarId === "ics")
      return json(
        { error: "Import a newer Canvas calendar file to refresh." },
        409,
      );
    const token = sessionStorage.getItem("nimbus-google-calendar-token");
    if (!token)
      return json(
        { error: "Reconnect Google Calendar to refresh its access." },
        401,
      );
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    let page = "";
    const events: JsonObject[] = [];
    do {
      const endpoint = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(config.calendarId))}/events`,
      );
      endpoint.searchParams.set("timeMin", start.toISOString());
      endpoint.searchParams.set("timeMax", end.toISOString());
      endpoint.searchParams.set("singleEvents", "true");
      endpoint.searchParams.set("maxResults", "2500");
      if (page) endpoint.searchParams.set("pageToken", page);
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(
          (failure as JsonObject).error &&
            typeof (failure as JsonObject).error === "object"
            ? String(((failure as JsonObject).error as JsonObject).message)
            : "Google Calendar could not be refreshed.",
        );
      }
      const payload = (await response.json()) as {
        items?: JsonObject[];
        nextPageToken?: string;
      };
      events.push(...(payload.items ?? []));
      page = payload.nextPageToken ?? "";
    } while (page);
    const summary = await importCalendarEvents(
      uid,
      events,
      String(config.calendarName ?? "Canvas"),
    );
    const latestRun = {
      id: Date.now(),
      status: "completed",
      summary,
      error: null,
    };
    await updateDoc(userPath(uid), {
      "canvasCalendar.lastSyncedAt": now(),
      "canvasCalendar.lastError": null,
      "canvasCalendar.latestRun": latestRun,
      updatedAt: now(),
    });
    return json({ run: latestRun });
  }
  if (path === "/api/canvas/events" && request.method === "GET")
    return json(
      (await list(uid, "tasks")).filter(
        (task) => task.externalSource === "canvas_calendar",
      ),
    );
  if (
    (path === "/api/canvas" || path === "/api/canvas/items") &&
    request.method === "DELETE"
  ) {
    const imported = (await list(uid, "tasks")).filter(
      (task) => task.externalSource === "canvas_calendar",
    );
    const batch = writeBatch(firebaseDb);
    imported.forEach((task) => batch.delete(childDoc(uid, "tasks", task.id)));
    if (path === "/api/canvas")
      batch.update(userPath(uid), { canvasCalendar: null, updatedAt: now() });
    await batch.commit();
    sessionStorage.removeItem("nimbus-google-calendar-token");
    return json({ removedTasks: imported.length, removedEvents: 0 });
  }
  if (path.startsWith("/api/canvas/")) return json([]);
  return null;
}

let nimboModel: ReturnType<typeof getGenerativeModel> | null = null;
function getNimboModel() {
  if (nimboModel) return nimboModel;
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  nimboModel = getGenerativeModel(ai, {
    model:
      (import.meta.env.VITE_FIREBASE_AI_MODEL as string | undefined) ||
      "gemini-3.5-flash",
    systemInstruction: [
      "You are Nimbo, the concise planning companion inside Nimbus, a gamified task manager.",
      "Help organize tasks, projects, deadlines, focus, habits, and workload. Do not solve homework for the user.",
      "Never claim that a workspace change happened. Changes are previews until the user confirms them.",
      "Return the four string fields required by the response schema.",
      "reply is the user-facing answer. taskPreviewJson is a JSON array string containing task previews with title, optional date YYYY-MM-DD, optional time, optional scheduleLabel, optional subject copied exactly from the supplied subject list, optional estimatedMinutes, taskType, priority, and keywords.",
      "planPreviewJson is either the string null or a JSON object string with summary, optional project {name,subject,description,dueDate}, and tasks [{title,description,subject,dueDate,priority,estimatedMinutes,taskKind}].",
      "workspacePreviewJson is either the string null or a JSON object string with summary and operations. Supported operations are create_task and update_task. update_task must include the numeric task id from context and may include title, subject copied exactly from the supplied subject list, dueDate YYYY-MM-DD, priority, estimatedMinutes, taskKind, or description. For advice, use [] for taskPreviewJson and null for both other preview strings.",
      "Be honest, useful, and brief.",
    ].join("\n"),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          reply: { type: "string" },
          taskPreviewJson: { type: "string" },
          planPreviewJson: { type: "string" },
          workspacePreviewJson: { type: "string" },
        },
        required: [
          "reply",
          "taskPreviewJson",
          "planPreviewJson",
          "workspacePreviewJson",
        ],
      },
      temperature: 0.25,
      maxOutputTokens: 1000,
    },
  });
  return nimboModel;
}

function normalizeAiJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as JsonObject;
  const parseEmbedded = (value: unknown, fallback: unknown) => {
    if (typeof value !== "string") return value ?? fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  const taskPreview = parseEmbedded(
    parsed.taskPreviewJson,
    parsed.taskPreview ?? [],
  );
  const planValue = parseEmbedded(
    parsed.planPreviewJson,
    parsed.planPreview ?? null,
  );
  const workspaceValue = parseEmbedded(
    parsed.workspacePreviewJson,
    parsed.workspacePreview ?? null,
  );
  const plan =
    planValue && typeof planValue === "object"
      ? (planValue as JsonObject)
      : null;
  const workspace =
    workspaceValue && typeof workspaceValue === "object"
      ? (workspaceValue as JsonObject)
      : null;
  const tasks = Array.isArray(taskPreview) ? taskPreview.slice(0, 12) : [];
  const normalizedPlan = plan
    ? {
        summary:
          typeof plan.summary === "string" ? plan.summary : "Prepared plan",
        project:
          plan.project && typeof plan.project === "object"
            ? plan.project
            : null,
        tasks: Array.isArray(plan.tasks) ? plan.tasks.slice(0, 20) : [],
      }
    : null;
  const normalizedWorkspace = workspace
    ? {
        summary:
          typeof workspace.summary === "string"
            ? workspace.summary
            : "Prepared workspace changes",
        operations: Array.isArray(workspace.operations)
          ? workspace.operations.slice(0, 25)
          : [],
      }
    : null;
  return {
    reply:
      typeof parsed.reply === "string"
        ? parsed.reply
        : "I prepared a safe workspace preview.",
    taskCreated: false,
    task: null,
    tasks: [],
    taskPreview: tasks,
    actionPreview: null,
    planPreview: tasks.length ? null : normalizedPlan,
    workspacePreview:
      tasks.length || normalizedPlan ? null : normalizedWorkspace,
  };
}

async function createAiTask(
  uid: string,
  value: JsonObject,
  subjects?: JsonObject[],
) {
  const availableSubjects = subjects ?? (await list(uid, "subjects"));
  const subject = canonicalSubjectName(value.subject, availableSubjects);
  const id = await nextId(uid, "task");
  const task = taskDefaults(uid, id, {
    title: value.title,
    priority: value.priority ?? "medium",
    dueDate: value.date ?? value.dueDate ?? null,
    calendarDate: value.date ?? value.dueDate ?? null,
    estimatedMinutes: value.estimatedMinutes ?? null,
    subject,
    taskKind: value.taskKind ?? value.taskType ?? "assignment",
    description: value.description ?? null,
    organized: Boolean(subject),
  });
  await setDoc(childDoc(uid, "tasks", id), task);
  return task;
}

function localWorkspaceResponse(
  message: string,
  tasks: Stored[],
  subjects: Stored[],
) {
  const subject = subjects.find((candidate) => {
    const name = String(candidate.name ?? "");
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:to|in|under)\\s+(?:the\\s+)?${escaped}(?:\\s+subject)?[.!]?$`,
      "i",
    ).test(message);
  });
  if (!subject || !/^(?:move|put|assign|organize)\b/i.test(message.trim()))
    return null;
  const subjectName = String(subject.name);
  const escapedSubject = subjectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const requestedTitle = message
    .replace(/^(?:move|put|assign|organize)\s+/i, "")
    .replace(
      new RegExp(
        `\\s+(?:to|in|under)\\s+(?:the\\s+)?${escapedSubject}(?:\\s+subject)?[.!]?$`,
        "i",
      ),
      "",
    )
    .replace(/^(?:task\s+)?["']|["']$/g, "")
    .trim();
  const target = normalizedName(requestedTitle);
  const candidates = tasks.filter(
    (task) => task.status !== "completed" && !task.archived,
  );
  const task =
    candidates.find(
      (candidate) => normalizedName(candidate.title) === target,
    ) ??
    candidates.find(
      (candidate) =>
        normalizedName(candidate.title).includes(target) ||
        target.includes(normalizedName(candidate.title)),
    );
  if (!task) return null;
  return {
    reply: `I found “${task.title}” and prepared a move to ${subjectName}.`,
    taskCreated: false,
    task: null,
    tasks: [],
    taskPreview: [],
    actionPreview: null,
    planPreview: null,
    workspacePreview: {
      summary: `Move ${task.title} to ${subjectName}`,
      operations: [
        {
          type: "update_task",
          id: task.id,
          label: `Move ${task.title} to ${subjectName}`,
          subject: subjectName,
        },
      ],
    },
  };
}

async function handleAi(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
) {
  if (path === "/api/ai/chat" && request.method === "POST") {
    const message = String(input.message ?? "").trim();
    if (!message) return json({ error: "Enter a message for Nimbo." }, 400);
    const [tasks, projects, subjects] = await Promise.all([
      list(uid, "tasks"),
      list(uid, "projects"),
      list(uid, "subjects"),
    ]);
    const localResponse = localWorkspaceResponse(message, tasks, subjects);
    if (localResponse) return json(localResponse);
    const context = {
      today: dateKey(),
      tasks: tasks
        .filter((task) => !task.archived)
        .slice(0, 45)
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
          estimatedMinutes: task.estimatedMinutes,
          subject: task.subject,
          projectId: task.projectId,
        })),
      projects: projects
        .filter((project) => !project.archived)
        .slice(0, 20)
        .map((project) => ({
          id: project.id,
          name: project.name,
          subject: project.subject,
          dueDate: project.dueDate,
          status: project.status,
        })),
      subjects: subjects
        .filter((subject) => !subject.archived)
        .map((subject) => subject.name),
    };
    const history = Array.isArray(input.history) ? input.history.slice(-4) : [];
    try {
      const result = await getNimboModel().generateContent(
        `Workspace context: ${JSON.stringify(context)}\nRecent conversation: ${JSON.stringify(history)}\nUser request: ${message}`,
      );
      return json(normalizeAiJson(result.response.text()));
    } catch (error) {
      console.error("Firebase AI Logic failed", error);
      return json(
        {
          error:
            "Nimbo could not prepare a safe preview just now. Please retry.",
        },
        503,
      );
    }
  }
  if (path === "/api/ai/tasks/confirm" && request.method === "POST") {
    const previews = Array.isArray(input.tasks)
      ? (input.tasks.slice(0, 20) as JsonObject[])
      : [];
    const subjects = await list(uid, "subjects");
    const tasks = [];
    for (const preview of previews)
      tasks.push(await createAiTask(uid, preview, subjects));
    return json({ tasks });
  }
  if (path === "/api/ai/plans/confirm" && request.method === "POST") {
    const plan = (input.plan ?? {}) as JsonObject;
    const subjects = await list(uid, "subjects");
    let project: Stored | null = null;
    const projectInput = (plan.project ?? null) as JsonObject | null;
    if (projectInput?.name) {
      const id = await nextId(uid, "project");
      const subject = canonicalSubjectName(projectInput.subject, subjects);
      project = {
        id,
        userId: uid,
        name: String(projectInput.name).slice(0, 100),
        color: "#6d5dfc",
        type: "project",
        description: projectInput.description ?? null,
        subject,
        dueDate: projectInput.dueDate ?? null,
        status: "active",
        priority: "medium",
        notes: null,
        rubric: null,
        submissionLink: null,
        gradeWeight: null,
        archived: false,
        createdAt: now(),
      };
      await setDoc(childDoc(uid, "projects", id), project);
    }
    const tasks = [];
    for (const value of (Array.isArray(plan.tasks)
      ? plan.tasks.slice(0, 20)
      : []) as JsonObject[])
      tasks.push(
        await createAiTask(
          uid,
          {
            ...value,
            projectId: project?.id ?? null,
            subject: value.subject ?? project?.subject ?? null,
          },
          subjects,
        ),
      );
    return json({ project, tasks });
  }
  if (path === "/api/ai/actions/confirm" && request.method === "POST") {
    const ids = Array.isArray(input.taskIds) ? input.taskIds.map(Number) : [];
    const batch = writeBatch(firebaseDb);
    ids.forEach((id) =>
      batch.update(childDoc(uid, "tasks", id), {
        dueDate: input.newDate ?? null,
        calendarDate: input.newDate ?? null,
      }),
    );
    await batch.commit();
    return json({ updated: ids.length });
  }
  if (path === "/api/ai/workspace/confirm" && request.method === "POST") {
    const plan = (input.plan ?? {}) as JsonObject;
    const operations = (
      Array.isArray(plan.operations) ? plan.operations.slice(0, 25) : []
    ) as JsonObject[];
    const subjects = await list(uid, "subjects");
    let count = 0;
    for (const operation of operations) {
      if (operation.type === "create_task") {
        await createAiTask(uid, operation, subjects);
        count += 1;
      } else if (operation.type === "create_project" && operation.name) {
        const id = await nextId(uid, "project");
        await setDoc(childDoc(uid, "projects", id), {
          id,
          userId: uid,
          name: String(operation.name).slice(0, 100),
          color: "#6d5dfc",
          type: "project",
          description: operation.description ?? null,
          subject: canonicalSubjectName(operation.subject, subjects),
          dueDate: operation.dueDate ?? null,
          status: "active",
          priority: operation.priority ?? "medium",
          archived: false,
          createdAt: now(),
        });
        count += 1;
      } else if (operation.type === "update_task" && operation.id) {
        const allowed = [
          "title",
          "dueDate",
          "priority",
          "estimatedMinutes",
          "taskKind",
          "description",
        ] as const;
        const changes: JsonObject = {};
        for (const key of allowed)
          if (Object.hasOwn(operation, key)) changes[key] = operation[key];
        if (Object.hasOwn(operation, "subject")) {
          const subject = canonicalSubjectName(operation.subject, subjects);
          if (subject) changes.subject = subject;
        }
        if (Object.hasOwn(changes, "dueDate"))
          changes.calendarDate = changes.dueDate;
        if (changes.subject) changes.organized = true;
        await updateDoc(
          childDoc(uid, "tasks", Number(operation.id)),
          clean(changes),
        );
        count += 1;
      }
    }
    return json({ count });
  }
  return null;
}

function pairId(a: string, b: string) {
  return [a, b].sort().join("__");
}
function numericId(value: string) {
  return hash(value) & 0x7fffffff;
}
async function publicProfile(uid: string) {
  const snapshot = await getDoc(doc(firebaseDb, "publicProfiles", uid));
  if (!snapshot.exists() || !snapshot.data().socialEnabled) return null;
  const data = snapshot.data();
  return {
    id: uid,
    displayName: data.displayName ?? null,
    username: data.username ?? null,
    profileImageUrl: data.profileImageUrl ?? null,
    equippedFrame: data.equippedFrame ?? "none",
    equippedTitle: data.equippedTitle ?? "none",
    level: data.tier ?? 1,
    streakDays: data.streakDays ?? 0,
    online: false,
  };
}
async function friendshipRows(uid: string) {
  const snapshot = await getDocs(
    query(
      collection(firebaseDb, "friendships"),
      where("participants", "array-contains", uid),
    ),
  );
  return snapshot.docs.map((entry) => entry.data() as JsonObject);
}
async function handleSocial(
  uid: string,
  request: Request,
  path: string,
  input: JsonObject,
  user: JsonObject,
) {
  if (!path.startsWith("/api/social/")) return null;
  if (!user.socialEnabled)
    return json({ error: "Turn on Social in Settings first." }, 403);
  const rows = await friendshipRows(uid);
  if (path === "/api/social/search" && request.method === "GET") {
    const term = (new URL(request.url).searchParams.get("q") ?? "")
      .trim()
      .toLowerCase();
    if (term.length < 2) return json([]);
    const profiles = await getDocs(
      query(
        collection(firebaseDb, "publicProfiles"),
        where("socialEnabled", "==", true),
        limit(50),
      ),
    );
    const results = [];
    for (const entry of profiles.docs) {
      if (entry.id === uid) continue;
      const data = entry.data();
      if (
        !`${data.displayName ?? ""} ${data.username ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        continue;
      const relation = rows.find(
        (row) =>
          Array.isArray(row.participants) &&
          (row.participants as string[]).includes(entry.id),
      );
      const profile = await publicProfile(entry.id);
      if (profile)
        results.push({
          ...profile,
          friendshipStatus: relation?.status ?? "none",
          requestDirection: relation
            ? relation.requesterId === uid
              ? "outgoing"
              : "incoming"
            : null,
          friendshipId: relation?.id ?? null,
        });
    }
    return json(results.slice(0, 12));
  }
  if (path === "/api/social/friends" && request.method === "GET") {
    const result = [];
    for (const row of rows.filter((item) => item.status === "accepted")) {
      const other = String(
        row.requesterId === uid ? row.recipientId : row.requesterId,
      );
      const profile = await publicProfile(other);
      if (profile) result.push({ friendshipId: row.id, ...profile });
    }
    return json(result);
  }
  if (path === "/api/social/requests" && request.method === "GET") {
    const result = [];
    for (const row of rows.filter(
      (item) => item.status === "pending" && item.recipientId === uid,
    )) {
      const profile = await publicProfile(String(row.requesterId));
      if (profile) result.push({ friendshipId: row.id, ...profile });
    }
    return json(result);
  }
  if (path === "/api/social/friends/request" && request.method === "POST") {
    const recipientId = String(input.userId ?? "");
    if (!recipientId || recipientId === uid)
      return json({ error: "Invalid friend request." }, 400);
    const key = pairId(uid, recipientId);
    if ((await getDoc(doc(firebaseDb, "friendships", key))).exists())
      return json({ error: "A request already exists." }, 409);
    const value = {
      id: numericId(key),
      requesterId: uid,
      recipientId,
      status: "pending",
      participants: [uid, recipientId],
      createdAt: now(),
      updatedAt: now(),
    };
    await setDoc(doc(firebaseDb, "friendships", key), value);
    return json(value, 201);
  }
  const action = path.match(
    /^\/api\/social\/requests\/(\d+)\/(accept|decline)$/,
  );
  if (action && request.method === "POST") {
    const row = rows.find(
      (item) =>
        Number(item.id) === Number(action[1]) && item.recipientId === uid,
    );
    if (!row) return json({ error: "Request not found." }, 404);
    const ref = doc(
      firebaseDb,
      "friendships",
      pairId(String(row.requesterId), String(row.recipientId)),
    );
    if (action[2] === "accept") {
      await updateDoc(ref, { status: "accepted", updatedAt: now() });
      return json({ ...row, status: "accepted" });
    }
    await deleteDoc(ref);
    return json({ ok: true });
  }
  const remove = path.match(/^\/api\/social\/friends\/(\d+)$/);
  if (remove && request.method === "DELETE") {
    const row = rows.find((item) => Number(item.id) === Number(remove[1]));
    if (row)
      await deleteDoc(
        doc(
          firebaseDb,
          "friendships",
          pairId(String(row.requesterId), String(row.recipientId)),
        ),
      );
    return json({ ok: true });
  }
  const block = path.match(/^\/api\/social\/users\/([^/]+)\/block$/);
  if (block && request.method === "POST") {
    await setDoc(doc(firebaseDb, "blocks", pairId(uid, block[1])), {
      blockerId: uid,
      blockedId: block[1],
      createdAt: now(),
    });
    const relation = rows.find(
      (item) =>
        Array.isArray(item.participants) &&
        (item.participants as string[]).includes(block[1]),
    );
    if (relation)
      await deleteDoc(
        doc(
          firebaseDb,
          "friendships",
          pairId(String(relation.requesterId), String(relation.recipientId)),
        ),
      );
    return json({ ok: true });
  }
  const report = path.match(/^\/api\/social\/users\/([^/]+)\/report$/);
  if (report && request.method === "POST") {
    await addDoc(collection(firebaseDb, "reports"), {
      reporterId: uid,
      reportedId: report[1],
      reason: String(input.reason ?? "").slice(0, 240),
      createdAt: now(),
    });
    return json({ ok: true }, 201);
  }
  if (path === "/api/social/conversations" && request.method === "GET") {
    const result = [];
    for (const row of rows.filter((item) => item.status === "accepted")) {
      const other = String(
        row.requesterId === uid ? row.recipientId : row.requesterId,
      );
      const profile = await publicProfile(other);
      if (!profile) continue;
      const messages = await getDocs(
        query(
          collection(firebaseDb, "messages"),
          where("conversationId", "==", pairId(uid, other)),
          orderBy("createdAt", "asc"),
          limit(200),
        ),
      );
      const visible = messages.docs
        .map((entry) => entry.data())
        .filter((entry) => !entry.deletedAt);
      const last = visible.at(-1);
      result.push({
        friendshipId: row.id,
        friend: profile,
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.createdAt,
              mine: last.senderId === uid,
            }
          : null,
        unreadCount: visible.filter(
          (entry) => entry.recipientId === uid && !entry.readAt,
        ).length,
      });
    }
    return json(result);
  }
  const messages = path.match(/^\/api\/social\/messages\/([^/]+)$/);
  if (messages) {
    const other = messages[1];
    if (request.method === "GET") {
      const snapshot = await getDocs(
        query(
          collection(firebaseDb, "messages"),
          where("conversationId", "==", pairId(uid, other)),
          orderBy("createdAt", "asc"),
          limit(200),
        ),
      );
      const batch = writeBatch(firebaseDb);
      const result = snapshot.docs
        .filter((entry) => !entry.data().deletedAt)
        .map((entry) => {
          const data = entry.data();
          if (data.recipientId === uid && !data.readAt)
            batch.update(entry.ref, { readAt: now() });
          return { ...data, mine: data.senderId === uid };
        });
      await batch.commit();
      return json(result);
    }
    if (request.method === "POST") {
      const messageBody = String(input.body ?? "")
        .trim()
        .slice(0, 2000);
      if (!messageBody) return json({ error: "Message cannot be empty." }, 400);
      const id = numericId(`${uid}:${other}:${Date.now()}:${Math.random()}`);
      const value = {
        id,
        senderId: uid,
        recipientId: other,
        participants: [uid, other],
        conversationId: pairId(uid, other),
        body: messageBody,
        readAt: null,
        deletedAt: null,
        createdAt: now(),
      };
      await setDoc(doc(firebaseDb, "messages", String(id)), value);
      return json({ ...value, mine: true }, 201);
    }
    if (request.method === "DELETE") {
      const snapshot = await getDocs(
        query(
          collection(firebaseDb, "messages"),
          where("id", "==", Number(other)),
          limit(1),
        ),
      );
      const entry = snapshot.docs[0];
      if (!entry || entry.data().senderId !== uid)
        return json({ error: "Message not found." }, 404);
      await updateDoc(entry.ref, { body: "", deletedAt: now() });
      return json({ ok: true });
    }
  }
  return json({ error: "Social action not found." }, 404);
}

export async function handleFirebaseApi(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname;
    if (path === "/api/healthz")
      return json({ status: "ok", database: "firestore", service: "nimbus" });
    const current = firebaseAuth.currentUser;
    if (!current) return json({ error: "Unauthorized" }, 401);
    const uid = current.uid;
    let user = await ensureUser(uid);
    const input = await body(request);
    user = { ...user, ...(await getDoc(userPath(uid))).data() };
    if (path === "/api/auth/user")
      return json({
        user: {
          id: uid,
          email: current.email,
          firstName:
            user.firstName ?? current.displayName?.split(" ")[0] ?? null,
          lastName: user.lastName ?? null,
          profileImageUrl: user.profileImageUrl ?? current.photoURL ?? null,
        },
      });
    if (path === "/api/session-logout") return json({ ok: true });
    const handlers = [
      () => handleUserAndRewards(uid, request, path, input, user),
      () => handleTasks(uid, request, path, input),
      () => handleChecklist(uid, request, path, input),
      () => handlePlanning(uid, request, path, input),
      () => handleProjects(uid, request, path, input),
      () => handleHabitsAndFocus(uid, request, path, input),
      () => handleDashboard(uid, request, path, user),
      () => handleWeeklyReview(uid, request, path, input, user),
      () => handleCanvas(uid, request, path, input, user),
      () => handleAi(uid, request, path, input),
      () => handleSocial(uid, request, path, input, user),
    ];
    for (const handler of handlers) {
      const response = await handler();
      if (response) return response;
    }
    return json(
      {
        error: `Nimbus's Firebase migration does not recognize ${request.method} ${path}.`,
      },
      501,
    );
  } catch (error) {
    console.error("Nimbus Firebase API error", error);
    const message =
      error instanceof Error ? error.message : "Firebase request failed.";
    return json({ error: message }, 500);
  }
}
