import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";

export const reminderChannelEnum = pgEnum("reminder_channel", ["whatsapp", "sms"]);
export const reminderStatusEnum = pgEnum("reminder_status", ["sent", "failed", "skipped"]);

export const reminderLogsTable = pgTable("reminder_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").notNull().references(() => bookingsTable.id),
  channel: reminderChannelEnum("channel").notNull().default("whatsapp"),
  status: reminderStatusEnum("status").notNull().default("sent"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  triggeredBy: text("triggered_by").notNull().default("cron"),
  notes: text("notes"),
});

export type ReminderLog = typeof reminderLogsTable.$inferSelect;
