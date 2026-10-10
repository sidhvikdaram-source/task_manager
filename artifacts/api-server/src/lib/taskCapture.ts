import { parseCaptureDate, parseQuickCapture } from "./quickCapture";

type NamedRecord = { id: number; name: string };
const countWords: Record<string, number> = {
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
};
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countPattern =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:tasks?|todos?|subtasks?)\b/i;

export function creationMetadata(
  message: string,
  subjects: NamedRecord[],
  today: string,
) {
  const subject = [...subjects]
    .sort((a, b) => b.name.length - a.name.length)
    .find((s) => new RegExp(`\\b${escape(s.name)}\\b`, "i").test(message));
  const count = message.match(countPattern)?.[1];
  return {
    subject: subject?.name ?? null,
    dueDate: parseCaptureDate(message, today)?.value ?? null,
    count: count ? Number(countWords[count.toLowerCase()] ?? count) : null,
  };
}

/** Capture unambiguous creation requests without a model or invented titles. */
export function parseTaskCreation(
  message: string,
  projects: NamedRecord[],
  subjects: NamedRecord[],
  today: string,
) {
  const explicit =
    /^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:create|add|make|capture|remember|remind me to|i need to|i have to)\s+/i;
  const date = parseCaptureDate(message, today);
  const metadata = creationMetadata(message, subjects, today);
  if (
    !explicit.test(message) &&
    !(
      date &&
      metadata.subject &&
      !/\b(explain|why|how|write|code)\b/i.test(message)
    )
  )
    return null;
  if (/\b(project|tasks|todos|subtasks)\b/i.test(message)) {
    // An unspecified project plus a requested count can be represented exactly;
    // named steps and richer plans still go to the task model.
    if (!/\bproject\b/i.test(message) || !metadata.count || metadata.count > 20)
      return null;
    let remainder = message.replace(explicit, "");
    if (metadata.subject)
      remainder = remainder.replace(
        new RegExp(`\\b${escape(metadata.subject)}\\b`, "gi"),
        "",
      );
    if (date) remainder = remainder.replace(date.matched, "");
    remainder = remainder
      .replace(countPattern, "")
      .replace(
        /\b(?:a|an|the|project|with|in|it|and|should|be|is|subject|class|for|under|to|due|on|by|please)\b/gi,
        "",
      )
      .replace(/[\s,.!?]+/g, "");
    if (remainder) return null;
    return {
      taskPreview: [],
      planPreview: {
        summary: `Create a project with ${metadata.count} unnamed tasks${metadata.subject ? ` in ${metadata.subject}` : ""}.`,
        project: {
          name: "Untitled project",
          subject: metadata.subject,
          dueDate: metadata.dueDate,
          description: null,
        },
        tasks: Array.from({ length: metadata.count }, () => ({
          title: "",
          subject: metadata.subject,
          dueDate: metadata.dueDate,
          taskKind: "assignment",
          priority: "medium",
          estimatedMinutes: null,
        })),
      },
    };
  }
  // General writing/coding requests need General AI unless explicitly tracking a task.
  if (
    /\b(essay|code|explain|write|debug)\b/i.test(message) &&
    !/\b(task|todo|assignment|homework)\b/i.test(message)
  )
    return null;
  if (
    /\b(?:update|move|rename|delete|remove|sort|change|reschedule|then|also)\b/i.test(
      message,
    ) ||
    /[;\n]/.test(message)
  )
    return null;
  let text = message
    .replace(explicit, "")
    .replace(
      /^(?:a|an|the)?\s*(?:task|todo)(?:\s+(?:called|named|to))?\s*/i,
      "",
    );
  if (metadata.subject) {
    const placement = new RegExp(
      `(?:[,.]?\\s*(?:it\\s+)?(?:should\\s+be\\s+)?(?:in|under|for|to)\\s+(?:the\\s+)?(?:(?:subject|class)\\s+)?${escape(metadata.subject)}(?:\\s+(?:subject|class))?[.!]?)`,
      "i",
    );
    text = text.replace(placement, "");
  }
  const parsed = parseQuickCapture(text, projects, subjects, today);
  return {
    taskPreview: [
      {
        title: parsed.title.replace(/[.!]+$/, "").trim(),
        date: parsed.dueDate,
        dueDate: parsed.dueDate,
        subject: parsed.subject ?? metadata.subject,
        projectId: parsed.projectId,
        time: parsed.time,
        priority: parsed.priority,
        estimatedMinutes: parsed.estimatedMinutes,
        taskType: /\bquiz\b/i.test(message)
          ? "quiz"
          : /\b(test|exam)\b/i.test(message)
            ? "test"
            : "assignment",
        keywords: [],
      },
    ],
    planPreview: null,
  };
}
