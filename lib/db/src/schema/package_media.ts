import { pgTable, text, timestamp, integer, pgEnum, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);

export const packageMediaTable = pgTable("package_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("package_id").notNull(),
  type: mediaTypeEnum("type").notNull().default("image"),
  url: text("url").notNull(),
  caption: text("caption"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
