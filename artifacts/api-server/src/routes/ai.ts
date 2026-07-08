import Groq from "groq-sdk";
import { Router, type IRouter } from "express";
import { db, tasksTable } from "@workspace/db";

const router: IRouter = Router();

const systemPrompt = [
  "You are Velocity Assistant, a hyper-focused, lightning-fast productivity engine.",
  "Keep responses crisp, actionable, and helpful.",
].join(" ");

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

function parseDate(input: string) {
  const text = input.toLowerCase();
  const now = new Date();

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
  const match = input.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minutes = match[2] ?? "00";
  const suffix = match[3].toUpperCase();
  if (hour < 1 || hour > 12) return undefined;
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
    .replace(/^\s*(please\s+)?(remind me to|add(?: a)? task to|add(?: a)? task|create(?: a)? task to|create(?: a)? task|schedule|todo)\s+/i, "")
    .replace(/\b(next\s+)?(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "")
    .replace(/\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, "")
    .replace(/\b(critical|urgent|asap|high priority|low priority|important|whenever)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+[,.;:!?]+$/g, "")
    .trim();
}

function parseTaskCommand(message: string): ParsedTaskCommand | null {
  const lower = message.toLowerCase();
  const hasCommand = /\b(remind me to|add(?: a)? task|create(?: a)? task|schedule|todo)\b/.test(lower);
  if (!hasCommand) return null;

  const title = cleanTitle(message);
  if (!title) return null;

  return {
    title,
    date: parseDate(message),
    time: parseTime(message),
    priority: parsePriority(message),
  };
}

async function generateAssistantReply(message: string, taskContext: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const client = new Groq({ apiKey });
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL ?? "llama3-8b-8192",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "system", content: taskContext },
      { role: "user", content: message },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned an empty response");
  }

  return Array.isArray(text) ? text.map((part) => (typeof part === "string" ? part : "")).join("") : text;
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
      ? `Backend action completed: created task "${createdTask.title}"${createdTask.calendarDate ? ` for ${createdTask.calendarDate}` : ""}.`
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
      : "Velocity Assistant could not reach Groq. Please try again.";
    res.status(500).json({
      error: message,
    });
  }
});

export default router;
