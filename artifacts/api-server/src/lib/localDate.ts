export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

export function validTimeZone(timeZone?: string | null) {
  if (!timeZone) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function datePartsInTimeZone(
  date: Date,
  timeZone?: string | null,
): CalendarDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

export function formatCalendarDate(parts: CalendarDateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function localDateKey(date = new Date(), timeZone?: string | null) {
  return formatCalendarDate(datePartsInTimeZone(date, timeZone));
}

export function calendarDateToUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addCalendarDays(dateKey: string, amount: number) {
  const date = calendarDateToUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatCalendarDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function areConsecutiveCalendarDates(previous: string, current: string) {
  return addCalendarDays(previous, 1) === current;
}

export function calendarWeekday(dateKey: string) {
  return calendarDateToUtc(dateKey).getUTCDay();
}

export function startOfWeekKey(dateKey: string) {
  const weekday = calendarWeekday(dateKey);
  return addCalendarDays(dateKey, -(weekday === 0 ? 6 : weekday - 1));
}

export function localHour(date: Date, timeZone?: string | null) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone),
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}
