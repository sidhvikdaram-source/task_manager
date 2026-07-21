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
      ADD COLUMN IF NOT EXISTS "equipped_cosmetic" varchar DEFAULT 'starter-bolt' NOT NULL,
      ADD COLUMN IF NOT EXISTS "equipped_frame" varchar DEFAULT 'none' NOT NULL,
      ADD COLUMN IF NOT EXISTS "equipped_pet" varchar DEFAULT 'none' NOT NULL,
      ADD COLUMN IF NOT EXISTS "main_goal" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS "advanced_features_enabled" boolean DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS "tutorial_completed" boolean DEFAULT false NOT NULL;
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username") WHERE "username" IS NOT NULL;`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_cosmetics" (
      "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "item_id" varchar NOT NULL,
      "purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("user_id", "item_id")
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "friendships" (
      "id" serial PRIMARY KEY NOT NULL,
      "requester_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "recipient_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "status" varchar DEFAULT 'pending' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("requester_id", "recipient_id")
    );
    CREATE TABLE IF NOT EXISTS "direct_messages" (
      "id" serial PRIMARY KEY NOT NULL,
      "sender_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "recipient_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "body" text NOT NULL,
      "read_at" timestamp with time zone,
      "deleted_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "user_blocks" (
      "blocker_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "blocked_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("blocker_id", "blocked_id")
    );
    CREATE TABLE IF NOT EXISTS "user_reports" (
      "id" serial PRIMARY KEY NOT NULL,
      "reporter_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "reported_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "reason" varchar NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
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
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "subject" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "task_kind" text DEFAULT 'assignment' NOT NULL;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "difficulty" integer DEFAULT 2 NOT NULL;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "blocked" boolean DEFAULT false NOT NULL;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "organized" boolean DEFAULT true NOT NULL;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_integration_id" integer;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_source" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_id" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_course_id" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_url" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_at" timestamp with time zone;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_state" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_payload_hash" text;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_last_seen_at" timestamp with time zone;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completion_awarded_at" timestamp with time zone;

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

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "tasks_external_source_unique"
      ON "tasks" ("user_id", "external_source", "external_id")
      WHERE "external_source" IS NOT NULL AND "external_id" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "external_integrations" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar NOT NULL,
      "provider" text DEFAULT 'canvas' NOT NULL,
      "mode" text NOT NULL,
      "base_url" text,
      "access_token_encrypted" text,
      "refresh_token_encrypted" text,
      "feed_url_encrypted" text,
      "token_expires_at" timestamp with time zone,
      "external_user_id" text,
      "status" text DEFAULT 'connected' NOT NULL,
      "last_synced_at" timestamp with time zone,
      "last_error" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("user_id", "provider")
    );
    CREATE TABLE IF NOT EXISTS "external_courses" (
      "id" serial PRIMARY KEY NOT NULL,
      "integration_id" integer NOT NULL REFERENCES "external_integrations"("id") ON DELETE CASCADE,
      "external_course_id" text NOT NULL,
      "name" text NOT NULL,
      "course_code" text,
      "subject_id" integer,
      "enabled" boolean DEFAULT true NOT NULL,
      "workflow_state" text,
      "last_seen_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("integration_id", "external_course_id")
    );
    CREATE TABLE IF NOT EXISTS "external_calendar_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar NOT NULL,
      "integration_id" integer NOT NULL REFERENCES "external_integrations"("id") ON DELETE CASCADE,
      "external_event_id" text NOT NULL,
      "external_course_id" text,
      "title" text NOT NULL,
      "description" text,
      "category" text DEFAULT 'Other' NOT NULL,
      "starts_at" timestamp with time zone,
      "ends_at" timestamp with time zone,
      "all_day" boolean DEFAULT false NOT NULL,
      "location" text,
      "external_url" text,
      "source_hash" text,
      "last_seen_at" timestamp with time zone,
      "archived" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("integration_id", "external_event_id")
    );
    CREATE TABLE IF NOT EXISTS "integration_sync_runs" (
      "id" serial PRIMARY KEY NOT NULL,
      "integration_id" integer NOT NULL REFERENCES "external_integrations"("id") ON DELETE CASCADE,
      "status" text DEFAULT 'queued' NOT NULL,
      "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "error" text,
      "started_at" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "external_sync_ignores" (
      "id" serial PRIMARY KEY NOT NULL,
      "integration_id" integer NOT NULL REFERENCES "external_integrations"("id") ON DELETE CASCADE,
      "external_type" text NOT NULL,
      "external_id" text NOT NULL,
      "title" text,
      "reason" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("integration_id", "external_type", "external_id")
    );
    CREATE TABLE IF NOT EXISTS "project_suggestions" (
      "id" serial PRIMARY KEY NOT NULL,
      "integration_id" integer NOT NULL REFERENCES "external_integrations"("id") ON DELETE CASCADE,
      "external_course_id" text NOT NULL,
      "fingerprint" text NOT NULL,
      "name" text NOT NULL,
      "external_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "project_id" integer,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("integration_id", "fingerprint")
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
    CREATE TABLE IF NOT EXISTS "checklist_items" (
      "id" serial PRIMARY KEY NOT NULL,
      "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "completed" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    ALTER TABLE "projects"
      ADD COLUMN IF NOT EXISTS "description" text,
      ADD COLUMN IF NOT EXISTS "subject" text,
      ADD COLUMN IF NOT EXISTS "due_date" text,
      ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL,
      ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'medium' NOT NULL,
      ADD COLUMN IF NOT EXISTS "notes" text,
      ADD COLUMN IF NOT EXISTS "rubric" text,
      ADD COLUMN IF NOT EXISTS "submission_link" text,
      ADD COLUMN IF NOT EXISTS "grade_weight" integer,
      ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;
    CREATE TABLE IF NOT EXISTS "project_requirements" (
      "id" serial PRIMARY KEY NOT NULL,
      "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "completed" boolean DEFAULT false NOT NULL,
      "kind" text DEFAULT 'requirement' NOT NULL,
      "due_date" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "project_requirements" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'requirement' NOT NULL;
    ALTER TABLE "project_requirements" ADD COLUMN IF NOT EXISTS "due_date" text;
    ALTER TABLE "project_requirements" ADD COLUMN IF NOT EXISTS "task_id" integer;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "subjects" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar NOT NULL,
      "name" text NOT NULL,
      "color" text DEFAULT '#2563eb' NOT NULL,
      "archived" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("user_id", "name")
    );
    CREATE TABLE IF NOT EXISTS "weekly_reviews" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar NOT NULL,
      "week_start" text NOT NULL,
      "top_priorities" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "focus_goal_minutes" integer DEFAULT 0 NOT NULL,
      "vp_awarded" integer DEFAULT 0 NOT NULL,
      "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE ("user_id", "week_start")
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
  await db.execute(sql`
    ALTER TABLE "daily_habits"
      ADD COLUMN IF NOT EXISTS "days_of_week" text DEFAULT '0,1,2,3,4,5,6' NOT NULL,
      ADD COLUMN IF NOT EXISTS "reminder_time" varchar,
      ADD COLUMN IF NOT EXISTS "icon" varchar DEFAULT 'target' NOT NULL,
      ADD COLUMN IF NOT EXISTS "vp_reward" integer DEFAULT 5 NOT NULL,
      ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'active' NOT NULL;
    ALTER TABLE "daily_habit_completions"
      ADD COLUMN IF NOT EXISTS "completed" boolean DEFAULT true NOT NULL,
      ADD COLUMN IF NOT EXISTS "vp_awarded" boolean DEFAULT false NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "habit_completion_day_unique" ON "daily_habit_completions" ("habit_id", "completed_date");
  `);

  console.log("[migrate] Schema migration complete!");
}
