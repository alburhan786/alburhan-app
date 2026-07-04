import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const expensesTable = pgTable("expenses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id"),
  category: text("category").notNull(),
  vendor: text("vendor"),
  vendorId: text("vendor_id"),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(),
  paidBy: text("paid_by"),
  paymentMethod: text("payment_method").default("cash"),
  invoiceNumber: text("invoice_number"),
  attachmentUrl: text("attachment_url"),
  notes: text("notes"),
  gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }),
  cgstAmount: numeric("cgst_amount", { precision: 12, scale: 2 }),
  sgstAmount: numeric("sgst_amount", { precision: 12, scale: 2 }),
  igstAmount: numeric("igst_amount", { precision: 12, scale: 2 }),
  hsnSac: text("hsn_sac"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Expense = typeof expensesTable.$inferSelect;
