import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";
import { subjectsTable } from "./planner";

export const externalIntegrationsTable = pgTable("external_integrations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  provider: text("provider").notNull().default("canvas"),
  mode: text("mode").notNull(),
  baseUrl: text("base_url"),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  feedUrlEncrypted: text("feed_url_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  externalUserId: text("external_user_id"),
  status: text("status").notNull().default("connected"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("external_integrations_user_provider_unique").on(table.userId, table.provider)]);

export const externalCoursesTable = pgTable("external_courses", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => externalIntegrationsTable.id, { onDelete: "cascade" }),
  externalCourseId: text("external_course_id").notNull(),
  name: text("name").notNull(),
  courseCode: text("course_code"),
  subjectId: integer("subject_id").references(() => subjectsTable.id, { onDelete: "set null" }),
  enabled: boolean("enabled").notNull().default(true),
  workflowState: text("workflow_state"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("external_courses_integration_course_unique").on(table.integrationId, table.externalCourseId)]);

export const externalCalendarEventsTable = pgTable("external_calendar_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  integrationId: integer("integration_id").notNull().references(() => externalIntegrationsTable.id, { onDelete: "cascade" }),
  externalEventId: text("external_event_id").notNull(),
  externalCourseId: text("external_course_id"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("Other"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  allDay: boolean("all_day").notNull().default(false),
  location: text("location"),
  externalUrl: text("external_url"),
  sourceHash: text("source_hash"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("external_events_integration_event_unique").on(table.integrationId, table.externalEventId)]);

export const integrationSyncRunsTable = pgTable("integration_sync_runs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => externalIntegrationsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  summary: jsonb("summary").$type<Record<string, number>>().notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const externalSyncIgnoresTable = pgTable("external_sync_ignores", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => externalIntegrationsTable.id, { onDelete: "cascade" }),
  externalType: text("external_type").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("external_ignores_source_unique").on(table.integrationId, table.externalType, table.externalId)]);

export const projectSuggestionsTable = pgTable("project_suggestions", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => externalIntegrationsTable.id, { onDelete: "cascade" }),
  externalCourseId: text("external_course_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  name: text("name").notNull(),
  externalTaskIds: jsonb("external_task_ids").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("project_suggestions_fingerprint_unique").on(table.integrationId, table.fingerprint)]);
