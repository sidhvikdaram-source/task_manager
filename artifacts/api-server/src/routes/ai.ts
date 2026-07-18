import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { Router, type IRouter } from "express";
import { checklistItemsTable, db, projectsTable, subjectsTable, tasksTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

const router: IRouter = Router();

const systemPrompt = [
  "You are Velocity Assistant.",
  "Track 1: General Utility - Solve math, code, planning, writing, and everyday tasks cleanly with Markdown.",
  "Track 2: Tasks - Time is strictly optional; never force a deadline or invent one when the user did not ask for it.",
  "If a user sets a time without a task name, such as remind me at 4, generate a smart title like Afternoon Focus Block instead of Task at 4.",
  "Handle relative dates like tomorrow, next Monday, Friday afternoon, in two hours, and in three days accurately.",
  "Infer intent from short user phrases, but do not pretend to complete actions that the backend did not report as completed.",
  "When the backend created a task, confirm the title and schedule reference first.",
  "When the backend created multiple tasks from a previous agenda or plan, briefly list the tasks that were added.",
  "When no task was created, answer the user normally and do not mention backend internals.",
  "Keep responses brief, professional, and free of filler.",
  "Use structured Markdown only: short paragraphs, bullets, bold labels, and code fences when useful.",
  "For math, use clean readable Markdown with plain-text equations. Do not use raw LaTeX delimiters, backslash commands, or dollar signs. Prefer forms like x = (-4 +/- sqrt(-104)) / 10 and bullet each step clearly.",
  "Never create a task for a math expression, equation, solve request, essay request, explanation request, or general homework help unless the user explicitly says to remind, schedule, add a task, create a todo, or set a deadline.",
  "Do not include malformed tables, decorative characters, fake JSON, or hidden chain-of-thought.",
].join(" ");

const velocityGeminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
// GPT-OSS 120B supports Groq's strict JSON Schema mode; qwen3-32b was retired.
const velocityGroqModels = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"];
const assistantMaxOutputTokens = 3000;
const groqMinRequestIntervalMs = 1_100;
const geminiMinRequestIntervalMs = 700;
let geminiQueue: Promise<unknown> = Promise.resolve();
let lastGeminiRequestAt = 0;
let groqQueue: Promise<unknown> = Promise.resolve();
let lastGroqRequestAt = 0;

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const monthNames: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const monthDatePattern = new RegExp(
  `\\b(${Object.keys(monthNames).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`,
  "i",
);

type Priority = "critical" | "high" | "medium" | "low";

interface AssistantLogger {
  warn: (obj: unknown, msg?: string) => void;
}

interface ChatHistoryMessage {
  role: "assistant" | "user";
  content: string;
}

interface ParsedTaskCommand {
  title: string;
  date?: string;
  time?: string;
  scheduleLabel?: string;
  taskType: TaskType;
  keywords: string[];
  priority: Priority;
}

interface AssistantProjectPlan {
  name: string;
  subject: string | null;
  description: string | null;
  dueDate: string | null;
}

interface AssistantPlannedTask {
  title: string;
  description: string | null;
  subject: string | null;
  dueDate: string | null;
  priority: Priority;
  estimatedMinutes: number | null;
  taskKind: string;
}

interface AssistantActionPlan {
  summary: string;
  project: AssistantProjectPlan | null;
  tasks: AssistantPlannedTask[];
}

type WorkspaceOperation =
  | { type: "create_subject"; label: string; name: string; color: string }
  | { type: "update_subject"; label: string; targetId: number; name?: string; color?: string; archived?: boolean }
  | { type: "delete_subject"; label: string; targetId: number }
  | { type: "create_project"; label: string; name: string; subject: string | null; priority: Priority; dueDate: string | null; description: string | null; status: string }
  | { type: "update_project"; label: string; targetId: number; name?: string; subject?: string | null; priority?: Priority; dueDate?: string | null; description?: string | null; status?: string; archived?: boolean }
  | { type: "delete_project"; label: string; targetId: number }
  | { type: "create_task"; label: string; title: string; subject: string | null; projectName: string | null; priority: Priority; dueDate: string | null; estimatedMinutes: number | null; difficulty: number; status: string; blocked: boolean }
  | { type: "update_task"; label: string; targetId: number; title?: string; subject?: string | null; projectName?: string | null; priority?: Priority; dueDate?: string | null; estimatedMinutes?: number | null; difficulty?: number; status?: string; blocked?: boolean }
  | { type: "delete_task"; label: string; targetId: number }
  | { type: "add_checklist_item"; label: string; targetId: number; title: string };

interface WorkspaceActionPlan {
  summary: string;
  operations: WorkspaceOperation[];
}

const workspaceDecisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "summary", "operations"],
  properties: {
    intent: { type: "string", enum: ["workspace_changes", "workspace_query", "general"] },
    summary: { type: "string" },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "targetId", "name", "title", "color", "subject", "projectName", "priority", "dueDate", "description", "estimatedMinutes", "difficulty", "status", "blocked", "archived", "clearSubject", "clearProject", "clearDueDate", "clearDescription"],
        properties: {
          type: { type: "string", enum: ["create_subject", "update_subject", "delete_subject", "create_project", "update_project", "delete_project", "create_task", "update_task", "delete_task", "add_checklist_item"] },
          targetId: { type: ["integer", "null"] },
          name: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          color: { type: ["string", "null"] },
          subject: { type: ["string", "null"] },
          projectName: { type: ["string", "null"] },
          priority: { type: ["string", "null"], enum: ["critical", "high", "medium", "low", null] },
          dueDate: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          estimatedMinutes: { type: ["integer", "null"] },
          difficulty: { type: ["integer", "null"] },
          status: { type: ["string", "null"] },
          blocked: { type: ["boolean", "null"] },
          archived: { type: ["boolean", "null"] },
          clearSubject: { type: "boolean" },
          clearProject: { type: "boolean" },
          clearDueDate: { type: "boolean" },
          clearDescription: { type: "boolean" },
        },
      },
    },
  },
} as const;

interface PlanExpectations {
  projectRequested: boolean;
  tasksRequested: boolean;
  projectName: string | null;
  subject: string | null;
  oneWeek: boolean;
  originalRequest: string;
}

type TaskType =
  | "focus"
  | "appointment"
  | "follow-up"
  | "deadline"
  | "study"
  | "errand"
  | "health"
  | "finance"
  | "chore"
  | "creative"
  | "code"
  | "regular";

const taskTypeLabels: Record<TaskType, string> = {
  focus: "Focus Block",
  appointment: "Appointment",
  "follow-up": "Follow-up",
  deadline: "Deadline",
  study: "Study",
  errand: "Errand",
  health: "Health",
  finance: "Finance",
  chore: "Chore",
  creative: "Creative",
  code: "Code",
  regular: "Regular",
};

const taskTypeSymbols: Record<TaskType, string> = {
  focus: "[F]",
  appointment: "[A]",
  "follow-up": "[R]",
  deadline: "[!]",
  study: "[S]",
  errand: "[E]",
  health: "[H]",
  finance: "[$]",
  chore: "[C]",
  creative: "[*]",
  code: "[DEV]",
  regular: "[T]",
};

const taskIntentPatterns = [
  /\b(remind me|remember to|don't let me forget|dont let me forget|make sure i|i need to|need to|have to|gotta|should)\b/i,
  /\b(add|create|set|schedule|plan|put|make|start|finish|complete|do|work on|handle|take care of|prep|prepare)\b/i,
  /\b(call|email|text|message|reply|follow up|ping|meet|book|reserve|submit|turn in|send)\b/i,
  /\b(study|homework|assignment|project|worksheet|review|practice|read|write|draft|design|code|debug|deploy|test|pay|buy|pick up|clean|wash|workout|exercise)\b/i,
  /\b(due|deadline|before|appointment|meeting|event|todo|todos|task|tasks)\b/i,
];

const taskTypePatterns: Array<[TaskType, RegExp]> = [
  ["deadline", /\b(deadline|due|submit|turn in|final|exam|test|before|by)\b/i],
  ["appointment", /\b(appointment|meeting|meet|doctor|dentist|interview|reservation|book|call with|session with)\b/i],
  ["follow-up", /\b(follow up|follow-up|reply|respond|email|text|message|ping|call back|check in)\b/i],
  ["study", /\b(study|homework|review|practice|read|quiz|class|lecture|assignment|math|science|english|history)\b/i],
  ["code", /\b(code|debug|deploy|ship|build|fix bug|typescript|javascript|api|backend|frontend|database|repo|github)\b/i],
  ["health", /\b(workout|exercise|run|gym|walk|medicine|meds|doctor|therapy|stretch|sleep)\b/i],
  ["finance", /\b(pay|bill|invoice|budget|bank|tax|rent|subscription|renewal|money)\b/i],
  ["errand", /\b(buy|pick up|pickup|drop off|groceries|store|mail|package|return|deliver)\b/i],
  ["chore", /\b(clean|laundry|wash|dishes|trash|organize|vacuum|room|desk)\b/i],
  ["creative", /\b(write|draft|design|edit|record|film|post|sketch|brainstorm|outline)\b/i],
  ["focus", /\b(focus|deep work|work block|focus block|pomodoro|grind|work on|study block)\b/i],
];

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextWeekday(targetDay: number, forceNext: boolean) {
  const date = new Date();
  const currentDay = date.getDay();
  let delta = targetDay - currentDay;
  if (delta < 0 || (delta === 0 && forceNext)) delta += 7;
  if (delta === 0) delta = 7;
  date.setDate(date.getDate() + delta);
  return formatDate(date);
}

function addHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function parseNumberWord(value: string) {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  return words[value] ?? Number(value);
}

function matchedKeywords(input: string) {
  const matches = [
    "remind me", "remember", "don't forget", "dont forget", "need to", "have to", "gotta",
    "add", "create", "set", "schedule", "plan", "todo", "task", "deadline", "due",
    "call", "email", "text", "message", "reply", "follow up", "meet", "book", "submit",
    "finish", "complete", "study", "review", "practice", "read", "write", "draft",
    "code", "debug", "deploy", "pay", "buy", "pick up", "clean", "workout", "exercise",
    "morning", "afternoon", "evening", "tonight", "tomorrow", "next", "today",
  ];
  const lower = input.toLowerCase();
  return matches.filter((keyword) => lower.includes(keyword));
}

function parseDate(input: string) {
  const text = input.toLowerCase();
  const now = new Date();

  const inHoursMatch = text.match(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+hours?\b/);
  if (inHoursMatch?.[1]) return formatDate(addHours(parseNumberWord(inHoursMatch[1])));

  const inDaysMatch = text.match(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days?\b/);
  if (inDaysMatch?.[1]) return formatDate(addDays(parseNumberWord(inDaysMatch[1])));

  if (/\btoday\b/.test(text)) return formatDate(now);
  if (/\btomorrow\b/.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return formatDate(tomorrow);
  }

  const nextWeekdayMatch = text.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (nextWeekdayMatch?.[1]) {
    return nextWeekday(weekdays.indexOf(nextWeekdayMatch[1] as typeof weekdays[number]), true);
  }

  const weekdayMatch = text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch?.[1]) {
    return nextWeekday(weekdays.indexOf(weekdayMatch[1] as typeof weekdays[number]), false);
  }

  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  const monthDateMatch = text.match(monthDatePattern);
  if (monthDateMatch?.[1] && monthDateMatch[2]) {
    const month = monthNames[monthDateMatch[1].replace(".", "")];
    const day = Number(monthDateMatch[2]);
    let year = monthDateMatch[3] ? Number(monthDateMatch[3]) : now.getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = new Date(year, month - 1, day, 12);
      if (!monthDateMatch[3] && candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        year += 1;
      }
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = slashMatch[3]
      ? Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3])
      : now.getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return undefined;
}

function parseTime(input: string) {
  const relativeHoursMatch = input.toLowerCase().match(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+hours?\b/);
  if (relativeHoursMatch?.[1]) {
    const date = addHours(parseNumberWord(relativeHoursMatch[1]));
    const hour = date.getHours();
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(date.getMinutes()).padStart(2, "0")} ${suffix}`;
  }

  const text = input.toLowerCase();
  if (/\bmorning\b/.test(text)) return "9:00 AM";
  if (/\bafternoon\b/.test(text)) return "2:00 PM";
  if (/\bevening\b/.test(text)) return "6:00 PM";
  if (/\btonight\b|\bnight\b/.test(text)) return "8:00 PM";

  const match = input.match(/\b(?:(at|by|before|around|@)\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return undefined;
  const hasTimeCue = Boolean(match[1] || match[3] || match[4] || /(^|\s)\d{1,2}:\d{2}\b/.test(input));
  if (!hasTimeCue) return undefined;

  const hour = Number(match[2]);
  const minutes = match[3] ?? "00";
  const explicitSuffix = match[4]?.toUpperCase();
  if (hour < 1 || hour > 23) return undefined;
  if (explicitSuffix) return `${hour}:${minutes} ${explicitSuffix}`;
  if (hour === 0) return `12:${minutes} AM`;
  if (hour > 12) return `${hour - 12}:${minutes} PM`;
  const suffix = hour >= 7 && hour <= 11 ? "AM" : "PM";
  return `${hour}:${minutes} ${suffix}`;
}

function parsePriority(input: string): Priority {
  const text = input.toLowerCase();
  if (/\b(critical|urgent|asap)\b/.test(text)) return "critical";
  if (/\bhigh priority\b|\bimportant\b/.test(text)) return "high";
  if (/\blow priority\b|\bwhenever\b/.test(text)) return "low";
  return "medium";
}

function getVpValue(priority: Priority) {
  if (priority === "critical") return 25;
  if (priority === "high") return 15;
  if (priority === "medium") return 10;
  return 5;
}

function cleanTitle(input: string) {
  return input
    .replace(/^\s*(please\s+)?(can you\s+)?(remind me to|remind me|remember to|don't let me forget to|dont let me forget to|don't forget to|dont forget to|i need to|need to|i have to|have to|gotta|set(?: a)? task(?: to)?|add(?: a)? task to|add(?: a)? task|create(?: a)? task to|create(?: a)? task|schedule|todo|plan to|plan|make sure i|make sure to)\s*/i, "")
    .replace(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(hours?|days?)\b/gi, "")
    .replace(/\b(next\s+)?(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\b(morning|afternoon|evening|tonight|night)\b/gi, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "")
    .replace(monthDatePattern, "")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "")
    .replace(/\b(?:at|by|before|around|@)\s*\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}\s*(am|pm)\b/gi, "")
    .replace(/\b(critical|urgent|asap|high priority|low priority|important|whenever)\b/gi, "")
    .replace(/\b(at|by|on|for)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+[,.;:!?]+$/g, "")
    .trim();
}

function replaceLatexFractions(text: string) {
  let output = text;
  let index = output.indexOf("\\frac{");

  while (index !== -1) {
    const numeratorStart = index + "\\frac{".length;
    const numeratorEnd = findMatchingBrace(output, numeratorStart - 1);
    if (numeratorEnd === -1 || output[numeratorEnd + 1] !== "{") break;

    const denominatorStart = numeratorEnd + 2;
    const denominatorEnd = findMatchingBrace(output, numeratorEnd + 1);
    if (denominatorEnd === -1) break;

    const numerator = output.slice(numeratorStart, numeratorEnd);
    const denominator = output.slice(denominatorStart, denominatorEnd);
    output = `${output.slice(0, index)}(${numerator})/(${denominator})${output.slice(denominatorEnd + 1)}`;
    index = output.indexOf("\\frac{");
  }

  return output;
}

function findMatchingBrace(text: string, openBraceIndex: number) {
  let depth = 0;
  for (let index = openBraceIndex; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function cleanAssistantReply(reply: string) {
  return replaceLatexFractions(reply)
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\pm/g, "+/-")
    .replace(/\\times/g, "x")
    .replace(/\\cdot/g, "*")
    .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\quad/g, " ")
    .replace(/\\text\{([^{}]+)\}/g, "$1")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\{([^{}]+)\}/g, "$1")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function getHourFromTime(time?: string) {
  if (!time) return undefined;
  const match = time.match(/^(\d{1,2}):\d{2}\s+(AM|PM)$/);
  if (!match) return undefined;
  let hour = Number(match[1]);
  if (match[2] === "PM" && hour !== 12) hour += 12;
  if (match[2] === "AM" && hour === 12) hour = 0;
  return hour;
}

function getSmartPlaceholderTitle(time?: string, input = "") {
  const text = input.toLowerCase();
  const hour = getHourFromTime(time);
  if (/\b(meeting|sync|call)\b/.test(text)) return "Project Sync";
  if (/\b(study|homework|review|practice|read|class)\b/.test(text)) return "Study Block";
  if (/\b(workout|gym|exercise|run)\b/.test(text)) return "Workout Session";
  if (/\b(errand|buy|pick up|store)\b/.test(text)) return "Errand Run";
  if (/\b(email|reply|text|message|follow up)\b/.test(text)) return "Follow-up";
  if (/\b(code|debug|build|deploy|fix)\b/.test(text)) return "Development Block";
  if (hour !== undefined && hour < 12) return "Morning Focus Block";
  if (hour !== undefined && hour < 17) return "Afternoon Focus Block";
  if (hour !== undefined && hour < 20) return "Project Sync";
  if (hour !== undefined) return "Evening Planning Block";
  if (/\btomorrow\b|\bnext\b/.test(text)) return "Planning Check-in";
  return "Focus Session";
}

function inferTaskType(input: string, title: string): TaskType {
  const text = `${input} ${title}`;
  for (const [type, pattern] of taskTypePatterns) {
    if (pattern.test(text)) return type;
  }
  return "regular";
}

function looksLikeTask(input: string, date?: string, time?: string) {
  if (looksLikeMathRequest(input) && !hasExplicitTaskCue(input)) return false;
  if (looksLikeGeneralCreationRequest(input) && !hasExplicitTaskCue(input) && !date && !time) return false;
  if (looksLikePlanningRequest(input) && !mentionsTaskCreation(input)) return false;
  if (taskIntentPatterns.some((pattern) => pattern.test(input))) return true;
  if (time && input.trim().length <= 12) return true;
  if (date && /\b(homework|assignment|project|worksheet|study|test|quiz|exam|deadline|due)\b/i.test(input)) return true;
  if ((date || time) && /\b(i|me|my|tomorrow|today|next|at|by|before|morning|afternoon|evening|tonight)\b/i.test(input)) {
    return true;
  }
  return false;
}

function hasExplicitTaskCue(input: string) {
  return /\b(remind me|remember to|don't forget|dont forget|add (a )?(task|tasks|todo|todos)|create (a )?(task|tasks|todo|todos)|make (a )?(task|tasks|todo|todos)|generate (a )?(task|tasks|todo|todos)|turn (this|that|it|the plan|the agenda).{0,30}\b(task|tasks|todo|todos)\b|set (a )?(task|reminder)|schedule|due|deadline|before|at \d|@\d)\b/i.test(input);
}

function mentionsTaskCreation(input: string) {
  return /\b(task|tasks|todo|todos|to-do|to-dos|checklist|action items)\b/i.test(input);
}

function looksLikeGeneralCreationRequest(input: string) {
  return /\b(write|create|make|draft|generate|compose)\s+(an?\s+|the\s+)?(essay|poem|story|paragraph|report|article|summary|speech|letter|email|blog|script|outline)\b/i.test(input);
}

function looksLikePlanningRequest(input: string) {
  return /\b(create|make|generate|build|draft|write)\s+(?:(?:an?|the|my)\s+)?(?:(?:one|two|three|four|five|six|seven|\d+)[ -]?(?:day|week|month)\s+)?(agenda|plan|study plan|practice plan|schedule|routine|roadmap)\b/i.test(input);
}

function looksLikeMathRequest(input: string) {
  const text = input.toLowerCase();
  return (
    /\b(solve|simplify|factor|expand|evaluate|derive|differentiate|integrate|quadratic|equation|expression|step by step)\b/i.test(text) ||
    /(?:^|\s)-?\d*[a-z]\^?\d*/i.test(input) ||
    /[=+\-*/^]/.test(input) && /\d/.test(input)
  );
}

function looksLikeTaskDataQuestion(input: string) {
  return /\b(what should i work on|what('?s| is) next|show|list|which).{0,35}\b(tasks?|due|priority|work on)\b|\b(tasks?|anything)\s+due\s+(this|next)\s+week\b/i.test(input);
}

function looksLikeBulkReschedule(input: string) {
  return /\b(move|reschedule|shift|push)\b.{0,45}\b(unfinished|incomplete|remaining|all|tasks?)\b.{0,30}\b(tomorrow|next\s+\w+|today)\b/i.test(input);
}

function normalizeTitle(title: string) {
  const corrections: Array<[RegExp, string]> = [
    [/\bspanisn\b/gi, "Spanish"],
    [/\bspansih\b/gi, "Spanish"],
    [/\bspainish\b/gi, "Spanish"],
    [/\benglsh\b/gi, "English"],
    [/\bengish\b/gi, "English"],
    [/\bmat\b/gi, "math"],
    [/\bmth\b/gi, "math"],
    [/\bsciene\b/gi, "science"],
    [/\bhistry\b/gi, "history"],
    [/\bchem\b/gi, "chemistry"],
    [/\bbio\b/gi, "biology"],
    [/\bgeo\b/gi, "geometry"],
    [/\bcalc\b/gi, "calculus"],
  ];

  let trimmed = title
    .replace(/^to\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of corrections) {
    trimmed = trimmed.replace(pattern, replacement);
  }

  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .map((word, index) => {
      if (/^(spanish|english|french|math|science|history|biology|chemistry|geometry|calculus|algebra)$/i.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(" ");
}

function formatScheduleLabel(date?: string, time?: string) {
  if (!date && !time) return undefined;
  const parts = [];
  if (date) {
    const parsed = new Date(`${date}T12:00:00`);
    parts.push(parsed.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    }));
  }
  if (time) parts.push(time);
  return parts.join(" at ");
}

function buildTaskNotes(command: ParsedTaskCommand) {
  const notes = [
    `Velocity Type: ${taskTypeSymbols[command.taskType]} ${taskTypeLabels[command.taskType]}`,
  ];
  if (command.time) notes.push(`Time: ${command.time}`);
  if (command.scheduleLabel) notes.push(`Schedule: ${command.scheduleLabel}`);
  if (command.keywords.length > 0) notes.push(`Detected: ${command.keywords.slice(0, 8).join(", ")}`);
  return notes.join("\n");
}

function buildTaskDescription(command: ParsedTaskCommand) {
  const parts = [];
  if (command.time) parts.push(`Time: ${command.time}`);
  if (command.taskType !== "regular") parts.push(`${taskTypeSymbols[command.taskType]} ${taskTypeLabels[command.taskType]}`);
  return parts.join(" | ") || undefined;
}

function parseTaskCommand(message: string): ParsedTaskCommand | null {
  const date = parseDate(message);
  const time = parseTime(message);
  if (!looksLikeTask(message, date, time)) return null;

  const cleanedTitle = normalizeTitle(cleanTitle(message));
  const title = cleanedTitle || getSmartPlaceholderTitle(time, message);
  const taskType = inferTaskType(message, title);

  return {
    title,
    date,
    time,
    scheduleLabel: formatScheduleLabel(date, time),
    taskType,
    keywords: matchedKeywords(message),
    priority: parsePriority(message),
  };
}

function looksLikeBulkTaskRequest(message: string) {
  return mentionsTaskCreation(message) && /\b(generate|create|make|add|turn|convert|put)\b/i.test(message);
}

function looksLikeAgendaWithTasksRequest(message: string) {
  return looksLikePlanningRequest(message)
    && mentionsTaskCreation(message)
    && /\b(create|make|generate|add|build|turn|convert)\b/i.test(message);
}

function looksLikeMultiActionRequest(message: string) {
  if (looksLikeMathRequest(message) || looksLikeGeneralCreationRequest(message)) return false;
  const explicitlyRequestsSeveral = /\b(tasks|todos|subtasks|checklist|steps)\b/i.test(message)
    && /\b(create|add|generate|make|schedule|turn|break down|organize)\b/i.test(message);
  const requestsProject = /\b(create|make|set up|start|add)\b.{0,40}\bproject\b/i.test(message);
  const projectStudyWorkflow = /\bproject\b/i.test(message)
    && /\b(study|practice|work on|each day|daily|for a week|beginner)\b/i.test(message);
  const asksForSeveralTasks = explicitlyRequestsSeveral;
  const chainedActions = (message.match(/\b(create|add|make|schedule|move|plan|break down|organize)\b/gi) ?? []).length >= 2;
  return requestsProject || projectStudyWorkflow || asksForSeveralTasks || (chainedActions && explicitlyRequestsSeveral);
}

function looksLikeWorkspaceOperation(message: string) {
  if (looksLikeMathRequest(message) || looksLikeGeneralCreationRequest(message)) return false;
  const management = /\b(update|change|rename|move|assign|sort|organize|reorganize|archive|delete|remove|edit|mark)\b/i.test(message)
    && /\b(tasks?|todos?|projects?|subjects?|classes?|priorit(?:y|ies)|checklists?|subtasks?|due dates?|deadlines?|blocked)\b/i.test(message);
  const setMetadata = /\bset\b/i.test(message) && /\b(priorit(?:y|ies)|subject|project|class|due date|deadline|blocked)\b/i.test(message);
  const multiCreate = /\b(create|add|make|set up)\b/i.test(message)
    && /\b(tasks|todos|projects?|subjects?|classes?|checklists?|subtasks?)\b/i.test(message);
  const organizedSingleTask = /\b(create|add|make)\b.{0,30}\btask\b.{0,50}\b(?:under|in|for)\b.{0,30}\b(?:project|subject|class)\b/i.test(message);
  const taskPlacedUnder = /\b(create|add|make|move|assign)\b.{0,40}\btask\b.{0,60}\bunder\b/i.test(message);
  return management || setMetadata || multiCreate || organizedSingleTask || taskPlacedUnder;
}

function getPlanExpectations(message: string): PlanExpectations {
  const projectName = message.match(/\bproject\s+(?:called|named)\s+["']?(.+?)["']?(?=\s+(?:and|with|for|under|keep|subject)\b|[,.]|$)/i)?.[1]?.trim() ?? null;
  const subject = message.match(/\bsubject(?:\s+(?:is|as|to|should be))?\s+["']?([a-z][a-z &-]{1,30}?)["']?(?=\s+(?:and|with|for|then|add|create|make|schedule)\b|[,.]|$)/i)?.[1]?.trim() ?? null;
  return {
    projectRequested: /\bproject\b/i.test(message),
    tasksRequested: /\b(tasks|todos|subtasks|checklist|steps)\b/i.test(message)
      || (/\bproject\b/i.test(message) && /\b(study|practice|work on|each day|daily|for a week|beginner)\b/i.test(message)),
    projectName: projectName ? normalizeTitle(projectName).slice(0, 100) : null,
    subject: subject ? normalizeTitle(subject).slice(0, 50) : null,
    oneWeek: /\b(?:one|1)[ -]?week\b|\bfor\s+(?:a|one)\s+week\b|\bweek-long\b/i.test(message),
    originalRequest: message,
  };
}

function getLatestAssistantPlan(history: ChatHistoryMessage[]) {
  return [...history].reverse().find((item) => item.role === "assistant" && item.content.length > 20)?.content ?? "";
}

function cleanAgendaItem(line: string) {
  return line
    .replace(/^\s{0,3}(?:[-*•]|\d+[.)])\s*/u, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:day|week|session|step|task)\s+\d+\s*[:.-]\s*/i, "")
    .replace(/^\s*(?:morning|afternoon|evening|night|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[:.-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulAgendaTask(line: string) {
  if (line.length < 8 || line.length > 120) return false;
  if (/^(agenda|plan|overview|summary|tips|notes?|goal|goals|here'?s|sure|absolutely)\b/i.test(line)) return false;
  if (/^(warm-up|cooldown|break|review)$/i.test(line)) return false;
  return /\b(practice|review|solve|study|complete|take|do|work on|learn|memorize|drill|read|watch|analyze|check|reflect|write|outline|quiz|test|problems?)\b/i.test(line);
}

function parseBulkTaskCommands(message: string, history: ChatHistoryMessage[]): ParsedTaskCommand[] {
  if (!looksLikeBulkTaskRequest(message)) return [];

  const source = getLatestAssistantPlan(history);
  if (!source) return [];

  const seen = new Set<string>();
  return source
    .split(/\r?\n/)
    .map(cleanAgendaItem)
    .filter(isUsefulAgendaTask)
    .map((line) => {
      const title = normalizeTitle(line.replace(/[:：]\s*.+$/, "").trim() || line);
      const taskType = inferTaskType(`${message} ${source}`, title);
      const priority = parsePriority(line);
      return {
        title,
        taskType,
        priority,
        keywords: matchedKeywords(`${message} ${line}`),
      } satisfies ParsedTaskCommand;
    })
    .filter((command) => {
      const key = command.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return command.title.length > 0;
    })
    .slice(0, 10);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleGroqRequest<T>(operation: () => Promise<T>) {
  const run = async () => {
    const elapsed = Date.now() - lastGroqRequestAt;
    if (elapsed < groqMinRequestIntervalMs) {
      await wait(groqMinRequestIntervalMs - elapsed);
    }

    lastGroqRequestAt = Date.now();
    return operation();
  };

  const queued = groqQueue.then(run, run);
  groqQueue = queued.catch(() => undefined);
  return queued;
}

async function scheduleGeminiRequest<T>(operation: () => Promise<T>) {
  const run = async () => {
    const elapsed = Date.now() - lastGeminiRequestAt;
    if (elapsed < geminiMinRequestIntervalMs) {
      await wait(geminiMinRequestIntervalMs - elapsed);
    }

    lastGeminiRequestAt = Date.now();
    return operation();
  };

  const queued = geminiQueue.then(run, run);
  geminiQueue = queued.catch(() => undefined);
  return queued;
}

function formatConversationForGemini(history: ChatHistoryMessage[], message: string) {
  const previous = history
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "Velocity Assistant" : "User"}: ${item.content}`)
    .join("\n");

  return previous ? `${previous}\nUser: ${message}` : message;
}

async function generateGeminiReply(message: string, taskContext: string, history: ChatHistoryMessage[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenAI({ apiKey });
  let lastError: unknown;

  for (const model of velocityGeminiModels) {
    try {
      const response = await scheduleGeminiRequest(() => client.models.generateContent({
        model,
        contents: formatConversationForGemini(history, message),
        config: {
          systemInstruction: `${systemPrompt} ${taskContext}`,
          maxOutputTokens: assistantMaxOutputTokens,
          temperature: 0.35,
        },
      }));

      const text = response.text;
      if (!text) {
        throw new Error(`Gemini returned an empty response for ${model}`);
      }

      return text;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

async function generateGroqReply(message: string, taskContext: string, history: ChatHistoryMessage[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const client = new Groq({ apiKey });

  let lastError: unknown;

  for (const model of velocityGroqModels) {
    try {
      const response = await scheduleGroqRequest(() => client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: taskContext },
          ...history.slice(-8).map((item) => ({
            role: item.role,
            content: item.content,
          })),
          { role: "user", content: message },
        ],
        max_tokens: assistantMaxOutputTokens,
        temperature: 0.35,
      }));

      const text = response.choices[0]?.message?.content;
      if (!text) {
        throw new Error(`Groq returned an empty response for ${model}`);
      }

      return text;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Groq request failed");
}

async function generateAssistantReply(message: string, taskContext: string, history: ChatHistoryMessage[], log?: AssistantLogger) {
  try {
    return {
      provider: "gemini" as const,
      reply: await generateGeminiReply(message, taskContext, history),
    };
  } catch (geminiError) {
    log?.warn?.({ err: geminiError }, "Gemini assistant request failed; falling back to Groq");
    return {
      provider: "groq" as const,
      reply: await generateGroqReply(message, taskContext, history),
    };
  }
}

async function generateStrictWorkspaceDecision(instruction: string, history: ChatHistoryMessage[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const client = new Groq({ apiKey });
  const response = await scheduleGroqRequest(() => client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: "You are Velocity's workspace action planner. Infer meaning from the whole conversation. Return only the requested structured decision and never claim an action already happened.",
      },
      ...history.slice(-6).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: instruction },
    ],
    max_tokens: 5000,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "velocity_workspace_decision",
        description: "Classify the request and propose safe task manager operations.",
        strict: true,
        schema: workspaceDecisionSchema,
      },
    },
  }));
  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty workspace decision");
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return parsed;
}

function extractJsonObject(text: string) {
  const match = text.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return null; }
}

function validateActionPlan(value: Record<string, unknown> | null, expectations?: PlanExpectations): AssistantActionPlan | null {
  if (!value || !Array.isArray(value.tasks)) return null;
  const rawProject = value.project && typeof value.project === "object" ? value.project as Record<string, unknown> : null;
  const projectName = typeof rawProject?.name === "string" ? normalizeTitle(rawProject.name).slice(0, 100) : "";
  const resolvedProjectName = expectations?.projectName ?? projectName;
  const project: AssistantProjectPlan | null = resolvedProjectName ? {
    name: resolvedProjectName,
    subject: expectations?.subject ?? (typeof rawProject?.subject === "string" ? normalizeTitle(rawProject.subject).slice(0, 50) : null),
    description: typeof rawProject?.description === "string" ? rawProject.description.trim().slice(0, 1000) || null : null,
    dueDate: typeof rawProject?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawProject.dueDate) ? rawProject.dueDate : null,
  } : null;
  let tasks = value.tasks.flatMap((item): AssistantPlannedTask[] => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const title = typeof raw.title === "string" ? normalizeTitle(raw.title).slice(0, 140) : "";
    if (!title) return [];
    const priority: Priority = typeof raw.priority === "string" && ["critical", "high", "medium", "low"].includes(raw.priority) ? raw.priority as Priority : "medium";
    const taskKind = typeof raw.taskKind === "string" && ["assignment", "test", "quiz", "project", "note", "reading", "practice"].includes(raw.taskKind) ? raw.taskKind : "practice";
    return [{
      title,
      description: typeof raw.description === "string" ? raw.description.trim().slice(0, 500) || null : null,
      subject: typeof raw.subject === "string" ? normalizeTitle(raw.subject).slice(0, 50) : project?.subject ?? null,
      dueDate: typeof raw.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : null,
      priority,
      estimatedMinutes: Number.isFinite(Number(raw.estimatedMinutes)) ? Math.min(480, Math.max(5, Number(raw.estimatedMinutes))) : null,
      taskKind,
    }];
  }).filter((task, index, all) => all.findIndex((item) => item.title.toLowerCase() === task.title.toLowerCase()) === index).slice(0, 15);
  const normalizedRequest = normalizeTitle(expectations?.originalRequest ?? "").toLowerCase();
  if (tasks.some((task) => {
    const title = task.title.toLowerCase();
    return title === normalizedRequest || /\bcreate (?:a )?project\b|\bproject (?:called|named)\b/.test(title);
  })) return null;
  if (expectations?.projectRequested && !project) return null;
  if (expectations && !expectations.tasksRequested) tasks = [];
  if (expectations?.tasksRequested && tasks.length < 2) return null;
  if (expectations?.oneWeek && tasks.length < 7) return null;
  if (expectations?.oneWeek) {
    tasks = tasks.slice(0, 7).map((task, index) => ({
      ...task,
      subject: task.subject ?? expectations.subject ?? project?.subject ?? null,
      dueDate: formatDate(addDays(index)),
    }));
  }
  if (!project && tasks.length < 2) return null;
  return { summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 300) : "Review the proposed work before adding it.", project, tasks };
}

async function generateActionPlan(message: string, history: ChatHistoryMessage[], log?: AssistantLogger) {
  const today = new Date().toISOString().slice(0, 10);
  const expectations = getPlanExpectations(message);
  const instruction = [
    "Translate the user's complete multi-step request into one strict JSON object. Return JSON only, with no Markdown fences.",
    'Schema: {"summary":string,"project":null|{"name":string,"subject":string|null,"description":string|null,"dueDate":"YYYY-MM-DD"|null},"tasks":[{"title":string,"description":string|null,"subject":string|null,"dueDate":"YYYY-MM-DD"|null,"priority":"critical"|"high"|"medium"|"low","estimatedMinutes":number|null,"taskKind":"assignment"|"test"|"quiz"|"project"|"note"|"reading"|"practice"}]}.',
    "Capture every requested action and relationship. A request to create a project and study tasks must include the project plus specific linked tasks, never one task containing the whole prompt.",
    "Task titles must be concrete actions and must not repeat the user's request. Use descriptions for scope or study instructions.",
    "If the user requests a one-week beginner plan, create seven progressively ordered daily tasks and schedule them from today through the next six days unless another start date is supplied.",
    "Do not create a project unless the user asks for one. Do not invent deadlines unless a duration or schedule implies them. Limit the plan to 15 tasks.",
    `Today is ${today}. User request: ${JSON.stringify(message)}`,
  ].join(" ");
  const first = await generateAssistantReply(instruction, "This request is only for strict structured action planning. Output JSON only.", history.slice(-4), log);
  let plan = validateActionPlan(extractJsonObject(first.reply), expectations);
  if (!plan) {
    const repair = await generateAssistantReply(`Repair this into the required JSON schema. Preserve every explicit project name, subject, requested action, and duration. A one-week request needs exactly seven concrete tasks. Never use the full user prompt as a task title. Original request: ${JSON.stringify(message)}. Invalid result: ${first.reply}`, "Output one valid JSON object only.", [], log);
    plan = validateActionPlan(extractJsonObject(repair.reply), expectations);
  }
  if (!plan) throw new Error("The assistant could not produce a valid multi-step plan. Please retry the request.");
  return { plan, provider: first.provider };
}

function validPriority(value: unknown): Priority | undefined {
  return typeof value === "string" && ["critical", "high", "medium", "low"].includes(value) ? value as Priority : undefined;
}

function validDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function validColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

function validateWorkspacePlan(
  value: Record<string, unknown> | null,
  current: {
    tasks: Array<typeof tasksTable.$inferSelect>;
    projects: Array<typeof projectsTable.$inferSelect>;
    subjects: Array<typeof subjectsTable.$inferSelect>;
  },
): WorkspaceActionPlan | null {
  if (!value || !Array.isArray(value.operations)) return null;
  const taskIds = new Set(current.tasks.map((item) => item.id));
  const projectIds = new Set(current.projects.map((item) => item.id));
  const subjectIds = new Set(current.subjects.map((item) => item.id));
  const taskById = new Map(current.tasks.map((item) => [item.id, item]));
  const projectById = new Map(current.projects.map((item) => [item.id, item]));
  const subjectById = new Map(current.subjects.map((item) => [item.id, item]));
  const projectNames = new Set(current.projects.map((item) => item.name.toLowerCase()));
  const subjectNames = new Set(current.subjects.map((item) => item.name.toLowerCase()));
  const operations: WorkspaceOperation[] = [];

  for (const item of value.operations.slice(0, 25)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const type = typeof raw.type === "string" ? raw.type : "";
    const targetId = Number(raw.targetId);
    const name = typeof raw.name === "string" ? normalizeTitle(raw.name).slice(0, 100) : "";
    const title = typeof raw.title === "string" ? normalizeTitle(raw.title).slice(0, 160) : "";
    const subject = typeof raw.subject === "string" ? normalizeTitle(raw.subject).slice(0, 50) : raw.clearSubject === true ? null : undefined;
    const projectName = typeof raw.projectName === "string" ? normalizeTitle(raw.projectName).slice(0, 100) : raw.clearProject === true ? null : undefined;
    const priority = validPriority(raw.priority);
    const dueDate = raw.clearDueDate === true ? null : typeof raw.dueDate === "string" ? validDate(raw.dueDate) : undefined;
    const description = raw.clearDescription === true ? null : typeof raw.description === "string" ? raw.description.trim().slice(0, 1000) || null : undefined;
    const estimatedMinutes = typeof raw.estimatedMinutes === "number" && Number.isFinite(raw.estimatedMinutes) ? Math.min(480, Math.max(5, raw.estimatedMinutes)) : undefined;
    const difficulty = Number.isInteger(Number(raw.difficulty)) ? Math.min(3, Math.max(1, Number(raw.difficulty))) : undefined;
    const blocked = typeof raw.blocked === "boolean" ? raw.blocked : undefined;
    const archived = typeof raw.archived === "boolean" ? raw.archived : undefined;

    if (type === "create_subject" && name && !subjectNames.has(name.toLowerCase())) {
      operations.push({ type, label: `Create subject ${name}`, name: name.slice(0, 40), color: validColor(raw.color) ?? "#2563eb" });
      subjectNames.add(name.toLowerCase());
    } else if (type === "update_subject" && subjectIds.has(targetId)) {
      const existing = subjectById.get(targetId);
      const safeName = name && (name.toLowerCase() === existing?.name.toLowerCase() || !subjectNames.has(name.toLowerCase())) ? name.slice(0, 40) : "";
      const color = validColor(raw.color);
      const changes = [safeName ? `name to ${safeName}` : "", color ? `color to ${color}` : "", archived !== undefined ? archived ? "archive" : "restore" : ""].filter(Boolean).join(", ");
      if (changes) {
        operations.push({ type, label: `Update subject ${existing?.name ?? `#${targetId}`}: ${changes}`, targetId, ...(safeName ? { name: safeName } : {}), ...(color ? { color } : {}), ...(archived !== undefined ? { archived } : {}) });
        if (safeName && existing) {
          subjectNames.delete(existing.name.toLowerCase());
          subjectNames.add(safeName.toLowerCase());
        }
      }
    } else if (type === "delete_subject" && subjectIds.has(targetId) && subjectById.get(targetId)?.name.toLowerCase() !== "other") {
      operations.push({ type, label: `Delete subject ${subjectById.get(targetId)?.name ?? `#${targetId}`}`, targetId });
    } else if (type === "create_project" && name) {
      const status = typeof raw.status === "string" && ["active", "planning", "waiting", "completed"].includes(raw.status) ? raw.status : "active";
      operations.push({ type, label: `Create project ${name}${subject ? ` in ${subject}` : ""}`, name, subject: subject ?? null, priority: priority ?? "medium", dueDate: dueDate ?? null, description: description ?? null, status });
      projectNames.add(name.toLowerCase());
    } else if (type === "update_project" && projectIds.has(targetId)) {
      const status = typeof raw.status === "string" && ["active", "planning", "waiting", "completed"].includes(raw.status) ? raw.status : undefined;
      const changes = [name ? `name to ${name}` : "", subject !== undefined ? `subject to ${subject ?? "none"}` : "", priority ? `priority to ${priority}` : "", dueDate !== undefined ? `due to ${dueDate ?? "none"}` : "", description !== undefined ? "description" : "", status ? `status to ${status}` : "", archived !== undefined ? archived ? "archive" : "restore" : ""].filter(Boolean).join(", ");
      if (changes) {
        operations.push({ type, label: `Update project ${projectById.get(targetId)?.name ?? `#${targetId}`}: ${changes}`, targetId, ...(name ? { name } : {}), ...(subject !== undefined ? { subject } : {}), ...(priority ? { priority } : {}), ...(dueDate !== undefined ? { dueDate } : {}), ...(description !== undefined ? { description } : {}), ...(status ? { status } : {}), ...(archived !== undefined ? { archived } : {}) });
        if (name) projectNames.add(name.toLowerCase());
      }
    } else if (type === "delete_project" && projectIds.has(targetId)) {
      operations.push({ type, label: `Delete project ${projectById.get(targetId)?.name ?? `#${targetId}`}`, targetId });
    } else if (type === "create_task" && title) {
      if (projectName && !projectNames.has(projectName.toLowerCase())) return null;
      const status = typeof raw.status === "string" && ["todo", "backlog", "in_progress"].includes(raw.status) ? raw.status : "todo";
      operations.push({ type, label: `Create task ${title}${projectName ? ` in ${projectName}` : subject ? ` in ${subject}` : ""}`, title, subject: subject ?? null, projectName: projectName ?? null, priority: priority ?? "medium", dueDate: dueDate ?? null, estimatedMinutes: estimatedMinutes ?? null, difficulty: difficulty ?? 2, status, blocked: blocked ?? false });
    } else if (type === "update_task" && taskIds.has(targetId)) {
      if (projectName && !projectNames.has(projectName.toLowerCase())) return null;
      const status = typeof raw.status === "string" && ["todo", "backlog", "in_progress"].includes(raw.status) ? raw.status : undefined;
      const changes = [title ? `title to ${title}` : "", subject !== undefined ? `subject to ${subject ?? "none"}` : "", projectName !== undefined ? `project to ${projectName ?? "none"}` : "", priority ? `priority to ${priority}` : "", dueDate !== undefined ? `due to ${dueDate ?? "none"}` : "", estimatedMinutes !== undefined ? `estimate to ${estimatedMinutes ?? "none"}${estimatedMinutes ? " min" : ""}` : "", difficulty !== undefined ? `difficulty to ${difficulty}` : "", status ? `status to ${status}` : "", blocked !== undefined ? blocked ? "mark blocked" : "unblock" : ""].filter(Boolean).join(", ");
      if (changes) {
        operations.push({ type, label: `Update task ${taskById.get(targetId)?.title ?? `#${targetId}`}: ${changes}`, targetId, ...(title ? { title } : {}), ...(subject !== undefined ? { subject } : {}), ...(projectName !== undefined ? { projectName } : {}), ...(priority ? { priority } : {}), ...(dueDate !== undefined ? { dueDate } : {}), ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}), ...(difficulty !== undefined ? { difficulty } : {}), ...(status ? { status } : {}), ...(blocked !== undefined ? { blocked } : {}) });
      }
    } else if (type === "delete_task" && taskIds.has(targetId)) {
      operations.push({ type, label: `Delete task ${taskById.get(targetId)?.title ?? `#${targetId}`}`, targetId });
    } else if (type === "add_checklist_item" && taskIds.has(targetId) && title) {
      operations.push({ type, label: `Add checklist item to ${taskById.get(targetId)?.title ?? `task #${targetId}`}: ${title}`, targetId, title: title.slice(0, 200) });
    }
  }

  if (operations.length === 0) return null;
  return {
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 300) : "Review these workspace changes before applying them.",
    operations,
  };
}

async function generateWorkspaceActionPlan(userId: string, message: string, history: ChatHistoryMessage[], log?: AssistantLogger) {
  const [tasks, projects, subjects] = await Promise.all([
    db.select().from(tasksTable).where(eq(tasksTable.userId, userId)),
    db.select().from(projectsTable).where(eq(projectsTable.userId, userId)),
    db.select().from(subjectsTable).where(eq(subjectsTable.userId, userId)),
  ]);
  const current = { tasks, projects, subjects };
  const context = {
    tasks: tasks.slice(0, 100).map((task) => ({ id: task.id, title: task.title, priority: task.priority, status: task.status, subject: task.subject, projectId: task.projectId, dueDate: task.dueDate })),
    projects: projects.slice(0, 60).map((project) => ({ id: project.id, name: project.name, subject: project.subject, priority: project.priority, status: project.status, archived: project.archived })),
    subjects: subjects.slice(0, 40).map((subjectItem) => ({ id: subjectItem.id, name: subjectItem.name, archived: subjectItem.archived })),
  };
  const instruction = [
    "Decide whether the user wants Velocity data changed or is asking for a general answer.",
    "Set intent to workspace_changes whenever the desired result includes creating, saving, editing, organizing, rescheduling, archiving, or deleting tasks, projects, subjects, or checklist steps. Infer this semantically from the full request; do not depend on exact command words.",
    "Set intent to workspace_query when the user wants to inspect, filter, count, or get advice about their saved Velocity data without changing it.",
    "Set intent to general for math, explanations, essays, brainstorming, or a plan that should only be shown in chat. If the user asks both to develop a plan and add its work to Velocity, use workspace_changes and create every concrete operation needed.",
    "For general and workspace_query intents, return an empty operations array. For workspace_changes, return all operations in dependency order.",
    "For every unused nullable operation field return null. Set clearSubject, clearProject, clearDueDate, or clearDescription true only when the user explicitly asks to remove that value; otherwise each flag must be false. Use targetId from the current workspace for updates and deletes; never guess an ID.",
    "A new project with a subject and tasks normally requires: create_subject only when missing, then create_project, then specific create_task operations whose projectName exactly matches the project name and whose subject matches the project subject.",
    "Do not copy the user's whole sentence into a title. Make each title concise, specific, and actionable. Correct obvious typos while preserving names and meaning.",
    "Preserve priorities, dates, durations, statuses, and relationships. A task or project without an explicit deadline must have dueDate null and must still be created.",
    "When an update refers to an existing item, resolve it from the supplied workspace by meaning and use its exact ID. If the reference is genuinely ambiguous, choose general and explain the ambiguity in summary instead of guessing.",
    "Task statuses may be todo, backlog, or in_progress. Project statuses may be active, planning, waiting, or completed. Task completion must use the normal task UI because it awards VP.",
    `Today is ${formatDate(new Date())}. Current workspace: ${JSON.stringify(context)}. Current user request: ${JSON.stringify(message)}`,
  ].join(" ");

  try {
    let value = await generateStrictWorkspaceDecision(instruction, history);
    if (value.intent === "general" || value.intent === "workspace_query") return { intent: value.intent, plan: null, provider: "groq" as const };
    let plan = value.intent === "workspace_changes" ? validateWorkspacePlan(value, current) : null;
    if (!plan) {
      value = await generateStrictWorkspaceDecision(`${instruction} Your previous decision could not be safely validated. Rebuild it with valid IDs, exact project names, complete dependency ordering, and at least one valid operation.`, history);
      plan = value.intent === "workspace_changes" ? validateWorkspacePlan(value, current) : null;
    }
    if (!plan) throw new Error("The structured workspace decision was not actionable");
    return { intent: "workspace_changes" as const, plan, provider: "groq" as const };
  } catch (groqError) {
    log?.warn?.({ err: groqError }, "Strict Groq workspace planning failed; using provider fallback");
    const fallback = await generateAssistantReply(
      `${instruction} Return JSON only using {"intent":"workspace_changes"|"workspace_query"|"general","summary":string,"operations":array}.`,
      "This is a semantic intent and workspace planning call. Output one JSON object only.",
      history.slice(-6),
      log,
    );
    const value = extractJsonObject(fallback.reply);
    if (value?.intent === "general" || value?.intent === "workspace_query") return { intent: value.intent, plan: null, provider: fallback.provider };
    const plan = value?.intent === "workspace_changes" ? validateWorkspacePlan(value, current) : null;
    if (!plan) throw new Error("The assistant could not produce a safe workspace preview. Please retry the request.");
    return { intent: "workspace_changes" as const, plan, provider: fallback.provider };
  }
}

async function inferTaskIntent(message: string, history: ChatHistoryMessage[], log?: AssistantLogger): Promise<ParsedTaskCommand | null> {
  if (looksLikeMathRequest(message) || looksLikeGeneralCreationRequest(message) || looksLikePlanningRequest(message) || looksLikeTaskDataQuestion(message)) return null;
  try {
    const classifierPrompt = [
      "Classify the user's intent. Return only one JSON object and no Markdown.",
      'Schema: {"intent":"create_task"|"general","title":string|null,"date":string|null,"time":string|null,"priority":"critical"|"high"|"medium"|"low"}.',
      "Choose create_task only when the user wants an action remembered, scheduled, tracked, or added to their workload.",
      "Choose general for questions, math, writing, explanations, brainstorming, plans, agendas, and requests to produce content unless the user explicitly asks to save resulting actions as tasks.",
      "For create_task, remove scheduling words from title, correct obvious spelling errors, and keep the actual action. Use YYYY-MM-DD dates and h:mm AM/PM times. Use null when absent.",
      `Today is ${new Date().toISOString().slice(0, 10)}. User message: ${JSON.stringify(message)}`,
    ].join(" ");
    const generated = await generateAssistantReply(classifierPrompt, "This is an intent-classification call. Output strict JSON only.", history.slice(-2), log);
    const value = extractJsonObject(generated.reply);
    if (value?.intent !== "create_task" || typeof value.title !== "string") return null;
    const title = normalizeTitle(value.title).slice(0, 140);
    if (!title) return null;
    const modelDate = typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : undefined;
    const modelTime = typeof value.time === "string" && value.time.trim() ? value.time.trim().slice(0, 20) : undefined;
    const date = modelDate ?? parseDate(message);
    const time = modelTime ?? parseTime(message);
    const priority = typeof value.priority === "string" && ["critical", "high", "medium", "low"].includes(value.priority) ? value.priority as Priority : parsePriority(message);
    return { title, date, time, scheduleLabel: formatScheduleLabel(date, time), taskType: inferTaskType(message, title), keywords: matchedKeywords(message), priority };
  } catch (err) {
    log?.warn?.({ err }, "Task intent classifier failed; continuing as general chat");
    return null;
  }
}

function parseHistory(value: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChatHistoryMessage => {
      if (typeof item !== "object" || item === null) return false;
      const maybe = item as { role?: unknown; content?: unknown };
      return (maybe.role === "assistant" || maybe.role === "user") && typeof maybe.content === "string";
    })
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 2000),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-8);
}

function getGroqStatus(err: unknown) {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }

  return undefined;
}

function formatGroqError(err: unknown) {
  if (!(err instanceof Error)) return "Groq request failed.";
  if (getGroqStatus(err) === 429) {
    return "Groq is temporarily rate limited. The Velocity request queue is active; try again in a moment.";
  }
  return err.message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .slice(0, 400);
}

function formatAiError(err: unknown) {
  if (!(err instanceof Error)) return "AI request failed.";
  return err.message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/key=[A-Za-z0-9._-]+/g, "key=[redacted]")
    .slice(0, 400);
}

router.post("/ai/chat", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const history = parseHistory(req.body?.history);
    const decision = await generateWorkspaceActionPlan(req.user.id, message, history, req.log);
    if (decision.plan) {
      res.json({
        reply: [
          decision.plan.summary,
          "**Proposed changes**",
          ...decision.plan.operations.map((operation) => `- ${operation.label}`),
          "Would you like me to apply these changes?",
        ].join("\n\n"),
        provider: decision.provider,
        taskCreated: false,
        task: null,
        tasks: [],
        taskPreview: [],
        workspacePreview: decision.plan,
        planPreview: null,
        actionPreview: null,
      });
      return;
    }

    let semanticContext = "This is a general request. Do not create, update, or claim to save any Velocity data.";
    if (decision.intent === "workspace_query") {
      const [tasks, projects, subjects] = await Promise.all([
        db.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed"))),
        db.select().from(projectsTable).where(eq(projectsTable.userId, req.user.id)),
        db.select().from(subjectsTable).where(eq(subjectsTable.userId, req.user.id)),
      ]);
      semanticContext = [
        "Answer using only the user's actual Velocity workspace data. Do not invent records or claim changes.",
        `Tasks: ${JSON.stringify(tasks.slice(0, 100).map((task) => ({ title: task.title, dueDate: task.dueDate, priority: task.priority, status: task.status, subject: task.subject, projectId: task.projectId, estimatedMinutes: task.estimatedMinutes, blocked: task.blocked })))}`,
        `Projects: ${JSON.stringify(projects.slice(0, 60).map((project) => ({ id: project.id, name: project.name, subject: project.subject, priority: project.priority, dueDate: project.dueDate, status: project.status })))}`,
        `Subjects: ${JSON.stringify(subjects.slice(0, 40).map((subject) => subject.name))}`,
      ].join(" ");
    }
    const semanticReply = await generateAssistantReply(message, semanticContext, history, req.log);
    res.json({
      reply: cleanAssistantReply(semanticReply.reply),
      provider: semanticReply.provider,
      taskCreated: false,
      task: null,
      tasks: [],
      taskPreview: [],
      workspacePreview: null,
      planPreview: null,
      actionPreview: null,
    });
    return;

    /* Legacy parser source retained temporarily for rollback reference.
    if (looksLikeMultiActionRequest(message)) {
      const generated = await generateActionPlan(message, history, req.log);
      const projectLine = generated.plan.project ? `**Project:** ${generated.plan.project.name}${generated.plan.project.subject ? ` · ${generated.plan.project.subject}` : ""}` : "";
      const taskLines = generated.plan.tasks.length > 0
        ? ["**Proposed tasks**", ...generated.plan.tasks.map((task, index) => `${index + 1}. ${task.title}${task.dueDate ? ` · ${task.dueDate}` : ""}`)]
        : [];
      const confirmationLine = generated.plan.project
        ? "Would you like me to create this project and its proposed tasks?"
        : "Would you like me to create these tasks?";
      res.json({
        reply: [generated.plan.summary, projectLine, ...taskLines, confirmationLine].filter(Boolean).join("\n\n"),
        provider: generated.provider,
        taskCreated: false,
        task: null,
        tasks: [],
        taskPreview: [],
        planPreview: generated.plan,
        actionPreview: null,
      });
      return;
    }
    const dataQuestion = looksLikeTaskDataQuestion(message);
    const bulkReschedule = looksLikeBulkReschedule(message);
    const agendaWithTasks = looksLikeAgendaWithTasksRequest(message);
    const bulkCommands = agendaWithTasks ? [] : parseBulkTaskCommands(message, history);
    let parsedCommand = bulkCommands.length > 0 || agendaWithTasks || dataQuestion || bulkReschedule ? null : parseTaskCommand(message);
    if (!parsedCommand && bulkCommands.length === 0 && !agendaWithTasks && !dataQuestion && !bulkReschedule) {
      parsedCommand = await inferTaskIntent(message, history, req.log);
    }
    let taskPreview: ParsedTaskCommand[] = [];
    let agendaReply: string | null = null;

    if (agendaWithTasks) {
      const agendaContext = [
        "The user asked for an agenda and for its actions to become real tasks.",
        "First write a concise, specific agenda. Use 4-8 Markdown bullets.",
        "Every bullet must start with a clear action and contain one concrete concept, topic, or deliverable.",
        "Do not say that a task was created yet. The backend will save each agenda item after you respond.",
      ].join(" ");
      const generated = await generateAssistantReply(message, agendaContext, history, req.log);
      agendaReply = cleanAssistantReply(generated.reply);

      const agendaCommands = parseBulkTaskCommands(
        "create tasks from this agenda",
        [...history, { role: "assistant", content: agendaReply }],
      );

      taskPreview = agendaCommands;
    }

    if (!agendaWithTasks && bulkCommands.length > 0) {
      taskPreview = bulkCommands;
    } else if (parsedCommand) {
      taskPreview = [parsedCommand];
    }

    const activeTasks = dataQuestion ? await db.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed"))) : [];
    const relevantTasks = activeTasks.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31")).slice(0, 12);
    const taskContext = bulkReschedule
      ? "The user requested a bulk reschedule. Do not claim it happened. Tell them a confirmation preview is ready."
      : dataQuestion
        ? relevantTasks.length > 0
          ? `Use only these actual active tasks to answer: ${relevantTasks.map((task) => `${task.title} [due ${task.dueDate ?? "unscheduled"}, priority ${task.priority}]`).join("; ")}. Do not invent tasks or dates.`
          : "The user's stored active task list is empty. State that clearly."
      : taskPreview.length > 0
        ? [
          "No database action has been performed.",
          `A confirmation preview is ready for: ${taskPreview.map((task) => task.title).join("; ")}.`,
          "Ask the user whether they want to create the proposed task or tasks.",
        ].filter(Boolean).join(" ")
        : "Backend action completed: no task was created for this message.";
    const generated = agendaReply
      ? { reply: agendaReply, provider: "agenda" as const }
      : taskPreview.length > 0
        ? { reply: "", provider: "preview" as const }
      : await generateAssistantReply(message, taskContext, history, req.log);
    const previewQuestion = `Would you like me to create ${taskPreview.length === 1 ? "this task" : "these tasks"}?`;
    const reply = taskPreview.length > 0
      ? `${agendaReply ? `${agendaReply}\n\n` : ""}**Review before adding**\n${taskPreview.map((task) => `- ${task.title}${task.scheduleLabel ? ` · ${task.scheduleLabel}` : ""}`).join("\n")}\n\n${previewQuestion}`
      : generated.reply;

    res.json({
      reply: cleanAssistantReply(reply),
      provider: generated.provider,
      taskCreated: false,
      task: null,
      tasks: [],
      taskPreview,
      actionPreview: bulkReschedule ? { type: "reschedule-unfinished-tomorrow", count: (await db.select({ id: tasksTable.id }).from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed")))).length, label: "Move unfinished tasks to tomorrow" } : null,
    });
    */
  } catch (err) {
    req.log?.error({ err }, "AI chat request failed");
    const message = err instanceof Error && err.message === "GROQ_API_KEY is not configured"
      ? "Velocity Assistant is not connected yet. Set GEMINI_API_KEY or GROQ_API_KEY on the server."
      : `Velocity Assistant could not reach its AI providers: ${formatAiError(err)}`;
    res.status(500).json({
      error: message,
    });
  }
});

router.post("/ai/tasks/confirm", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.body?.tasks) ? req.body.tasks.slice(0, 12) : [];
  const commands: ParsedTaskCommand[] = raw.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Partial<ParsedTaskCommand>;
    const title = typeof value.title === "string" ? normalizeTitle(value.title).slice(0, 140) : "";
    if (!title) return [];
    const priority: Priority = ["critical", "high", "medium", "low"].includes(value.priority ?? "") ? value.priority as Priority : "medium";
    const taskType: TaskType = value.taskType && value.taskType in taskTypeLabels ? value.taskType : inferTaskType(title, title);
    return [{ title, priority, taskType, date: typeof value.date === "string" ? value.date : undefined, time: typeof value.time === "string" ? value.time : undefined, scheduleLabel: typeof value.scheduleLabel === "string" ? value.scheduleLabel : undefined, keywords: [] }];
  });
  if (commands.length === 0) { res.status(400).json({ error: "No valid tasks to create." }); return; }
  const inserted = await db.insert(tasksTable).values(commands.map((command) => ({ title: command.title, description: buildTaskDescription(command), priority: command.priority, dueDate: command.date, calendarDate: command.date, notes: buildTaskNotes(command), userId: req.user.id, vpValue: getVpValue(command.priority) }))).returning();
  res.status(201).json({ tasks: inserted.map((task) => ({ ...task, checklistCount: 0, checklistCompleted: 0 })) });
});

router.post("/ai/workspace/confirm", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [tasks, projects, subjects] = await Promise.all([
    db.select().from(tasksTable).where(eq(tasksTable.userId, req.user.id)),
    db.select().from(projectsTable).where(eq(projectsTable.userId, req.user.id)),
    db.select().from(subjectsTable).where(eq(subjectsTable.userId, req.user.id)),
  ]);
  const plan = validateWorkspacePlan(req.body?.plan && typeof req.body.plan === "object" ? req.body.plan as Record<string, unknown> : null, { tasks, projects, subjects });
  if (!plan) { res.status(400).json({ error: "The workspace preview is no longer valid. Ask the assistant to refresh it." }); return; }

  const applied = await db.transaction(async (tx) => {
    const taskMap = new Map(tasks.map((item) => [item.id, item]));
    const projectMap = new Map(projects.map((item) => [item.id, item]));
    const projectNameMap = new Map(projects.map((item) => [item.name.toLowerCase(), item]));
    const subjectMap = new Map(subjects.map((item) => [item.id, item]));
    const subjectNameMap = new Map(subjects.map((item) => [item.name.toLowerCase(), item]));
    const results: string[] = [];

    const ensureSubject = async (name: string) => {
      const existing = subjectNameMap.get(name.toLowerCase());
      if (existing) return existing;
      const [created] = await tx.insert(subjectsTable).values({ userId: req.user.id, name: name.slice(0, 40), color: "#2563eb" }).returning();
      subjectMap.set(created.id, created);
      subjectNameMap.set(created.name.toLowerCase(), created);
      return created;
    };

    for (const operation of plan.operations) {
      if (operation.type === "create_subject") {
        const existing = subjectNameMap.get(operation.name.toLowerCase());
        if (!existing) {
          const [created] = await tx.insert(subjectsTable).values({ userId: req.user.id, name: operation.name, color: operation.color }).returning();
          subjectMap.set(created.id, created);
          subjectNameMap.set(created.name.toLowerCase(), created);
        }
      } else if (operation.type === "update_subject") {
        const existing = subjectMap.get(operation.targetId);
        if (!existing) throw new Error("Subject no longer exists.");
        const update = { ...(operation.name ? { name: operation.name } : {}), ...(operation.color ? { color: operation.color } : {}), ...(operation.archived !== undefined ? { archived: operation.archived } : {}) };
        const [updated] = await tx.update(subjectsTable).set(update).where(and(eq(subjectsTable.id, existing.id), eq(subjectsTable.userId, req.user.id))).returning();
        if (operation.name && operation.name !== existing.name) {
          await Promise.all([
            tx.update(tasksTable).set({ subject: operation.name }).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.subject, existing.name))),
            tx.update(projectsTable).set({ subject: operation.name }).where(and(eq(projectsTable.userId, req.user.id), eq(projectsTable.subject, existing.name))),
          ]);
          subjectNameMap.delete(existing.name.toLowerCase());
        }
        subjectMap.set(updated.id, updated);
        subjectNameMap.set(updated.name.toLowerCase(), updated);
      } else if (operation.type === "delete_subject") {
        const existing = subjectMap.get(operation.targetId);
        if (!existing) throw new Error("Subject no longer exists.");
        const fallback = await ensureSubject("Other");
        await Promise.all([
          tx.update(tasksTable).set({ subject: fallback.name }).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.subject, existing.name))),
          tx.update(projectsTable).set({ subject: fallback.name }).where(and(eq(projectsTable.userId, req.user.id), eq(projectsTable.subject, existing.name))),
        ]);
        await tx.delete(subjectsTable).where(and(eq(subjectsTable.id, existing.id), eq(subjectsTable.userId, req.user.id)));
        subjectMap.delete(existing.id);
        subjectNameMap.delete(existing.name.toLowerCase());
      } else if (operation.type === "create_project") {
        if (operation.subject) await ensureSubject(operation.subject);
        const existing = projectNameMap.get(operation.name.toLowerCase());
        if (!existing) {
          const [created] = await tx.insert(projectsTable).values({ userId: req.user.id, name: operation.name, subject: operation.subject, priority: operation.priority, dueDate: operation.dueDate, description: operation.description, status: operation.status, color: "#2563eb" }).returning();
          projectMap.set(created.id, created);
          projectNameMap.set(created.name.toLowerCase(), created);
        }
      } else if (operation.type === "update_project") {
        const existing = projectMap.get(operation.targetId);
        if (!existing) throw new Error("Project no longer exists.");
        if (operation.subject) await ensureSubject(operation.subject);
        const update = { ...(operation.name ? { name: operation.name } : {}), ...(operation.subject !== undefined ? { subject: operation.subject } : {}), ...(operation.priority ? { priority: operation.priority } : {}), ...(operation.dueDate !== undefined ? { dueDate: operation.dueDate } : {}), ...(operation.description !== undefined ? { description: operation.description } : {}), ...(operation.status ? { status: operation.status } : {}), ...(operation.archived !== undefined ? { archived: operation.archived } : {}) };
        const [updated] = await tx.update(projectsTable).set(update).where(and(eq(projectsTable.id, existing.id), eq(projectsTable.userId, req.user.id))).returning();
        if (operation.subject !== undefined) {
          await tx.update(tasksTable).set({ subject: operation.subject }).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.projectId, existing.id)));
        }
        projectNameMap.delete(existing.name.toLowerCase());
        projectMap.set(updated.id, updated);
        projectNameMap.set(updated.name.toLowerCase(), updated);
      } else if (operation.type === "delete_project") {
        const existing = projectMap.get(operation.targetId);
        if (!existing) throw new Error("Project no longer exists.");
        await tx.update(tasksTable).set({ projectId: null }).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.projectId, existing.id)));
        await tx.delete(projectsTable).where(and(eq(projectsTable.id, existing.id), eq(projectsTable.userId, req.user.id)));
        projectMap.delete(existing.id);
        projectNameMap.delete(existing.name.toLowerCase());
      } else if (operation.type === "create_task") {
        const project = operation.projectName ? projectNameMap.get(operation.projectName.toLowerCase()) : null;
        if (operation.projectName && !project) throw new Error(`Project ${operation.projectName} no longer exists.`);
        const subject = operation.subject ?? project?.subject ?? null;
        if (subject) await ensureSubject(subject);
        const [created] = await tx.insert(tasksTable).values({ userId: req.user.id, title: operation.title, subject, projectId: project?.id ?? null, priority: operation.priority, vpValue: getVpValue(operation.priority), dueDate: operation.dueDate, calendarDate: operation.dueDate, estimatedMinutes: operation.estimatedMinutes, difficulty: operation.difficulty, status: operation.status, blocked: operation.blocked, organized: Boolean(subject || project) }).returning();
        taskMap.set(created.id, created);
      } else if (operation.type === "update_task") {
        const existing = taskMap.get(operation.targetId);
        if (!existing) throw new Error("Task no longer exists.");
        const project = operation.projectName ? projectNameMap.get(operation.projectName.toLowerCase()) : operation.projectName === null ? null : undefined;
        if (operation.projectName && !project) throw new Error(`Project ${operation.projectName} no longer exists.`);
        const resolvedSubject = operation.subject !== undefined ? operation.subject : project !== undefined ? project?.subject ?? null : undefined;
        if (resolvedSubject) await ensureSubject(resolvedSubject);
        const update = { ...(operation.title ? { title: operation.title } : {}), ...(resolvedSubject !== undefined ? { subject: resolvedSubject } : {}), ...(project !== undefined ? { projectId: project?.id ?? null } : {}), ...(operation.priority ? { priority: operation.priority, vpValue: getVpValue(operation.priority) } : {}), ...(operation.dueDate !== undefined ? { dueDate: operation.dueDate, calendarDate: operation.dueDate } : {}), ...(operation.estimatedMinutes !== undefined ? { estimatedMinutes: operation.estimatedMinutes } : {}), ...(operation.difficulty !== undefined ? { difficulty: operation.difficulty } : {}), ...(operation.status ? { status: operation.status } : {}), ...(operation.blocked !== undefined ? { blocked: operation.blocked } : {}) };
        const [updated] = await tx.update(tasksTable).set(update).where(and(eq(tasksTable.id, existing.id), eq(tasksTable.userId, req.user.id))).returning();
        taskMap.set(updated.id, updated);
      } else if (operation.type === "delete_task") {
        const existing = taskMap.get(operation.targetId);
        if (!existing) throw new Error("Task no longer exists.");
        await tx.delete(tasksTable).where(and(eq(tasksTable.id, existing.id), eq(tasksTable.userId, req.user.id)));
        taskMap.delete(existing.id);
      } else if (operation.type === "add_checklist_item") {
        if (!taskMap.has(operation.targetId)) throw new Error("Task no longer exists.");
        await tx.insert(checklistItemsTable).values({ taskId: operation.targetId, title: operation.title });
      }
      results.push(operation.label);
    }
    return results;
  });
  res.json({ applied, count: applied.length });
});

router.post("/ai/plans/confirm", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const plan = validateActionPlan(req.body?.plan && typeof req.body.plan === "object" ? req.body.plan as Record<string, unknown> : null);
  if (!plan) { res.status(400).json({ error: "The action plan is invalid or incomplete." }); return; }
  const result = await db.transaction(async (tx) => {
    let project: typeof projectsTable.$inferSelect | null = null;
    if (plan.project) {
      const existing = await tx.select().from(projectsTable).where(eq(projectsTable.userId, req.user.id));
      project = existing.find((item) => item.name.toLowerCase() === plan.project!.name.toLowerCase()) ?? null;
      if (!project) {
        [project] = await tx.insert(projectsTable).values({
          userId: req.user.id,
          name: plan.project.name,
          subject: plan.project.subject,
          description: plan.project.description,
          dueDate: plan.project.dueDate,
          color: "#2563eb",
          priority: "medium",
        }).returning();
      } else if (plan.project.subject && project.subject !== plan.project.subject) {
        [project] = await tx.update(projectsTable).set({ subject: plan.project.subject }).where(eq(projectsTable.id, project.id)).returning();
      }
    }
    const existingProjectTasks = project
      ? await tx.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), eq(tasksTable.projectId, project.id)))
      : [];
    const tasksToCreate = plan.tasks.filter((task) => !existingProjectTasks.some((existing) =>
      existing.title.toLowerCase() === task.title.toLowerCase() && existing.dueDate === task.dueDate
    ));
    const inserted = tasksToCreate.length > 0 ? await tx.insert(tasksTable).values(tasksToCreate.map((task) => ({
      userId: req.user.id,
      title: task.title,
      description: task.description,
      subject: task.subject ?? project?.subject ?? null,
      projectId: project?.id ?? null,
      dueDate: task.dueDate,
      calendarDate: task.dueDate,
      priority: task.priority,
      vpValue: getVpValue(task.priority),
      estimatedMinutes: task.estimatedMinutes,
      taskKind: task.taskKind,
      organized: true,
    }))).returning() : [];
    const retained = existingProjectTasks.filter((existing) => plan.tasks.some((task) =>
      existing.title.toLowerCase() === task.title.toLowerCase() && existing.dueDate === task.dueDate
    ));
    return {
      project,
      createdCount: inserted.length,
      tasks: [...retained, ...inserted].map((task) => ({ ...task, checklistCount: 0, checklistCompleted: 0 })),
    };
  });
  res.status(201).json(result);
});

router.post("/ai/actions/confirm", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.body?.type !== "reschedule-unfinished-tomorrow") { res.status(400).json({ error: "Unknown action." }); return; }
  const tomorrow = formatDate(addDays(1));
  const updated = await db.update(tasksTable).set({ dueDate: tomorrow, calendarDate: tomorrow }).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed"))).returning({ id: tasksTable.id });
  res.json({ updated: updated.length, date: tomorrow });
});

export default router;
