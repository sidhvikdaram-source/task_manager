import Groq from "groq-sdk";
import { Router, type IRouter } from "express";
import { db, tasksTable } from "@workspace/db";

const router: IRouter = Router();

const systemPrompt = [
  "You are Velocity Assistant. Your output must be perfectly clean, highly professional, and devoid of messy formatting or conversational fluff.",
  "CRITICAL TASK HANDLING:",
  "- If a user specifies a time without a task name, never name the task Task at 4 or Something tomorrow.",
  "- Use contextual intelligence to generate a smart, logical placeholder name like Afternoon Focus Session, Morning Catch-up, or Project Sync based on the time frame.",
  "- Explicitly support relative time markers like tomorrow, next Monday, in two hours, or Friday afternoon.",
  "- Parse dates into clear, human-readable schedule references before returning confirmations.",
  "- Return structured Markdown only, with short bullets or bold labels when useful.",
].join(" ");

// qwen/qwen3-32b is the official Velocity model because its free-tier 60 RPM gives
// more concurrency cushion than openai/gpt-oss-120b and qwen/qwen3.6-27b at 30 RPM.
const velocityGroqModel = "qwen/qwen3-32b";
const groqMinRequestIntervalMs = 1_100;
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

type Priority = "critical" | "high" | "medium" | "low";

interface ParsedTaskCommand {
  title: string;
  date?: string;
  time?: string;
  scheduleLabel?: string;
  priority: Priority;
}

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

  const match = input.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minutes = match[2] ?? "00";
  const explicitSuffix = match[3]?.toUpperCase();
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

function cleanTitle(input: string) {
  return input
    .replace(/^\s*(please\s+)?(remind me to|remind me|set(?: a)? task(?: to)?|add(?: a)? task to|add(?: a)? task|create(?: a)? task to|create(?: a)? task|schedule|todo)\s*/i, "")
    .replace(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(hours?|days?)\b/gi, "")
    .replace(/\b(next\s+)?(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\b(morning|afternoon|evening|tonight|night)\b/gi, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "")
    .replace(/\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, "")
    .replace(/\b(critical|urgent|asap|high priority|low priority|important|whenever)\b/gi, "")
    .replace(/\b(at|by|on|for)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+[,.;:!?]+$/g, "")
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
  if (hour !== undefined && hour < 12) return "Morning Catch-up";
  if (hour !== undefined && hour < 17) return "Afternoon Focus Session";
  if (hour !== undefined && hour < 20) return "Project Sync";
  if (hour !== undefined) return "Evening Planning Block";
  if (/\btomorrow\b|\bnext\b/.test(text)) return "Planning Check-in";
  return "Focus Session";
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

function parseTaskCommand(message: string): ParsedTaskCommand | null {
  const lower = message.toLowerCase();
  const hasCommand = /\b(remind me to|remind me|set(?: a)? task|add(?: a)? task|create(?: a)? task|schedule|todo)\b/.test(lower);
  if (!hasCommand) return null;

  const date = parseDate(message);
  const time = parseTime(message);
  const cleanedTitle = cleanTitle(message);
  const title = cleanedTitle || getSmartPlaceholderTitle(time, message);

  return {
    title,
    date,
    time,
    scheduleLabel: formatScheduleLabel(date, time),
    priority: parsePriority(message),
  };
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

async function generateAssistantReply(message: string, taskContext: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const client = new Groq({ apiKey });

  const response = await scheduleGroqRequest(() => client.chat.completions.create({
    model: velocityGroqModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "system", content: taskContext },
      { role: "user", content: message },
    ],
    max_tokens: 360,
    temperature: 0.35,
  }));

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error(`Groq returned an empty response for ${velocityGroqModel}`);
  }

  return text;
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

    const parsedCommand = parseTaskCommand(message);
    let createdTask = null;

    if (parsedCommand) {
      const notes = parsedCommand.time ? `Requested time: ${parsedCommand.time}` : undefined;
      const [task] = await db
        .insert(tasksTable)
        .values({
          title: parsedCommand.title,
          priority: parsedCommand.priority,
          dueDate: parsedCommand.date,
          calendarDate: parsedCommand.date,
          notes,
          userId: req.user.id,
          vpValue:
            parsedCommand.priority === "critical" ? 25 :
            parsedCommand.priority === "high" ? 15 :
            parsedCommand.priority === "medium" ? 10 : 5,
        })
        .returning();

      createdTask = { ...task, checklistCount: 0, checklistCompleted: 0 };
    }

    const taskContext = createdTask
      ? [
        `Backend action completed: created task "${createdTask.title}".`,
        parsedCommand?.scheduleLabel ? `Schedule reference: ${parsedCommand.scheduleLabel}.` : "",
        "Respond in clean Markdown with a short confirmation and no extra chatter.",
      ].filter(Boolean).join(" ")
      : "Backend action completed: no task was created for this message.";
    const reply = await generateAssistantReply(message, taskContext);

    res.json({
      reply,
      taskCreated: Boolean(createdTask),
      task: createdTask,
    });
  } catch (err) {
    req.log?.error({ err }, "AI chat request failed");
    const message = err instanceof Error && err.message === "GROQ_API_KEY is not configured"
      ? "Velocity Assistant is not connected yet. Set GROQ_API_KEY on the server."
      : `Velocity Assistant could not reach Groq: ${formatGroqError(err)}`;
    res.status(500).json({
      error: message,
    });
  }
});

export default router;
