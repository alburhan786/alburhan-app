import { pgTable, text, timestamp, numeric, integer, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bookingStatusEnum = pgEnum("booking_status", ["pending", "approved", "rejected", "confirmed", "cancelled"]);

export const bookingsTable = pgTable("bookings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingNumber: text("booking_number").notNull().unique(),
  packageId: text("package_id"),
  packageName: text("package_name"),
  customerId: text("customer_id"),
  customerName: text("customer_name").notNull(),
  customerMobile: text("customer_mobile").notNull(),
  customerEmail: text("customer_email"),
  numberOfPilgrims: integer("number_of_pilgrims").notNull(),
  pilgrims: jsonb("pilgrims").$type<Array<{ name: string; passportNumber?: string; passportExpiry?: string; dateOfBirth?: string }>>().default([]),
  preferredDepartureDate: text("preferred_departure_date"),
  status: bookingStatusEnum("status").notNull().default("pending"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  gstAmount: numeric("gst_amount", { precision: 12, scale: 2 }),
  finalAmount: numeric("final_amount", { precision: 12, scale: 2 }),
  paymentId: text("payment_id"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  invoiceNumber: text("invoice_number"),
  rejectionReason: text("rejection_reason"),
  roomType: text("room_type"),
  advanceAmount: numeric("advance_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  isOffline: boolean("is_offline").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
