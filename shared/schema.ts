import { pgTable, text, varchar, serial, integer, boolean, timestamp, decimal, json, uniqueIndex } from "drizzle-orm/pg-core";
  import { createInsertSchema, createSelectSchema } from "drizzle-zod";

  export interface PackageImage {
    url: string;
    isMain: boolean;
    position: 'left' | 'center' | 'right';
  }

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
    imageUrls: json("image_urls").$type<PackageImage[]>(),
    inclusions: json("inclusions").$type<string[]>().notNull(),
    exclusions: json("exclusions").$type<string[]>(),
    hotelDetails: json("hotel_details").$type<{
      makkah: { name: string; rating: number; distance: string; imageUrls?: string[]; videoUrl?: string };
      madinah: { name: string; rating: number; distance: string; imageUrls?: string[]; videoUrl?: string };
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
      dateOfBirth: string;
      passportNumber: string;
      passportIssue: string;
      passportExpiry: string;
    }>>().notNull(),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email").notNull(),
    address: text("address").notNull(),
    city: text("city"),
    district: text("district"),
    state: text("state"),
    pincode: text("pincode"),
    specialRequests: text("special_requests"),
    invoiceNumber: text("invoice_number"),
    roomType: text("room_type"),
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
    title: text("title"),
    type: text("type").notNull(),
    channel: text("channel").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    metadata: json("metadata"),
    retryCount: integer("retry_count").default(0),
    errorMessage: text("error_message"),
  });

  export const documents = pgTable("documents", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    bookingId: integer("booking_id").references(() => bookings.id),
    type: text("type").notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    status: text("status").notNull().default("pending"),
    adminComment: text("admin_comment"),
  });

  export const customerProfiles = pgTable("customer_profiles", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull().unique(),
    aadharNumber: text("aadhar_number"),
    panNumber: text("pan_number"),
    bloodGroup: text("blood_group"),
    photo: text("photo"),
    whatsappNumber: text("whatsapp_number"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const deviceTokens = pgTable("device_tokens", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    expoPushToken: text("expo_push_token"),
    isInvalid: boolean("is_invalid").default(false).notNull(),
    invalidReason: text("invalid_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }, (table) => ({
    userPlatformIdx: uniqueIndex("device_tokens_user_platform_idx").on(table.userId, table.platform),
  }));

  export const pushDeliveryLogs = pgTable("push_delivery_logs", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    title: text("title"),
    tokenPrefix: text("token_prefix"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  });

  export const groups = pgTable("groups", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  });

  export const groupMembers = pgTable("group_members", {
    id: serial("id").primaryKey(),
    groupId: integer("group_id").references(() => groups.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
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
  export type DeviceToken = typeof deviceTokens.$inferSelect;
  export type PushDeliveryLog = typeof pushDeliveryLogs.$inferSelect;
  export type Group = typeof groups.$inferSelect;
  export type GroupMember = typeof groupMembers.$inferSelect;
  export type CustomerProfile = typeof customerProfiles.$inferSelect;

  export * from "./models/chat";
  