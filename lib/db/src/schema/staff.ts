import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const staffTable = pgTable("staff", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  staffId: text("staff_id").unique(),
  companyId: text("company_id").notNull().default("alburhan"),
  groupId: text("group_id"),
  fullName: text("full_name").notNull(),
  fatherName: text("father_name"),
  designation: text("designation"),
  department: text("department"),
  role: text("role").notNull().default("airport_staff"),
  employeeCode: text("employee_code"),
  mobileIndia: text("mobile_india"),
  bloodGroup: text("blood_group"),
  dateOfBirth: text("date_of_birth"),
  address: text("address"),
  aadhaarLast4: text("aadhaar_last_4"),
  emergencyContact: text("emergency_contact"),
  emergencyMobile: text("emergency_mobile"),
  joiningDate: text("joining_date"),
  validUpto: text("valid_upto"),
  photoUrl: text("photo_url"),
  qrToken: text("qr_token").unique().$defaultFn(() => crypto.randomUUID()),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Staff = typeof staffTable.$inferSelect;
