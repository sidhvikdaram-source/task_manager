export type RecommendationEnergy = "low" | "medium" | "high";

export interface RecommendationTask {
  title: string;
  description?: string | null;
  notes?: string | null;
  subject?: string | null;
  taskKind?: string | null;
  priority: string;
  difficulty: number;
  estimatedMinutes?: number | null;
  dueDate?: string | null;
}

const deepWorkPattern = /\b(study|prepare|research|analy[sz]e|write|draft|essay|report|project|exam|test|quiz|practice|homework|assignment|presentation|design|build|code|debug|chapter|problem set|worksheet|review|memorize|learn|deep[\s-]*work|amc\s*\d*)\b/i;
const quickWorkPattern = /\b(call|email|text|message|reply|confirm|schedule|book|buy|pick up|drop off|submit|print|upload|download|rename|organize|check|clean up|play|ping pong|stretch|walk|meditate|breathe|water|feed|tidy|pack|shower|snack)\b/i;
const intensiveKindPattern = /\b(project|test|quiz|practice|reading)\b/i;

function durationFromText(text: string) {
  const hours = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr)\b/i);
  if (hours) return Math.max(5, Math.round(Number(hours[1]) * 60));
  const minutes = text.match(/\b(\d+)\s*(?:minutes?|mins?|min)\b/i);
  return minutes ? Math.max(5, Number(minutes[1])) : null;
}

export function inferTaskWorkload(task: RecommendationTask) {
  const semanticText = [task.title, task.description, task.notes, task.subject].filter(Boolean).join(" ");
  const deep = deepWorkPattern.test(semanticText) || intensiveKindPattern.test(task.taskKind ?? "");
  const quick = quickWorkPattern.test(semanticText) && !deep;
  const difficulty = deep ? 3 : quick ? 1 : Math.min(3, Math.max(1, task.difficulty || 2));
  const explicitDuration = durationFromText(semanticText);
  const storedDuration = typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0
    ? task.estimatedMinutes
    : null;
  const duration = storedDuration ?? explicitDuration ?? (difficulty === 3 ? 45 : difficulty === 1 ? 10 : 30);
  const workload = deep ? "deep work" : quick ? "quick action" : difficulty === 3 ? "focused work" : difficulty === 1 ? "light work" : "regular work";
  return {
    difficulty,
    duration,
    workload,
    splittable: deep,
    durationSource: storedDuration ? "estimate" : explicitDuration ? "title" : "inferred",
  };
}

export function scoreTaskRecommendation(task: RecommendationTask, options: { minutes: number; energy: RecommendationEnergy; today: string }) {
  const workload = inferTaskWorkload(task);
  const days = task.dueDate
    ? Math.ceil((new Date(`${task.dueDate}T12:00:00Z`).getTime() - new Date(`${options.today}T12:00:00Z`).getTime()) / 86400000)
    : 30;
  const urgency = days < 0 ? 52 : days === 0 ? 44 : days === 1 ? 36 : Math.max(0, 22 - days * 2);
  const priority = task.priority === "critical" ? 36 : task.priority === "high" ? 25 : task.priority === "medium" ? 13 : 3;
  const targetDifficulty = options.energy === "low" ? 1 : options.energy === "high" ? 3 : 2;
  const energyFit = 18 - Math.abs(workload.difficulty - targetDifficulty) * 8;
  const canFinish = workload.duration <= options.minutes;
  const canMakeProgress = workload.splittable && options.minutes >= 20;
  const eligible = canFinish || canMakeProgress;
  const timeFit = canFinish ? 14 - Math.abs(options.minutes - workload.duration) / 5 : canMakeProgress ? 5 : -30;
  const score = urgency + priority + energyFit + timeFit;
  return { ...workload, days, urgency, priorityScore: priority, energyFit, timeFit, score, eligible, canFinish };
}
