import { pgTable, text, serial, timestamp, varchar, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6b7280"),
  type: text("type").notNull().default("project"),
  emoji: text("emoji"),
  description: text("description"),
  subject: text("subject"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("active"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  rubric: text("rubric"),
  submissionLink: text("submission_link"),
  links: jsonb("links").$type<Array<{ url: string; label?: string }>>().notNull().default([]),
  gradeWeight: integer("grade_weight"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectRequirementsTable = pgTable("project_requirements", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  kind: text("kind").notNull().default("requirement"),
  dueDate: text("due_date"),
  taskId: integer("task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
