import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const galleryImagesTable = pgTable("gallery_images", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GalleryImage = typeof galleryImagesTable.$inferSelect;
