import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { packagesTable } from "./packages";
import { bookingsTable } from "./bookings";

export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected"]);

export const packageRequestsTable = pgTable("package_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").references(() => usersTable.id, { onDelete: "set null" }),
  packageId: text("package_id").references(() => packagesTable.id, { onDelete: "set null" }),
  bookingId: text("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerMobile: text("customer_mobile").notNull(),
  packageName: text("package_name"),
  message: text("message"),
  status: requestStatusEnum("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PackageRequest = typeof packageRequestsTable.$inferSelect;
export type InsertPackageRequest = typeof packageRequestsTable.$inferInsert;
