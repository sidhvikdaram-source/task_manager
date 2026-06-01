import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyHabitsTable = pgTable("daily_habits", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyHabitCompletionsTable = pgTable("daily_habit_completions", {
  id: serial("id").primaryKey(),
  habitId: integer("habit_id").notNull().references(() => dailyHabitsTable.id, { onDelete: "cascade" }),
  completedDate: date("completed_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyHabitSchema = createInsertSchema(dailyHabitsTable).omit({ id: true, createdAt: true });
export type InsertDailyHabit = z.infer<typeof insertDailyHabitSchema>;
export type DailyHabit = typeof dailyHabitsTable.$inferSelect;
export type DailyHabitCompletion = typeof dailyHabitCompletionsTable.$inferSelect;
