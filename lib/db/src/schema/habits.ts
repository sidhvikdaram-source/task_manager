import { pgTable, text, serial, timestamp, integer, date, varchar, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyHabitsTable = pgTable("daily_habits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  title: text("title").notNull(),
  daysOfWeek: text("days_of_week").notNull().default("0,1,2,3,4,5,6"),
  reminderTime: varchar("reminder_time"),
  icon: varchar("icon").notNull().default("target"),
  vpReward: integer("vp_reward").notNull().default(5),
  status: varchar("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyHabitCompletionsTable = pgTable("daily_habit_completions", {
  id: serial("id").primaryKey(),
  habitId: integer("habit_id").notNull().references(() => dailyHabitsTable.id, { onDelete: "cascade" }),
  completedDate: date("completed_date").notNull(),
  completed: boolean("completed").notNull().default(true),
  vpAwarded: boolean("vp_awarded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyHabitSchema = createInsertSchema(dailyHabitsTable).omit({ id: true, createdAt: true });
export type InsertDailyHabit = z.infer<typeof insertDailyHabitSchema>;
export type DailyHabit = typeof dailyHabitsTable.$inferSelect;
export type DailyHabitCompletion = typeof dailyHabitCompletionsTable.$inferSelect;
