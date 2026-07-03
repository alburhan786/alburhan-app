import { pgTable, text, timestamp, numeric, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";

export const paymentModeEnum = pgEnum("payment_mode", ["cash", "neft", "upi", "cheque", "online"]);

export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").notNull().references(() => bookingsTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(),
  paymentMode: paymentModeEnum("payment_mode").notNull(),
  referenceNumber: text("reference_number"),
  bankName: text("bank_name"),
  receivedBy: text("received_by"),
  notes: text("notes"),
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  editedBy: text("edited_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  deletionReason: text("deletion_reason"),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactionsTable).omit({
  id: true, createdAt: true, editedAt: true, deletedAt: true, isDeleted: true
});
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
