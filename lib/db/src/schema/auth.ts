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
  equippedProfileTheme: varchar("equipped_profile_theme")
    .notNull()
    .default("none"),
  equippedFocusSound: varchar("equipped_focus_sound")
    .notNull()
    .default("none"),
  equippedBadgeDisplay: varchar("equipped_badge_display")
    .notNull()
    .default("none"),
  equippedMomentumCosmetic: varchar("equipped_momentum_cosmetic")
    .notNull()
    .default("none"),
  isAdmin: boolean("is_admin").notNull().default(false),
  adminModeEnabled: boolean("admin_mode_enabled").notNull().default(false),
  adminLoadout: jsonb("admin_loadout")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  adminChestCount: integer("admin_chest_count").notNull().default(0),
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
    bpReward: integer("bp_reward").notNull().default(0),
    chestKeysReward: integer("chest_keys_reward").notNull().default(0),
    requiresKey: boolean("requires_key").notNull().default(false),
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

export const bpTransactionsTable = pgTable(
  "bp_transactions",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    type: varchar("type").notNull(),
    sourceKey: varchar("source_key").notNull(),
    description: varchar("description").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bp_transactions_source_unique").on(table.userId, table.sourceKey),
    index("bp_transactions_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const dailyForecastsTable = pgTable(
  "daily_forecasts",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    forecastDate: varchar("forecast_date").notNull(),
    weather: varchar("weather").notNull(),
    targetTaskId: integer("target_task_id"),
    freeItemId: varchar("free_item_id"),
    taskCompletions: integer("task_completions").notNull().default(0),
    rewardNp: integer("reward_np").notNull().default(0),
    rewardBp: integer("reward_bp").notNull().default(0),
    boostPercent: integer("boost_percent").notNull().default(0),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
    peekedAt: timestamp("peeked_at", { withTimezone: true }),
    rerolledAt: timestamp("rerolled_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("daily_forecasts_user_date_unique").on(table.userId, table.forecastDate),
    index("daily_forecasts_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
