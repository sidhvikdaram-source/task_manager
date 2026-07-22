export type QuickCapturePriority = "critical" | "high" | "medium" | "low";

export interface QuickCaptureResult {
  title: string;
  checklist: string[];
  dueDate: string | null;
  time: string | null;
  priority: QuickCapturePriority;
  projectId: number | null;
  projectName: string | null;
  subject: string | null;
  estimatedMinutes: number | null;
  warnings: string[];
}

type NamedRecord = { id: number; name: string };

const monthNumbers: Record<string, number> = {
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

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function parseDate(text: string, referenceDate: string) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return { value: iso[1], matched: iso[0] };
  if (/\btoday\b/i.test(text))
    return { value: referenceDate, matched: text.match(/\btoday\b/i)![0] };
  if (/\btomorrow\b/i.test(text))
    return {
      value: addCalendarDays(referenceDate, 1),
      matched: text.match(/\btomorrow\b/i)![0],
    };
  const relative = text.match(/\bin\s+(\d+)\s+days?\b/i);
  if (relative)
    return {
      value: addCalendarDays(referenceDate, Number(relative[1])),
      matched: relative[0],
    };
  const month = text.match(
    new RegExp(
      `\\b(${Object.keys(monthNumbers).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`,
      "i",
    ),
  );
  if (month) {
    const currentYear = calendarDateToUtc(referenceDate).getUTCFullYear();
    let year = month[3] ? Number(month[3]) : currentYear;
    const candidate = `${year}-${String(monthNumbers[month[1].toLowerCase()]).padStart(2, "0")}-${String(Number(month[2])).padStart(2, "0")}`;
    if (!month[3] && candidate < referenceDate) year += 1;
    return {
      value: `${year}-${String(monthNumbers[month[1].toLowerCase()]).padStart(2, "0")}-${String(Number(month[2])).padStart(2, "0")}`,
      matched: month[0],
    };
  }
  const weekday = text.match(
    /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  );
  if (weekday) {
    const target = weekdays.indexOf(weekday[2].toLowerCase());
    let offset = (target - calendarWeekday(referenceDate) + 7) % 7;
    if (offset === 0) offset += 7;
    return {
      value: addCalendarDays(referenceDate, offset),
      matched: weekday[0],
    };
  }
  return null;
}

function parseTime(text: string) {
  const explicit = text.match(
    /\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i,
  );
  if (explicit)
    return {
      value: `${Number(explicit[1])}:${explicit[2] ?? "00"} ${explicit[3].toUpperCase()}`,
      matched: explicit[0],
    };
  const twentyFour = text.match(/\b(?:at\s+)([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    return {
      value: `${hour % 12 || 12}:${twentyFour[2]} ${hour >= 12 ? "PM" : "AM"}`,
      matched: twentyFour[0],
    };
  }
  const periods: Array<[RegExp, string]> = [
    [/\bmorning\b/i, "9:00 AM"],
    [/\bafternoon\b/i, "3:00 PM"],
    [/\bevening\b/i, "6:00 PM"],
    [/\bnight\b/i, "8:00 PM"],
  ];
  for (const [pattern, value] of periods) {
    const match = text.match(pattern);
    if (match) return { value, matched: match[0] };
  }
  return null;
}

function cleanLine(value: string) {
  return value.replace(/^\s*(?:[-*]\s*|\d+[.)]\s*|\[[ xX]\]\s*)/, "").trim();
}

function findNamed<T extends NamedRecord>(
  token: string | undefined,
  records: T[],
) {
  if (!token) return null;
  const normalized = token.replace(/[_-]/g, " ").toLowerCase();
  return (
    records.find((record) => {
      const name = record.name.toLowerCase();
      const compact = name.replace(/[^a-z0-9]/g, "");
      const tokenCompact = normalized.replace(/[^a-z0-9]/g, "");
      const initials = name
        .split(/\s+/)
        .map((part) => part[0])
        .join("");
      return (
        name === normalized ||
        compact === tokenCompact ||
        (tokenCompact.length >= 2 && initials === tokenCompact)
      );
    }) ?? null
  );
}

function parsePriorityPhrase(
  text: string,
): { value: QuickCapturePriority; matched: string } | null {
  const rules: Array<[QuickCapturePriority, RegExp]> = [
    [
      "low",
      /\b(?:not\s+(?:very\s+)?important|not\s+(?:urgent|critical)|not\s+a\s+priority|unimportant|no\s+rush|low\s+priority|minor|optional|whenever|can\s+wait|someday)\b/i,
    ],
    [
      "critical",
      /\b(?:critical|urgent|asap|emergency|must[ -]?do|must\s+finish|top\s+priority|highest\s+priority|extremely\s+important|very\s+important|time[ -]?sensitive)\b/i,
    ],
    [
      "high",
      /\b(?:important|high\s+priority|prioritize|needs?\s+attention|do\s+soon|soon)\b/i,
    ],
    [
      "medium",
      /\b(?:medium\s+priority|normal\s+priority|standard\s+priority)\b/i,
    ],
  ];
  for (const [value, pattern] of rules) {
    const match = text.match(pattern);
    if (match) return { value, matched: match[0] };
  }
  return null;
}

export function parseQuickCapture(
  text: string,
  projects: NamedRecord[],
  subjects: NamedRecord[],
  referenceDate = localDateKey(new Date(), "UTC"),
): QuickCaptureResult {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const sourceTitle = lines[0] ?? "";
  const checklist = lines.slice(1).map(cleanLine).filter(Boolean).slice(0, 20);
  const projectToken = sourceTitle.match(/(?:^|\s)#([\w-]+)/)?.[1];
  const subjectToken = sourceTitle.match(/(?:^|\s)@([\w-]+)/)?.[1];
  const project = findNamed(projectToken, projects);
  const subject =
    findNamed(subjectToken, subjects) ??
    (project ? null : findNamed(projectToken, subjects));
  const priorityToken = sourceTitle.match(/(?:^|\s)p([1-4])\b/i)?.[1];
  const priorityMap: Record<string, QuickCapturePriority> = {
    "1": "critical",
    "2": "high",
    "3": "medium",
    "4": "low",
  };
  const priorityPhrase = parsePriorityPhrase(sourceTitle);
  const duration = sourceTitle.match(
    /(?:^|\s)~(\d{1,3})\s*(m|min|minutes?|h|hours?)\b/i,
  );
  const estimatedMinutes = duration
    ? Math.min(480, Number(duration[1]) * (/^h/i.test(duration[2]) ? 60 : 1))
    : null;
  const date = parseDate(sourceTitle, referenceDate);
  const time = parseTime(sourceTitle);
  const warnings: string[] = [];
  if (projectToken && !project && !subject)
    warnings.push(`Project or subject #${projectToken} was not found.`);
  if (subjectToken && !subject)
    warnings.push(`Subject @${subjectToken} was not found.`);
  let title = sourceTitle
    .replace(/(?:^|\s)#[\w-]+/g, " ")
    .replace(/(?:^|\s)@[\w-]+/g, " ")
    .replace(/(?:^|\s)p[1-4]\b/gi, " ")
    .replace(/(?:^|\s)~\d{1,3}\s*(?:m|min|minutes?|h|hours?)\b/gi, " ");
  if (date) title = title.replace(date.matched, " ");
  if (time) title = title.replace(time.matched, " ");
  if (priorityPhrase) title = title.replace(priorityPhrase.matched, " ");
  title = title
    .replace(/\s+/g, " ")
    .replace(/[,:;-]+$/, "")
    .trim();
  return {
    title,
    checklist,
    dueDate: date?.value ?? null,
    time: time?.value ?? null,
    priority:
      priorityMap[priorityToken ?? ""] ?? priorityPhrase?.value ?? "medium",
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    subject: subject?.name ?? null,
    estimatedMinutes,
    warnings,
  };
}
import {
  addCalendarDays,
  calendarDateToUtc,
  calendarWeekday,
  localDateKey,
} from "./localDate";
