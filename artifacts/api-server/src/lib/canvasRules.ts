const genericGroups = new Set([
  "assignments",
  "homework",
  "quizzes",
  "imported assignments",
  "course work",
  "coursework",
]);

export function normalizeCanvasChainTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(part|chapter|unit|lesson|week|day)\s*\d+\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canvasEventCategory(title: string) {
  if (/\b(quiz|test|exam|assessment|midterm|final)\b/i.test(title))
    return "Quiz/Test";
  if (
    /\b(meeting|conference|office hours|zoom|teams call|appointment|check-in)\b/i.test(
      title,
    )
  )
    return "Meeting";
  if (
    /\b(due|deadline|submit|submission|assignment|homework|worksheet|essay|paper|project)\b/i.test(
      title,
    )
  )
    return "Deadline";
  if (/\b(class|lecture|lab|seminar|lesson|workshop|period)\b/i.test(title))
    return "Class Event";
  return "Other";
}

export function canvasCategoryTaskKind(
  category: ReturnType<typeof canvasEventCategory>,
) {
  if (category === "Quiz/Test") return "test";
  if (category === "Meeting") return "meeting";
  if (category === "Class Event") return "class_event";
  if (category === "Deadline") return "deadline";
  return "other";
}

const calendarOnlyPatterns = [
  /\b(no school|school closed|campus closed|district closed|student holiday|district holiday)\b/i,
  /\b(teacher workday|teacher work day|staff development|professional development|staff holiday)\b/i,
  /\b(spring|winter|fall|thanksgiving|summer)\s+break\b/i,
  /\b(end|start|beginning)\s+of\s+(?:the\s+)?(?:first|second|third|fourth|[1-4](?:st|nd|rd|th))?\s*(?:nine weeks|grading period|semester|term)\b/i,
  /\b(?:first|second|third|fourth|[1-4](?:st|nd|rd|th))?\s*(?:nine weeks|grading period|semester|term)\s+(?:begins|ends)\b/i,
  /\b(?:bad|inclement)\s+weather\b.*\b(?:make[- ]?up|day)\b/i,
  /\b(?:make[- ]?up|makeup)\b.*\b(?:bad|inclement)\s+weather\b/i,
  /\b(early release|late arrival|report cards?|progress reports?|daylight saving)\b/i,
  /\b(memorial day|labor day|thanksgiving day|independence day|martin luther king(?: jr\.? day)?|mlk day)\b/i,
];

export function shouldCreateCanvasTask(title: string) {
  const normalized = title
    .replace(/[_–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    normalized.length > 0 &&
    !calendarOnlyPatterns.some((pattern) => pattern.test(normalized))
  );
}

const subjectKeywords: Array<[string, RegExp]> = [
  [
    "Math",
    /\b(math|algebra|geometry|calculus|statistics|trigonometry|amc|equation|functions?)\b/i,
  ],
  [
    "Science",
    /\b(science|biology|chemistry|physics|anatomy|ecology|lab|experiment)\b/i,
  ],
  [
    "English",
    /\b(english|writing|essay|grammar|literature|composition|poetry)\b/i,
  ],
  [
    "Social Studies",
    /\b(history|geography|government|civics|economics|social studies)\b/i,
  ],
  ["Spanish", /\b(spanish|espanol|vocabulario|gramatica)\b/i],
  ["Reading", /\b(reading|novel|book|chapter|annotation)\b/i],
  ["Band", /\b(band|music|instrument|concert|rehearsal)\b/i],
  [
    "Computer Science",
    /\b(computer science|coding|programming|javascript|python|algorithm)\b/i,
  ],
];

export function suggestCanvasSubject(
  title: string,
  subjects: Array<{ id: number; name: string }>,
) {
  const normalizedTitle = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const direct = subjects.find((subject) => {
    const name = subject.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return name.length >= 3 && normalizedTitle.includes(` ${name} `);
  });
  if (direct)
    return {
      subjectId: direct.id,
      subjectName: direct.name,
      reason: `"${direct.name}" appears in the title`,
      confidence: "high" as const,
    };
  for (const [defaultName, pattern] of subjectKeywords) {
    if (!pattern.test(title)) continue;
    const subject = subjects.find(
      (item) => item.name.toLowerCase() === defaultName.toLowerCase(),
    );
    if (subject)
      return {
        subjectId: subject.id,
        subjectName: subject.name,
        reason: `The title looks like ${subject.name} work`,
        confidence: "medium" as const,
      };
  }
  const other = subjects.find(
    (subject) => subject.name.toLowerCase() === "other",
  );
  return other
    ? {
        subjectId: other.id,
        subjectName: other.name,
        reason: "No reliable subject keyword was found",
        confidence: "low" as const,
      }
    : null;
}

export function isMeaningfulProjectCandidate(
  name: string,
  total: number,
  unfinished: number,
) {
  return (
    total >= 3 &&
    unfinished >= 2 &&
    !genericGroups.has(name.trim().toLowerCase())
  );
}

export function icalOccurrenceId(uid: string, start: Date) {
  return `${uid}:${start.toISOString()}`;
}
