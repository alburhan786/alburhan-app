import { pgTable, text, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";

export const feedbackStatusEnum = pgEnum("feedback_status", ["open", "in_progress", "resolved"]);

export const feedbackTable = pgTable("feedback", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  pilgrimMobile: text("pilgrim_mobile").notNull(),
  pilgrimName: text("pilgrim_name"),
  bookingId: text("booking_id"),
  companyId: text("company_id"),
  groupId: text("group_id"),
  groupName: text("group_name"),

  ratingOverall: integer("rating_overall"),
  ratingAccommodationMakkah1: integer("rating_accommodation_makkah1"),
  ratingAccommodationMakkah2: integer("rating_accommodation_makkah2"),
  ratingAccommodationMadinah: integer("rating_accommodation_madinah"),
  ratingTransportation: integer("rating_transportation"),
  ratingFood: integer("rating_food"),
  ratingGuide: integer("rating_guide"),
  ratingVisaDocumentation: integer("rating_visa_documentation"),

  comment: text("comment"),
  whatDidYouLike: text("what_did_you_like"),
  suggestions: text("suggestions"),
  wouldRecommend: text("would_recommend"),

  isComplaint: boolean("is_complaint").notNull().default(false),
  status: feedbackStatusEnum("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  internalNotes: text("internal_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Feedback = typeof feedbackTable.$inferSelect;
export type InsertFeedback = typeof feedbackTable.$inferInsert;
