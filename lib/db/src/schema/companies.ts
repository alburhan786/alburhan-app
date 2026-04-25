import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const companiesTable = pgTable("companies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  arabicName: text("arabic_name"),
  address: text("address"),
  phone: text("phone"),
  mobile: text("mobile"),
  email: text("email"),
  website: text("website"),
  logoUrl: text("logo_url"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Company = typeof companiesTable.$inferSelect;
