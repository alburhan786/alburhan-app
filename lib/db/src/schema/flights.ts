import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const groupFlightsTable = pgTable("group_flights", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull(),
  flightType: text("flight_type").notNull().default("outbound"),
  airline: text("airline"),
  flightNumber: text("flight_number"),
  pnr: text("pnr"),
  departureAirport: text("departure_airport"),
  arrivalAirport: text("arrival_airport"),
  departureDate: text("departure_date"),
  departureTime: text("departure_time"),
  arrivalDate: text("arrival_date"),
  arrivalTime: text("arrival_time"),
  baggageAllowance: text("baggage_allowance"),
  mealType: text("meal_type"),
  status: text("status").default("scheduled"),
  notes: text("notes"),
  pilgrimsAssigned: jsonb("pilgrims_assigned").$type<string[]>().default([]),
  ticketNumbers: jsonb("ticket_numbers").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GroupFlight = typeof groupFlightsTable.$inferSelect;
