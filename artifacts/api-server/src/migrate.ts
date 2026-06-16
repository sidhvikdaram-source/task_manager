import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function runMigrations(): Promise<void> {
  console.log("[migrate] Running schema migration...");

  // Create users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" varchar PRIMARY KEY NOT NULL,
      "email" varchar UNIQUE,
      "first_name" varchar,
      "last_name" varchar,
      "profile_image_url" varchar,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  // Create sessions table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" varchar PRIMARY KEY NOT NULL,
      "sess" jsonb NOT NULL,
      "expire" timestamp NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
  `);

  // Create user_stats table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_stats" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar,
      "total_vp" integer DEFAULT 0 NOT NULL,
      "tier" integer DEFAULT 1 NOT NULL,
      "tier_progress" integer DEFAULT 0 NOT NULL,
      "streak_days" integer DEFAULT 0 NOT NULL,
      "multiplier" real DEFAULT 1.0 NOT NULL,
      "tasks_completed" integer DEFAULT 0 NOT NULL,
      "focus_minutes" integer DEFAULT 0 NOT NULL,
      "last_activity_date" timestamp with time zone,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  // Create tasks table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "tasks" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar,
      "title" varchar NOT NULL,
      "description" varchar,
      "status" varchar DEFAULT 'todo' NOT NULL,
      "priority" varchar DEFAULT 'medium' NOT NULL,
      "vp_value" integer DEFAULT 10 NOT NULL,
      "due_date" timestamp with time zone,
      "start_date" timestamp with time zone,
      "calendar_date" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "project_id" integer,
      "estimated_minutes" integer,
      "actual_minutes" integer,
      "links" jsonb,
      "notes" varchar
    );
  `);

  // Create projects table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "projects" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar,
      "name" varchar NOT NULL,
      "color" varchar DEFAULT '#3B82F6' NOT NULL,
      "type" varchar DEFAULT 'project' NOT NULL,
      "emoji" varchar,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  // Create checklist table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "checklist" (
      "id" serial PRIMARY KEY NOT NULL,
      "task_id" integer NOT NULL,
      "title" varchar NOT NULL,
      "completed" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  // Create focus_sessions table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "focus_sessions" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar,
      "duration_minutes" integer NOT NULL,
      "status" varchar DEFAULT 'active' NOT NULL,
      "vp_awarded" integer,
      "started_at" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  // Create habits table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "habits" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar,
      "title" varchar NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  // Create milestones table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "milestones" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar,
      "title" varchar NOT NULL,
      "description" varchar,
      "achieved_at" timestamp with time zone DEFAULT now() NOT NULL,
      "vp_threshold" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  console.log("[migrate] Schema migration complete!");
}