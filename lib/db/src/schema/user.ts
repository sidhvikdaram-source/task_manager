import { pgTable, serial, integer, timestamp, real, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userStatsTable = pgTable("user_stats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  totalVp: integer("total_vp").notNull().default(0),
  lifetimeVp: integer("lifetime_vp").notNull().default(0),
  bpBalance: integer("bp_balance").notNull().default(0),
  lifetimeBp: integer("lifetime_bp").notNull().default(0),
  chestKeys: integer("chest_keys").notNull().default(0),
  tier: integer("tier").notNull().default(1),
  tierProgress: integer("tier_progress").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  multiplier: real("multiplier").notNull().default(1.0),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  focusMinutes: integer("focus_minutes").notNull().default(0),
  lastActivityDate: timestamp("last_activity_date", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserStatsSchema = createInsertSchema(userStatsTable).omit({ id: true, updatedAt: true });
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;
export type UserStats = typeof userStatsTable.$inferSelect;
