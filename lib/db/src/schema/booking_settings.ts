import { pgTable, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";

export const bookingSettingsTable = pgTable("booking_settings", {
  id: text("id").primaryKey().default("default"),
  gstEnabled: boolean("gst_enabled").notNull().default(true),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("5"),
  gstIncluded: boolean("gst_included").notNull().default(false),
  tcsEnabled: boolean("tcs_enabled").notNull().default(false),
  tcsRate: numeric("tcs_rate", { precision: 5, scale: 2 }).notNull().default("2"),
  tcsIncluded: boolean("tcs_included").notNull().default(false),
  discountEnabled: boolean("discount_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BookingSettings = typeof bookingSettingsTable.$inferSelect;
