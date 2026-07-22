import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const usersTable = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  username: varchar("username").unique(),
  avatarStyle: varchar("avatar_style").notNull().default("bolt"),
  equippedCosmetic: varchar("equipped_cosmetic")
    .notNull()
    .default("starter-bolt"),
  equippedFrame: varchar("equipped_frame").notNull().default("none"),
  equippedPet: varchar("equipped_pet").notNull().default("none"),
  equippedTitle: varchar("equipped_title").notNull().default("none"),
  mainGoal: varchar("main_goal"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  advancedFeaturesEnabled: boolean("advanced_features_enabled")
    .notNull()
    .default(false),
  tutorialCompleted: boolean("tutorial_completed").notNull().default(false),
  socialEnabled: boolean("social_enabled").notNull().default(false),
  timezone: varchar("timezone").notNull().default("UTC"),
  calendarView: varchar("calendar_view").notNull().default("month"),
  completionSoundEnabled: boolean("completion_sound_enabled")
    .notNull()
    .default(true),
  equippedCompletionEffect: varchar("equipped_completion_effect")
    .notNull()
    .default("clean-confetti"),
  equippedTransition: varchar("equipped_transition")
    .notNull()
    .default("velocity-slide"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userCosmeticsTable = pgTable(
  "user_cosmetics",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    itemId: varchar("item_id").notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] })],
);

export const userRewardChestsTable = pgTable(
  "user_reward_chests",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceKey: varchar("source_key").notNull(),
    rarity: varchar("rarity").notNull().default("common"),
    status: varchar("status").notNull().default("unopened"),
    rewardItemId: varchar("reward_item_id"),
    vpFallback: integer("vp_fallback").notNull().default(0),
    awardedAt: timestamp("awarded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("user_reward_chests_source_unique").on(
      table.userId,
      table.sourceKey,
    ),
    index("user_reward_chests_user_status_idx").on(table.userId, table.status),
  ],
);

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
