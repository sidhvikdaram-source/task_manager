const genericGroups = new Set(["assignments", "homework", "quizzes", "imported assignments", "course work", "coursework"]);

export function normalizeCanvasChainTitle(value: string) {
  return value.toLowerCase().replace(/\b(part|chapter|unit|lesson|week|day)\s*\d+\b/g, " ").replace(/\b\d+\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function canvasEventCategory(title: string) {
  if (/\b(quiz|test|exam|assessment)\b/i.test(title)) return "Quiz/Test";
  if (/\b(meeting|conference|office hours|zoom)\b/i.test(title)) return "Meeting";
  if (/\b(due|deadline|submit)\b/i.test(title)) return "Deadline";
  if (/\b(class|lecture|lab|seminar)\b/i.test(title)) return "Class Event";
  return "Other";
}

export function isMeaningfulProjectCandidate(name: string, total: number, unfinished: number) {
  return total >= 3 && unfinished >= 2 && !genericGroups.has(name.trim().toLowerCase());
}

export function icalOccurrenceId(uid: string, start: Date) { return `${uid}:${start.toISOString()}`; }
