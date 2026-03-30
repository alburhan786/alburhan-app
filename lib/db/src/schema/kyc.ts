import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const kycStatusEnum = pgEnum("kyc_status", ["pending", "approved", "rejected"]);
export const bloodGroupEnum = pgEnum("blood_group", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]);
export const genderEnum = pgEnum("gender_type", ["male", "female", "other"]);

export const customerProfilesTable = pgTable("customer_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id).unique(),

  name: text("name"),
  phone: text("phone"),
  whatsappNumber: text("whatsapp_number"),
  dateOfBirth: text("date_of_birth"),
  gender: genderEnum("gender"),
  address: text("address"),

  passportNumber: text("passport_number"),
  passportIssueDate: text("passport_issue_date"),
  passportExpiryDate: text("passport_expiry_date"),
  passportPlaceOfIssue: text("passport_place_of_issue"),
  passportImageUrl: text("passport_image_url"),

  photoUrl: text("photo_url"),
  bloodGroup: bloodGroupEnum("blood_group"),

  aadharNumber: text("aadhar_number"),
  aadharImageUrl: text("aadhar_image_url"),
  panNumber: text("pan_number"),
  panImageUrl: text("pan_image_url"),
  healthCertificateUrl: text("health_certificate_url"),

  kycStatus: kycStatusEnum("kyc_status").notNull().default("pending"),
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CustomerProfile = typeof customerProfilesTable.$inferSelect;
export type InsertCustomerProfile = typeof customerProfilesTable.$inferInsert;
