import { pgTable, text, serial, integer, boolean, timestamp, decimal, json } from "drizzle-orm/pg-core";
  import { createInsertSchema, createSelectSchema } from "drizzle-zod";

  export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").unique().notNull(),
    phone: text("phone").unique().notNull(),
    password: text("password").notNull(),
    profileImage: text("profile_image"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  });

  export const packages = pgTable("packages", {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    description: text("description").notNull(),
    duration: text("duration").notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    roomPrices: json("room_prices").$type<Record<string, number>>(),
    imageUrl: text("image_url"),
    inclusions: json("inclusions").$type<string[]>().notNull(),
    exclusions: json("exclusions").$type<string[]>(),
    hotelDetails: json("hotel_details").$type<{
      makkah: { name: string; rating: number; distance: string };
      madinah: { name: string; rating: number; distance: string };
    }>(),
    flight: text("flight"),
    transport: text("transport"),
    food: text("food"),
    muallim: text("muallim"),
    tent: text("tent"),
    roomSharing: text("room_sharing"),
    availableSeats: integer("available_seats").notNull(),
    departureDate: timestamp("departure_date").notNull(),
    returnDate: timestamp("return_date").notNull(),
    featured: boolean("featured").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  });

  export const bookings = pgTable("bookings", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    packageId: integer("package_id").references(() => packages.id).notNull(),
    numberOfPeople: integer("number_of_people").notNull(),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
    status: text("status").notNull(),
    paymentStatus: text("payment_status").notNull(),
    paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).default("0"),
    travelers: json("travelers").$type<Array<{
      name: string;
      age: number;
      gender: string;
      passportNumber: string;
      passportExpiry: string;
    }>>().notNull(),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email").notNull(),
    address: text("address").notNull(),
    specialRequests: text("special_requests"),
    bookingDate: timestamp("booking_date").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const payments = pgTable("payments", {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").references(() => bookings.id).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull(),
    transactionId: text("transaction_id"),
    status: text("status").notNull(),
    paymentDate: timestamp("payment_date").defaultNow().notNull(),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpaySignature: text("razorpay_signature"),
  });

  export const notifications = pgTable("notifications", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    bookingId: integer("booking_id").references(() => bookings.id),
    type: text("type").notNull(),
    channel: text("channel").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    metadata: json("metadata"),
  });

  export const documents = pgTable("documents", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    bookingId: integer("booking_id").references(() => bookings.id),
    type: text("type").notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  });

  export const insertUserSchema = createInsertSchema(users);
  export const selectUserSchema = createSelectSchema(users);
  export const insertPackageSchema = createInsertSchema(packages);
  export const selectPackageSchema = createSelectSchema(packages);
  export const insertBookingSchema = createInsertSchema(bookings);
  export const selectBookingSchema = createSelectSchema(bookings);

  export type User = typeof users.$inferSelect;
  export type InsertUser = typeof users.$inferInsert;
  export type Package = typeof packages.$inferSelect;
  export type Booking = typeof bookings.$inferSelect;
  export type Payment = typeof payments.$inferSelect;
  export type Notification = typeof notifications.$inferSelect;
  export type Document = typeof documents.$inferSelect;
  