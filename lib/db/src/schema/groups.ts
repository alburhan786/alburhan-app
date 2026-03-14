import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const hajjGroupsTable = pgTable("hajj_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupName: text("group_name").notNull(),
  year: integer("year").notNull(),
  departureDate: text("departure_date"),
  returnDate: text("return_date"),
  flightNumber: text("flight_number"),
  maktabNumber: text("maktab_number"),
  hotels: jsonb("hotels").$type<{
    makkah?: { name?: string; address?: string; checkIn?: string; checkOut?: string };
    madinah?: { name?: string; address?: string; checkIn?: string; checkOut?: string };
  }>().default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type HajjGroup = typeof hajjGroupsTable.$inferSelect;

export const pilgrimsTable = pgTable("pilgrims", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull(),
  serialNumber: integer("serial_number").notNull(),
  fullName: text("full_name").notNull(),
  passportNumber: text("passport_number"),
  visaNumber: text("visa_number"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  bloodGroup: text("blood_group"),
  photoUrl: text("photo_url"),
  mobileIndia: text("mobile_india"),
  mobileSaudi: text("mobile_saudi"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  roomNumber: text("room_number"),
  busNumber: text("bus_number"),
  relation: text("relation"),
  coverNumber: text("cover_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Pilgrim = typeof pilgrimsTable.$inferSelect;
