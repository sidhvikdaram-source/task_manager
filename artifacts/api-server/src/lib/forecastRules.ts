export type ForecastWeather = "sunny" | "stormy" | "foggy" | "windy" | "rainbow";

export const FORECAST_COSTS = {
  reroll: 45,
  peek: 65,
  boost: 90,
} as const;

export function rollForecast(roll: number): ForecastWeather {
  const normalized = Math.max(0, Math.min(99, Math.floor(roll)));
  if (normalized < 5) return "rainbow";
  if (normalized < 30) return "windy";
  if (normalized < 50) return "foggy";
  if (normalized < 70) return "stormy";
  return "sunny";
}

export const FORECAST_DETAILS: Record<ForecastWeather, {
  name: string;
  headline: string;
  description: string;
}> = {
  sunny: {
    name: "Sunny",
    headline: "Clear skies for steady progress.",
    description: "Every completed task earns 50% more Nimbus Points today.",
  },
  stormy: {
    name: "Stormy",
    headline: "One doable action is carrying a bonus charge.",
    description: "Finish today's highlighted task or habit for a 50 NP and 25 BP surge. Missing it never costs you anything.",
  },
  foggy: {
    name: "Foggy",
    headline: "Today’s reward stays hidden.",
    description: "Keep finishing tasks. Your hidden Breeze Points become visible after midnight.",
  },
  windy: {
    name: "Windy",
    headline: "Bonus BP is moving through the list.",
    description: "Each completion has a chance to catch a 6–16 BP gust.",
  },
  rainbow: {
    name: "Rainbow",
    headline: "The rarest forecast found you.",
    description: "A free shop unlock has already landed in your collection.",
  },
};

export function windyReward(roll: number, amountRoll: number) {
  if (roll >= 45) return 0;
  return 6 + Math.max(0, Math.min(10, Math.floor(amountRoll)));
}

type ChargeableTask = {
  title: string;
  taskKind?: string | null;
  blocked?: boolean;
  archived?: boolean;
  status?: string | null;
  dueDate?: string | null;
  calendarDate?: string | null;
  externalSource?: string | null;
};

const ASSESSMENT_WORDS = /\b(test|exam|quiz|assessment|midterm|final)\b/i;
const PREPARATION_WORDS = /\b(study|review|prepare|practice|revise|flashcards?|worksheet|notes?)\b/i;

export function isChargeableTask(task: ChargeableTask, today: string) {
  if (task.archived || task.blocked || task.status === "completed") return false;
  if (task.externalSource === "canvas_event") return false;
  if (task.dueDate !== today && task.calendarDate !== today) return false;
  const assessmentLike = ASSESSMENT_WORDS.test(`${task.taskKind ?? ""} ${task.title}`);
  return !assessmentLike || PREPARATION_WORDS.test(task.title);
}

export function isHabitScheduledToday(daysOfWeek: string, today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return daysOfWeek.split(",").map(Number).includes(weekday);
}
