import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function runMigrations(): Promise<void> {
  console.log("[migrate] Running schema migration...");

  // Create users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" varchar PRIMARY KEY NOT NULL,
      "email" varchar UNIQUE,
      "password_hash" varchar,
      "first_name" varchar,
      "last_name" varchar,
      "profile_image_url" varchar,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" varchar;
  `);
  await db.execute(sql`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "username" varchar,
      ADD COLUMN IF NOT EXISTS "avatar_style" varchar DEFAULT 'bolt' NOT NULL,
      ADD COLUMN IF NOT EXISTS "equipped_cosmetic" varchar DEFAULT 'starter-bolt' NOT NULL;
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username") WHERE "username" IS NOT NULL;`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_cosmetics" (
      "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "item_id" varchar NOT NULL,
      "purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("user_id", "item_id")
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
      "due_date" text,
      "start_date" text,
      "calendar_date" text,
      "completed_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "project_id" integer,
      "estimated_minutes" integer,
      "actual_minutes" integer,
      "links" jsonb,
      "notes" varchar
    );
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" varchar;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_date" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "start_date" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "calendar_date" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "project_id" integer;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "estimated_minutes" integer;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "actual_minutes" integer;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "links" jsonb;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "notes" varchar;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'due_date' AND data_type <> 'text'
      ) THEN
        ALTER TABLE "tasks" ALTER COLUMN "due_date" TYPE text USING "due_date"::date::text;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'start_date' AND data_type <> 'text'
      ) THEN
        ALTER TABLE "tasks" ALTER COLUMN "start_date" TYPE text USING "start_date"::date::text;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'calendar_date' AND data_type <> 'text'
      ) THEN
        ALTER TABLE "tasks" ALTER COLUMN "calendar_date" TYPE text USING "calendar_date"::date::text;
      END IF;
    END $$;
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
    CREATE TABLE IF NOT EXISTS "checklist_items" (
      "id" serial PRIMARY KEY NOT NULL,
      "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "completed" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.checklist') IS NOT NULL THEN
        EXECUTE '
          INSERT INTO "checklist_items" ("id", "task_id", "title", "completed", "created_at")
          SELECT "id", "task_id", "title", "completed", "created_at"
          FROM "checklist"
          ON CONFLICT ("id") DO NOTHING
        ';
        PERFORM setval(
          pg_get_serial_sequence('checklist_items', 'id'),
          COALESCE((SELECT MAX("id") FROM "checklist_items"), 1),
          true
        );
      END IF;
    END $$;
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

  // Create daily_habits table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "daily_habits" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar,
      "title" text NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  // Create daily_habit_completions table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "daily_habit_completions" (
      "id" serial PRIMARY KEY NOT NULL,
      "habit_id" integer NOT NULL REFERENCES "daily_habits"("id") ON DELETE CASCADE,
      "completed_date" date NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  console.log("[migrate] Schema migration complete!");
}
