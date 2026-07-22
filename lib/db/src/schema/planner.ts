import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const subjectsTable = pgTable("subjects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2563eb"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("subjects_user_name_unique").on(table.userId, table.name)]);

export const weeklyReviewsTable = pgTable("weekly_reviews", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  weekStart: text("week_start").notNull(),
  topPriorities: jsonb("top_priorities").$type<string[]>().notNull().default([]),
  focusGoalMinutes: integer("focus_goal_minutes").notNull().default(0),
  vpAwarded: integer("vp_awarded").notNull().default(0),
  bpAwarded: integer("bp_awarded").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("weekly_reviews_user_week_unique").on(table.userId, table.weekStart)]);
