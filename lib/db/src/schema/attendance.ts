import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const attendanceEventsTable = pgTable("attendance_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("other"),
  scanToken: text("scan_token").$defaultFn(() => crypto.randomUUID()),
  scanTokenExpiresAt: timestamp("scan_token_expires_at").$defaultFn(() => new Date(Date.now() + 24 * 60 * 60 * 1000)),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AttendanceEvent = typeof attendanceEventsTable.$inferSelect;

export const attendanceLogsTable = pgTable("attendance_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull(),
  pilgrimId: text("pilgrim_id").notNull(),
  groupId: text("group_id").notNull(),
  status: text("status").notNull().default("present"),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  scannedBy: text("scanned_by"),
});

export type AttendanceLog = typeof attendanceLogsTable.$inferSelect;
