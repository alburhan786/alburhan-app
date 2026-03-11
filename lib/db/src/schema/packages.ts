import { pgTable, text, timestamp, numeric, integer, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packageTypeEnum = pgEnum("package_type", ["umrah", "ramadan_umrah", "hajj", "special_hajj", "iraq_ziyarat", "baitul_muqaddas", "syria_ziyarat", "jordan_heritage"]);

export const packagesTable = pgTable("packages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: packageTypeEnum("type").notNull(),
  description: text("description"),
  duration: text("duration"),
  pricePerPerson: numeric("price_per_person", { precision: 12, scale: 2 }).notNull(),
  gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("5"),
  includes: jsonb("includes").$type<string[]>().default([]),
  highlights: jsonb("highlights").$type<string[]>().default([]),
  departureDates: jsonb("departure_dates").$type<string[]>().default([]),
  maxPilgrims: integer("max_pilgrims"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
