import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDays,
  calendarWeekday,
  localDateKey,
  startOfWeekKey,
} from "../src/lib/localDate.ts";

test("Central evening remains on the user's calendar date", () => {
  const now = new Date("2026-07-22T02:30:00.000Z");
  assert.equal(localDateKey(now, "America/Chicago"), "2026-07-21");
  assert.equal(addCalendarDays(localDateKey(now, "America/Chicago"), 1), "2026-07-22");
});

test("calendar arithmetic stays stable through DST boundaries", () => {
  const beforeSpringForward = new Date("2026-03-08T07:30:00.000Z");
  const key = localDateKey(beforeSpringForward, "America/Chicago");
  assert.equal(key, "2026-03-08");
  assert.equal(addCalendarDays(key, 1), "2026-03-09");
  assert.equal(startOfWeekKey("2026-03-08"), "2026-03-02");
});

test("weekday calculations use date-only UTC arithmetic", () => {
  assert.equal(calendarWeekday("2026-07-21"), 2);
});
