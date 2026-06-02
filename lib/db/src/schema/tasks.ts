import { pgTable, text, serial, timestamp, integer, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  vpValue: integer("vp_value").notNull().default(10),
  dueDate: text("due_date"),
  startDate: text("start_date"),
  calendarDate: text("calendar_date"),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  estimatedMinutes: integer("estimated_minutes"),
  actualMinutes: integer("actual_minutes"),
  links: jsonb("links").$type<Array<{ url: string; label?: string }>>(),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, completedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
