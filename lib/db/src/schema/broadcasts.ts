import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const broadcastsTable = pgTable("broadcasts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("general"),
  audience: text("audience").notNull(),
  channels: text("channels").array().notNull().default([]),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  sentBy: text("sent_by"),
});

export const customerNotificationsTable = pgTable("customer_notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull(),
  broadcastId: text("broadcast_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("general"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Broadcast = typeof broadcastsTable.$inferSelect;
export type CustomerNotification = typeof customerNotificationsTable.$inferSelect;
