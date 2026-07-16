import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { Router, type IRouter } from "express";
import { db, tasksTable } from "@workspace/db";
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

// qwen/qwen3-32b is the official Velocity model because its free-tier 60 RPM gives
// more concurrency cushion than openai/gpt-oss-120b and qwen/qwen3.6-27b at 30 RPM.
const velocityGeminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const velocityGroqModels = ["qwen/qwen3-32b", "openai/gpt-oss-120b"];
const assistantMaxOutputTokens = 1800;
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

type CreatedTaskResponse = typeof tasksTable.$inferSelect & {
  checklistCount: number;
  checklistCompleted: number;
};

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
    const dataQuestion = looksLikeTaskDataQuestion(message);
    const bulkReschedule = looksLikeBulkReschedule(message);
    const agendaWithTasks = looksLikeAgendaWithTasksRequest(message);
    const bulkCommands = agendaWithTasks ? [] : parseBulkTaskCommands(message, history);
    const parsedCommand = bulkCommands.length > 0 || agendaWithTasks || dataQuestion || bulkReschedule ? null : parseTaskCommand(message);
    let createdTasks: CreatedTaskResponse[] = [];
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
      const [task] = await db
        .insert(tasksTable)
        .values({
          title: parsedCommand.title,
          description: buildTaskDescription(parsedCommand),
          priority: parsedCommand.priority,
          dueDate: parsedCommand.date,
          calendarDate: parsedCommand.date,
          notes: buildTaskNotes(parsedCommand),
          userId: req.user.id,
          vpValue: getVpValue(parsedCommand.priority),
        })
        .returning();

      createdTasks = [{ ...task, checklistCount: 0, checklistCompleted: 0 }];
    }

    const primaryTask = createdTasks[0] ?? null;
    const activeTasks = dataQuestion ? await db.select().from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed"))) : [];
    const relevantTasks = activeTasks.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31")).slice(0, 12);
    const taskContext = bulkReschedule
      ? "The user requested a bulk reschedule. Do not claim it happened. Tell them a confirmation preview is ready."
      : dataQuestion
        ? relevantTasks.length > 0
          ? `Use only these actual active tasks to answer: ${relevantTasks.map((task) => `${task.title} [due ${task.dueDate ?? "unscheduled"}, priority ${task.priority}]`).join("; ")}. Do not invent tasks or dates.`
          : "The user's stored active task list is empty. State that clearly."
      : createdTasks.length > 1
      ? [
        `Backend action completed: created ${createdTasks.length} tasks from the previous agenda/plan.`,
        `Task titles: ${createdTasks.map((task) => task.title).join("; ")}.`,
        "Respond in clean Markdown with a short confirmation and the added task titles.",
      ].filter(Boolean).join(" ")
      : primaryTask
        ? [
          `Backend action completed: created task "${primaryTask.title}".`,
          parsedCommand ? `Task type: ${taskTypeSymbols[parsedCommand.taskType]} ${taskTypeLabels[parsedCommand.taskType]}.` : "",
          parsedCommand?.scheduleLabel ? `Schedule reference: ${parsedCommand.scheduleLabel}.` : "",
          parsedCommand?.time ? `Time captured: ${parsedCommand.time}.` : "",
          "Respond in clean Markdown with a short confirmation and no extra chatter.",
        ].filter(Boolean).join(" ")
        : "Backend action completed: no task was created for this message.";
    const generated = agendaReply
      ? { reply: agendaReply, provider: "agenda" as const }
      : await generateAssistantReply(message, taskContext, history, req.log);
    const reply = taskPreview.length > 0 && agendaReply
      ? `${agendaReply}\n\n**Review before adding**\n${taskPreview.map((task) => `- ${task.title}`).join("\n")}`
      : generated.reply;

    res.json({
      reply: cleanAssistantReply(reply),
      provider: generated.provider,
      taskCreated: createdTasks.length > 0,
      task: primaryTask,
      tasks: createdTasks,
      taskPreview,
      actionPreview: bulkReschedule ? { type: "reschedule-unfinished-tomorrow", count: (await db.select({ id: tasksTable.id }).from(tasksTable).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed")))).length, label: "Move unfinished tasks to tomorrow" } : null,
    });
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

router.post("/ai/actions/confirm", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.body?.type !== "reschedule-unfinished-tomorrow") { res.status(400).json({ error: "Unknown action." }); return; }
  const tomorrow = formatDate(addDays(1));
  const updated = await db.update(tasksTable).set({ dueDate: tomorrow, calendarDate: tomorrow }).where(and(eq(tasksTable.userId, req.user.id), ne(tasksTable.status, "completed"))).returning({ id: tasksTable.id });
  res.json({ updated: updated.length, date: tomorrow });
});

export default router;
