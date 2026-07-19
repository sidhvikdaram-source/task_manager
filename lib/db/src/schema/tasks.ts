import { pgTable, text, serial, timestamp, integer, jsonb, varchar, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { externalIntegrationsTable } from "./integrations";

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
  subject: text("subject"),
  taskKind: text("task_kind").notNull().default("assignment"),
  difficulty: integer("difficulty").notNull().default(2),
  blocked: boolean("blocked").notNull().default(false),
  organized: boolean("organized").notNull().default(true),
  externalIntegrationId: integer("external_integration_id").references(() => externalIntegrationsTable.id, { onDelete: "set null" }),
  externalSource: text("external_source"),
  externalId: text("external_id"),
  externalCourseId: text("external_course_id"),
  externalUrl: text("external_url"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  externalState: text("external_state"),
  externalPayloadHash: text("external_payload_hash"),
  externalLastSeenAt: timestamp("external_last_seen_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  completionAwardedAt: timestamp("completion_awarded_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("tasks_external_source_unique").on(table.userId, table.externalSource, table.externalId)]);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, completedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
