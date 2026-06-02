import { pgTable, serial, timestamp, integer, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const focusSessionsTable = pgTable("focus_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  durationMinutes: integer("duration_minutes").notNull(),
  status: text("status").notNull().default("active"),
  vpAwarded: integer("vp_awarded"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFocusSessionSchema = createInsertSchema(focusSessionsTable).omit({ id: true, createdAt: true, completedAt: true, vpAwarded: true });
export type InsertFocusSession = z.infer<typeof insertFocusSessionSchema>;
export type FocusSession = typeof focusSessionsTable.$inferSelect;
