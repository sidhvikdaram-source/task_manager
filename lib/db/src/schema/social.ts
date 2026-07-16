import { pgTable, serial, timestamp, varchar, text, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const friendshipsTable = pgTable("friendships", {
  id: serial("id").primaryKey(),
  requesterId: varchar("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipientId: varchar("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: varchar("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("friendships_pair_unique").on(table.requesterId, table.recipientId)]);

export const directMessagesTable = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  senderId: varchar("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipientId: varchar("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userBlocksTable = pgTable("user_blocks", {
  blockerId: varchar("blocker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("user_blocks_pair_unique").on(table.blockerId, table.blockedId)]);

export const userReportsTable = pgTable("user_reports", {
  id: serial("id").primaryKey(),
  reporterId: varchar("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reportedId: varchar("reported_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reason: varchar("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
