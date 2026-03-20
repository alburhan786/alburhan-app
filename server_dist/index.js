var __defProp = Object.defineProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  bookings: () => bookings,
  conversations: () => conversations,
  documents: () => documents,
  insertBookingSchema: () => insertBookingSchema,
  insertConversationSchema: () => insertConversationSchema,
  insertMessageSchema: () => insertMessageSchema,
  insertPackageSchema: () => insertPackageSchema,
  insertUserSchema: () => insertUserSchema,
  messages: () => messages,
  notifications: () => notifications,
  packages: () => packages,
  payments: () => payments,
  selectBookingSchema: () => selectBookingSchema,
  selectPackageSchema: () => selectPackageSchema,
  selectUserSchema: () => selectUserSchema,
  users: () => users
});
import { pgTable as pgTable2, text as text2, serial as serial2, integer as integer2, boolean, timestamp as timestamp2, decimal, json } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema2, createSelectSchema } from "drizzle-zod";

// shared/models/chat.ts
import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
var conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull()
});
var messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull()
});
var insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true
});
var insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true
});

// shared/schema.ts
var users = pgTable2("users", {
  id: serial2("id").primaryKey(),
  name: text2("name").notNull(),
  email: text2("email").unique().notNull(),
  phone: text2("phone").unique().notNull(),
  password: text2("password").notNull(),
  profileImage: text2("profile_image"),
  createdAt: timestamp2("created_at").defaultNow().notNull()
});
var packages = pgTable2("packages", {
  id: serial2("id").primaryKey(),
  type: text2("type").notNull(),
  name: text2("name").notNull(),
  category: text2("category"),
  description: text2("description").notNull(),
  duration: text2("duration").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  roomPrices: json("room_prices").$type(),
  imageUrl: text2("image_url"),
  inclusions: json("inclusions").$type().notNull(),
  exclusions: json("exclusions").$type(),
  hotelDetails: json("hotel_details").$type(),
  flight: text2("flight"),
  transport: text2("transport"),
  food: text2("food"),
  muallim: text2("muallim"),
  tent: text2("tent"),
  roomSharing: text2("room_sharing"),
  availableSeats: integer2("available_seats").notNull(),
  departureDate: timestamp2("departure_date").notNull(),
  returnDate: timestamp2("return_date").notNull(),
  featured: boolean("featured").default(false),
  createdAt: timestamp2("created_at").defaultNow().notNull()
});
var bookings = pgTable2("bookings", {
  id: serial2("id").primaryKey(),
  userId: integer2("user_id").references(() => users.id).notNull(),
  packageId: integer2("package_id").references(() => packages.id).notNull(),
  numberOfPeople: integer2("number_of_people").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: text2("status").notNull(),
  paymentStatus: text2("payment_status").notNull(),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).default("0"),
  travelers: json("travelers").$type().notNull(),
  contactName: text2("contact_name").notNull(),
  contactPhone: text2("contact_phone").notNull(),
  contactEmail: text2("contact_email").notNull(),
  address: text2("address").notNull(),
  city: text2("city"),
  district: text2("district"),
  state: text2("state"),
  pincode: text2("pincode"),
  specialRequests: text2("special_requests"),
  invoiceNumber: text2("invoice_number"),
  roomType: text2("room_type"),
  bookingDate: timestamp2("booking_date").defaultNow().notNull(),
  updatedAt: timestamp2("updated_at").defaultNow().notNull()
});
var payments = pgTable2("payments", {
  id: serial2("id").primaryKey(),
  bookingId: integer2("booking_id").references(() => bookings.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text2("payment_method").notNull(),
  transactionId: text2("transaction_id"),
  status: text2("status").notNull(),
  paymentDate: timestamp2("payment_date").defaultNow().notNull(),
  razorpayOrderId: text2("razorpay_order_id"),
  razorpayPaymentId: text2("razorpay_payment_id"),
  razorpaySignature: text2("razorpay_signature")
});
var notifications = pgTable2("notifications", {
  id: serial2("id").primaryKey(),
  userId: integer2("user_id").references(() => users.id).notNull(),
  bookingId: integer2("booking_id").references(() => bookings.id),
  type: text2("type").notNull(),
  channel: text2("channel").notNull(),
  message: text2("message").notNull(),
  status: text2("status").notNull(),
  sentAt: timestamp2("sent_at").defaultNow().notNull(),
  metadata: json("metadata")
});
var documents = pgTable2("documents", {
  id: serial2("id").primaryKey(),
  userId: integer2("user_id").references(() => users.id).notNull(),
  bookingId: integer2("booking_id").references(() => bookings.id),
  type: text2("type").notNull(),
  fileName: text2("file_name").notNull(),
  fileUrl: text2("file_url").notNull(),
  uploadedAt: timestamp2("uploaded_at").defaultNow().notNull()
});
var insertUserSchema = createInsertSchema2(users);
var selectUserSchema = createSelectSchema(users);
var insertPackageSchema = createInsertSchema2(packages);
var selectPackageSchema = createSelectSchema(packages);
var insertBookingSchema = createInsertSchema2(bookings);
var selectBookingSchema = createSelectSchema(bookings);

// server/db.ts
var { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle(pool, { schema: schema_exports });

// server/routes.ts
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import nodemailer from "nodemailer";
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
var storageClient = null;
function getStorageClient() {
  if (storageClient) return storageClient;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;
  storageClient = new ObjectStorageClient({ bucketId });
  return storageClient;
}
var otpStore = /* @__PURE__ */ new Map();
function generateOtp() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
function numberToWords(num) {
  if (num === 0) return "Zero";
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen"
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1e3) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 1e5) return convert(Math.floor(n / 1e3)) + " Thousand" + (n % 1e3 ? " " + convert(n % 1e3) : "");
    if (n < 1e7) return convert(Math.floor(n / 1e5)) + " Lakh" + (n % 1e5 ? " " + convert(n % 1e5) : "");
    return convert(Math.floor(n / 1e7)) + " Crore" + (n % 1e7 ? " " + convert(n % 1e7) : "");
  }
  return convert(Math.round(num)) + " Rupees Only";
}
function formatINR(n) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function generateInvoiceNumber(bookingId) {
  const now = /* @__PURE__ */ new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  return `ABTTH${yy}${mm}${bookingId.toString().padStart(2, "0")}`;
}
async function sendOtpSmsFast2SMS(phone, otpCode) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS] API key not configured, skipping OTP SMS");
    return false;
  }
  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=ALBURH&message=164844&variables_values=${encodeURIComponent(otpCode + "|")}&flash=0&numbers=${phone}`;
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    console.log("[Fast2SMS OTP DLT] Response:", JSON.stringify(data));
    if (data.return === true) return true;
    console.log("[Fast2SMS OTP DLT] Failed:", data.message);
    return false;
  } catch (error) {
    console.error("[Fast2SMS OTP DLT] Error:", error);
    return false;
  }
}
async function sendBookingDltSms(phone, name, packageName, amount, invoiceUrl) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS DLT] API key not configured, skipping booking SMS");
    return false;
  }
  try {
    const variables = `${name}|${packageName}|${amount}|${invoiceUrl}|`;
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=ALBURH&message=211763&variables_values=${encodeURIComponent(variables)}&flash=0&numbers=${phone}`;
    console.log(`[Fast2SMS DLT Booking] Sending to ${phone} | variables="${variables}"`);
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    console.log("[Fast2SMS DLT Booking] Response:", JSON.stringify(data));
    if (data.return === true) return true;
    console.log("[Fast2SMS DLT Booking] Failed:", data.message);
    return false;
  } catch (error) {
    console.error("[Fast2SMS DLT Booking] Error:", error);
    return false;
  }
}
async function sendSmsFast2SMS(_phone, _message) {
  return false;
}
var WHATSAPP_HEADER_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Kaaba_mirror_edit_jj.jpg/640px-Kaaba_mirror_edit_jj.jpg";
var WHATSAPP_PHONE_NUMBER_ID = "965912196611113";
async function sendWhatsAppTemplate(phone, templateName, languageCode, components) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) {
    console.log("[Meta WhatsApp] Token not configured, skipping template");
    return false;
  }
  const to = phone.startsWith("91") ? phone : `91${phone}`;
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: templateName, language: { code: languageCode }, components }
        })
      }
    );
    const data = await response.json();
    console.log(`[Meta WhatsApp Template] ${templateName} to ${to}:`, JSON.stringify(data));
    return !!data.messages?.[0]?.id;
  } catch (error) {
    console.error("[Meta WhatsApp Template] Error:", error);
    return false;
  }
}
async function sendWhatsAppOtpTemplate(phone, otpCode) {
  return sendWhatsAppTemplate(phone, "alburhan_login_otp", "en_US", [
    { type: "body", parameters: [{ type: "text", text: otpCode }] },
    { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: otpCode }] }
  ]);
}
async function sendWhatsAppBookingTemplate(phone, customerName) {
  return sendWhatsAppTemplate(phone, "booking", "en_GB", [
    { type: "header", parameters: [{ type: "image", image: { link: WHATSAPP_HEADER_IMAGE } }] },
    { type: "body", parameters: [{ type: "text", text: customerName }] }
  ]);
}
async function sendWhatsAppConfirmationTemplate(phone, customerName, packageName, amountPaid, invoiceUrl) {
  return sendWhatsAppTemplate(phone, "conformation", "en_GB", [
    {
      type: "body",
      parameters: [
        { type: "text", text: customerName },
        { type: "text", text: packageName },
        { type: "text", text: amountPaid },
        { type: "text", text: invoiceUrl }
      ]
    }
  ]);
}
async function sendWhatsAppBotBee(phone, message) {
  const apiKey = process.env.BOTBEE_API_KEY || process.env.BOTBEE_API_TOKEN || process.env.BOTBEE_WHATSAPP_API_KEY;
  if (!apiKey) {
    console.log("[BotBee] API key not configured, skipping WhatsApp");
    return { sent: false, blocked: false };
  }
  const phoneNumberId = process.env.BOTBEE_PHONE_NUMBER_ID || WHATSAPP_PHONE_NUMBER_ID;
  const phoneNumber = phone.startsWith("91") ? phone : `91${phone}`;
  try {
    const response = await fetch("https://app.botbee.io/api/v1/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiToken: apiKey,
        phone_number_id: phoneNumberId,
        message,
        phone_number: phoneNumber
      })
    });
    const text3 = await response.text();
    try {
      const data = JSON.parse(text3);
      console.log("[BotBee] Response:", JSON.stringify(data));
      const blocked = data.status === "0" && data.message?.includes("24 hour");
      if (blocked) {
        console.log("[BotBee] 24-hour window restriction \u2014 will use template fallback");
      }
      return { sent: data.status === "1", blocked };
    } catch {
      console.log("[BotBee] Non-JSON response:", text3.substring(0, 200));
      return { sent: false, blocked: false };
    }
  } catch (error) {
    console.error("[BotBee] Error:", error);
    return { sent: false, blocked: false };
  }
}
async function sendEmail(to, subject, htmlBody) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("[Email] EMAIL_USER or EMAIL_PASS not configured, skipping email");
      return false;
    }
    await transporter.sendMail({
      from: `"AL BURHAN TOURS & TRAVELS" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlBody
    });
    console.log(`[Email] Sent to ${to}`);
    return true;
  } catch (error) {
    console.error("[Email] Error:", error);
    return false;
  }
}
async function registerRoutes(app2) {
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, phone, password } = req.body;
      if (!name || !email || !phone || !password) {
        return res.status(400).json({ success: false, error: "All fields are required" });
      }
      const existingEmail = await db.select().from(users).where(eq(users.email, email));
      if (existingEmail.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this email already exists" });
      }
      const existingPhone = await db.select().from(users).where(eq(users.phone, phone));
      if (existingPhone.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this phone number already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db.insert(users).values({
        name,
        email,
        phone,
        password: hashedPassword
      }).returning();
      const { password: _, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }
      const { password: _, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const otp = generateOtp();
      otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1e3 });
      const sent = await sendOtpSmsFast2SMS(phone, otp);
      console.log(`[OTP] Generated OTP ${otp} for phone ${phone}, SMS sent: ${sent}`);
      if (!sent) {
        return res.status(500).json({ success: false, error: "Failed to send SMS. Please try WhatsApp or register directly with email." });
      }
      res.json({ success: true, message: "OTP sent via SMS" });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/auth/send-whatsapp-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const existing = otpStore.get(phone);
      let otp;
      if (existing && existing.expiresAt > Date.now()) {
        otp = existing.otp;
      } else {
        otp = generateOtp();
        otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1e3 });
      }
      const whatsappSent = await sendWhatsAppOtpTemplate(phone, otp);
      const smsSent = await sendOtpSmsFast2SMS(phone, otp);
      console.log(`[OTP] Registration OTP for ${phone} \u2014 WhatsApp template: ${whatsappSent}, SMS: ${smsSent}`);
      if (!whatsappSent && !smsSent) {
        return res.status(500).json({ success: false, error: "Failed to send OTP via WhatsApp and SMS. Please register directly with email instead." });
      }
      const method = whatsappSent ? "WhatsApp" : "SMS";
      res.json({ success: true, message: `OTP sent via ${method}` });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { phone, otp, name, email, password } = req.body;
      if (!phone || !otp) {
        return res.status(400).json({ success: false, error: "Phone and OTP are required" });
      }
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: "Name, email, and password are required" });
      }
      const stored = otpStore.get(phone);
      if (!stored) {
        return res.status(400).json({ success: false, error: "No OTP found for this phone. Please request a new OTP." });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(phone);
        return res.status(400).json({ success: false, error: "OTP has expired. Please request a new OTP." });
      }
      if (stored.otp !== otp) {
        return res.status(400).json({ success: false, error: "Invalid OTP" });
      }
      otpStore.delete(phone);
      const existingEmail = await db.select().from(users).where(eq(users.email, email));
      if (existingEmail.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this email already exists" });
      }
      const existingPhone = await db.select().from(users).where(eq(users.phone, phone));
      if (existingPhone.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this phone number already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db.insert(users).values({
        name,
        email,
        phone,
        password: hashedPassword
      }).returning();
      const { password: _, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/auth/login-with-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const [user] = await db.select().from(users).where(eq(users.phone, phone));
      if (!user) {
        return res.status(404).json({ success: false, error: "No account found with this phone number" });
      }
      const otp = generateOtp();
      otpStore.set(`login_${phone}`, { otp, expiresAt: Date.now() + 5 * 60 * 1e3 });
      const smsSent = await sendOtpSmsFast2SMS(phone, otp);
      const whatsappSent = await sendWhatsAppOtpTemplate(phone, otp);
      console.log(`[OTP] Login OTP for ${phone} \u2014 SMS: ${smsSent}, WhatsApp template: ${whatsappSent}`);
      if (!smsSent && !whatsappSent) {
        return res.status(500).json({ success: false, error: "Failed to send OTP. Please use email and password to sign in." });
      }
      const method = whatsappSent ? "WhatsApp" : "SMS";
      res.json({ success: true, message: `OTP sent via ${method}` });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/auth/verify-login-otp", async (req, res) => {
    try {
      const { phone, otp } = req.body;
      if (!phone || !otp) {
        return res.status(400).json({ success: false, error: "Phone and OTP are required" });
      }
      const stored = otpStore.get(`login_${phone}`);
      if (!stored) {
        return res.status(400).json({ success: false, error: "No OTP found. Please request a new OTP." });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(`login_${phone}`);
        return res.status(400).json({ success: false, error: "OTP has expired. Please request a new OTP." });
      }
      if (stored.otp !== otp) {
        return res.status(400).json({ success: false, error: "Invalid OTP" });
      }
      otpStore.delete(`login_${phone}`);
      const [user] = await db.select().from(users).where(eq(users.phone, phone));
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/packages", async (req, res) => {
    try {
      const { type, minPrice, maxPrice } = req.query;
      let allPackages = await db.select().from(packages);
      let filtered = allPackages;
      if (type && type !== "all") {
        filtered = filtered.filter((p) => p.type === type);
      }
      if (minPrice) {
        filtered = filtered.filter((p) => parseFloat(p.price) >= parseFloat(minPrice));
      }
      if (maxPrice) {
        filtered = filtered.filter((p) => parseFloat(p.price) <= parseFloat(maxPrice));
      }
      res.json({ success: true, packages: filtered });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/packages/:id", async (req, res) => {
    try {
      const [pkg] = await db.select().from(packages).where(eq(packages.id, parseInt(req.params.id)));
      if (!pkg) {
        return res.status(404).json({ success: false, error: "Package not found" });
      }
      res.json({ success: true, package: pkg });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/bookings", async (req, res) => {
    try {
      const bookingData = req.body;
      const [booking] = await db.insert(bookings).values({
        ...bookingData,
        status: "pending",
        paymentStatus: "pending",
        paidAmount: "0"
      }).returning();
      try {
        await sendNotifications(booking.userId, booking.id, "booking_created");
      } catch (e) {
        console.error("Notification error:", e);
      }
      res.json({ success: true, booking });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/bookings/user/:userId", async (req, res) => {
    try {
      const userBookings = await db.select().from(bookings).where(eq(bookings.userId, parseInt(req.params.userId))).orderBy(desc(bookings.bookingDate));
      res.json({ success: true, bookings: userBookings });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/bookings/:id", async (req, res) => {
    try {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, parseInt(req.params.id)));
      if (!booking) {
        return res.status(404).json({ success: false, error: "Booking not found" });
      }
      res.json({ success: true, booking });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/invoice/:bookingId", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.bookingId);
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).send("Invoice not found");
      const [pkg] = await db.select().from(packages).where(eq(packages.id, booking.packageId));
      const [user] = await db.select().from(users).where(eq(users.id, booking.userId));
      const allPayments = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
      const totalPaid = allPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
      let invoiceNum = booking.invoiceNumber;
      if (!invoiceNum) {
        invoiceNum = generateInvoiceNumber(bookingId);
        await db.update(bookings).set({ invoiceNumber: invoiceNum }).where(eq(bookings.id, bookingId));
      }
      const totalAmount = parseFloat(booking.totalAmount);
      const numberOfPeople = booking.numberOfPeople;
      const ratePerPerson = totalAmount / numberOfPeople;
      const gstRate = 0.05;
      const tcsRate = 0.05;
      const baseAmount = totalAmount / (1 + gstRate);
      const gstAmount = totalAmount - baseAmount;
      const cgst = gstAmount / 2;
      const sgst = gstAmount / 2;
      const tcsAmount = totalAmount * tcsRate;
      const grandTotal = totalAmount + tcsAmount;
      const bookingDate = booking.bookingDate ? new Date(booking.bookingDate) : /* @__PURE__ */ new Date();
      const dueDate = new Date(bookingDate);
      dueDate.setDate(dueDate.getDate() + 30);
      const serviceName = pkg ? `${pkg.type === "hajj" ? "Hajj" : "Umrah"} - ${pkg.name}` : "Tour Service";
      const roomLabel = booking.roomType || "";
      let serviceRows = "";
      for (let i = 0; i < numberOfPeople; i++) {
        const traveler = booking.travelers && booking.travelers[i];
        const travelerName = traveler ? traveler.name : `Person ${i + 1}`;
        const dob = traveler?.dateOfBirth ? `DOB: ${traveler.dateOfBirth}` : "";
        const passport = traveler?.passportNumber ? `Passport: ${traveler.passportNumber}` : "";
        const details = [dob, passport, roomLabel].filter(Boolean).join(" | ");
        serviceRows += `
          <tr>
            <td>${i + 1}</td>
            <td>
              <div class="service-name">${serviceName}</div>
              <div class="service-desc">${travelerName}${details ? '<br><small style="color:#6b7280">' + details + "</small>" : ""}</div>
            </td>
            <td>998555</td>
            <td style="text-align:right">\u20B9 ${formatINR(ratePerPerson)}</td>
            <td style="text-align:right">\u20B9 ${formatINR(gstAmount / numberOfPeople)}</td>
            <td style="text-align:right">\u20B9 ${formatINR(ratePerPerson + gstAmount / numberOfPeople)}</td>
          </tr>`;
      }
      const previousBalance = 0;
      const currentBalance = grandTotal - totalPaid;
      let template = readFileSync(join(__dirname, "templates", "invoice.html"), "utf-8");
      const replacements = {
        "{{INVOICE_NUMBER}}": invoiceNum,
        "{{INVOICE_DATE}}": bookingDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        "{{DUE_DATE}}": dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        "{{CUSTOMER_NAME}}": booking.contactName || user?.name || "",
        "{{CUSTOMER_ADDRESS}}": booking.address || "",
        "{{CUSTOMER_PHONE}}": booking.contactPhone || user?.phone || "",
        "{{CUSTOMER_EMAIL}}": booking.contactEmail || user?.email || "",
        "{{SERVICE_ROWS}}": serviceRows,
        "{{TCS_AMOUNT}}": `\u20B9 ${formatINR(tcsAmount)}`,
        "{{TAX_TOTAL}}": `${formatINR(gstAmount + tcsAmount)}`,
        "{{GRAND_TOTAL}}": `${formatINR(grandTotal)}`,
        "{{RECEIVED_AMOUNT}}": formatINR(totalPaid),
        "{{PREVIOUS_BALANCE}}": formatINR(previousBalance),
        "{{CURRENT_BALANCE}}": formatINR(currentBalance),
        "{{TAXABLE_VALUE}}": formatINR(baseAmount),
        "{{CGST_AMOUNT}}": formatINR(cgst),
        "{{SGST_AMOUNT}}": formatINR(sgst),
        "{{GST_TOTAL}}": formatINR(gstAmount),
        "{{AMOUNT_IN_WORDS}}": numberToWords(grandTotal),
        "{{SHARE_URL}}": encodeURIComponent(`https://${process.env.REPLIT_DEV_DOMAIN || "localhost:5000"}/invoice/${bookingId}`)
      };
      for (const [key, value] of Object.entries(replacements)) {
        template = template.split(key).join(value);
      }
      res.send(template);
    } catch (error) {
      console.error("[Invoice] Error:", error);
      res.status(500).send("Error generating invoice");
    }
  });
  app2.post("/api/payments/create-order", async (req, res) => {
    try {
      const { bookingId, amount } = req.body;
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return res.status(500).json({ success: false, error: "Payment gateway not configured. Please contact support." });
      }
      const parsedAmount = parseFloat(amount);
      if (parsedAmount > 5e5) {
        return res.status(400).json({ success: false, error: "Maximum \u20B95,00,000 per transaction. Please pay in installments." });
      }
      if (parsedAmount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid payment amount." });
      }
      const amountInPaise = Math.round(parsedAmount * 100);
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: `booking_${bookingId}`
        })
      });
      const order = await response.json();
      if (!response.ok) {
        console.error("[Razorpay] Order creation failed:", order);
        return res.status(400).json({ success: false, error: order.error?.description || "Failed to create Razorpay order" });
      }
      console.log("[Razorpay] Order created:", order.id);
      res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency, keyId });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/payments/verify", async (req, res) => {
    try {
      const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) {
        return res.status(500).json({ success: false, error: "Payment verification unavailable. Server configuration error." });
      }
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ success: false, error: "Missing payment details for verification." });
      }
      const expectedSignature = createHmac("sha256", keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({ success: false, error: "Invalid payment signature. Payment verification failed." });
      }
      console.log("[Razorpay] Signature verified successfully");
      const [payment] = await db.insert(payments).values({
        bookingId: parseInt(bookingId),
        amount,
        paymentMethod: "razorpay",
        transactionId: razorpayPaymentId,
        status: "success",
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      }).returning();
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, parseInt(bookingId)));
      const newPaidAmount = parseFloat(booking.paidAmount || "0") + parseFloat(amount);
      const totalAmount = parseFloat(booking.totalAmount);
      let paymentStatus = "partial";
      let bookingStatus = booking.status;
      if (newPaidAmount >= totalAmount) {
        paymentStatus = "completed";
        bookingStatus = "confirmed";
      }
      await db.update(bookings).set({
        paidAmount: newPaidAmount.toString(),
        paymentStatus,
        status: bookingStatus,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(bookings.id, parseInt(bookingId)));
      try {
        await sendNotifications(booking.userId, booking.id, "payment_success");
      } catch (e) {
        console.error("Notification error:", e);
      }
      res.json({ success: true, payment });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  const ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "pdf", "doc", "docx"]);
  app2.post("/api/documents/upload", upload.single("file"), async (req, res) => {
    try {
      const { userId, bookingId, type, fileName } = req.body;
      if (!userId || !type) {
        return res.status(400).json({ success: false, error: "userId and type are required" });
      }
      let fileUrl = req.body.fileUrl || "";
      const file = req.file;
      if (file) {
        const ext = ((fileName || file.originalname || "file").split(".").pop() || "").toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return res.status(400).json({ success: false, error: `File type .${ext} not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}` });
        }
        const client = getStorageClient();
        if (client) {
          const randomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 14);
          const storagePath = `public/documents/${userId}/${randomId}.${ext}`;
          const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
          if (uploadResult.ok) {
            fileUrl = `/api/files/${storagePath}`;
            console.log(`[Upload] File stored: ${storagePath}`);
          } else {
            console.error("[Upload] Storage error:", uploadResult);
            return res.status(500).json({ success: false, error: "File storage failed" });
          }
        } else {
          return res.status(500).json({ success: false, error: "Object storage not configured" });
        }
      }
      const [document] = await db.insert(documents).values({
        userId: parseInt(userId),
        bookingId: bookingId ? parseInt(bookingId) : null,
        type,
        fileName: fileName || (file ? file.originalname : "unknown"),
        fileUrl
      }).returning();
      res.json({ success: true, document });
    } catch (error) {
      console.error("[Upload] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/files/public/documents/:userId/:filename", async (req, res) => {
    try {
      const client = getStorageClient();
      if (!client) {
        return res.status(500).json({ error: "Storage not configured" });
      }
      const storagePath = `public/documents/${req.params.userId}/${req.params.filename}`;
      const result = await client.downloadAsBytes(storagePath);
      if (!result.ok || !result.value) {
        return res.status(404).json({ error: "File not found" });
      }
      const ext = req.params.filename.split(".").pop()?.toLowerCase() || "";
      const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${req.params.filename}"`);
      res.send(Buffer.from(result.value));
    } catch (error) {
      console.error("[Files] Download error:", error);
      res.status(500).json({ error: "Could not retrieve file" });
    }
  });
  app2.get("/api/documents/user/:userId", async (req, res) => {
    try {
      const userDocuments = await db.select().from(documents).where(eq(documents.userId, parseInt(req.params.userId)));
      res.json({ success: true, documents: userDocuments });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/seed", async (req, res) => {
    try {
      const existingPackages = await db.select().from(packages);
      if (existingPackages.length > 0) {
        return res.json({ success: true, message: "Data already seeded", packages: existingPackages });
      }
      const seededPackages = await db.insert(packages).values([
        {
          type: "umrah",
          name: "Premium Umrah Package",
          category: "Premium Umrah",
          description: "Premium Umrah experience with 3-star Azka Safa Hotel just 200 meters from Haram in Makkah and Rose Holiday Hotel 100 meters from Masjid Nabawi in Madinah. Weekly departures available. All packages exclude 5% GST.",
          duration: "14 Nights / 15 Days",
          price: "150000",
          roomPrices: { quad: 15e4 },
          inclusions: ["Azka Safa Hotel Makkah (3 Star, 200m from Haram)", "Rose Holiday Hotel Madinah (3 Star, 100m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport Jeddah\u2013Makkah\u2013Madinah\u2013Jeddah", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Azka Safa Hotel", rating: 3, distance: "200 meters from Haram" }, madinah: { name: "Rose Holiday Hotel", rating: 3, distance: "100 meters from Masjid Nabawi" } },
          flight: "Included",
          transport: "AC Bus Jeddah\u2013Makkah\u2013Madinah\u2013Jeddah",
          food: "As per hotel",
          roomSharing: "4 Sharing",
          availableSeats: 50,
          departureDate: /* @__PURE__ */ new Date("2026-04-01"),
          returnDate: /* @__PURE__ */ new Date("2026-04-15"),
          featured: true
        },
        {
          type: "umrah",
          name: "Economy Umrah Package",
          category: "Economy Umrah",
          description: "Affordable Umrah package with Durrat O Sallah Hotel (600m, 12 min walk from Haram) in Makkah and Guest Time Hotel (200m from Masjid Nabawi) in Madinah. 5-person sharing rooms. Departures every 15 days. All packages exclude 5% GST.",
          duration: "14 Nights / 15 Days",
          price: "90000",
          roomPrices: { "5_sharing": 9e4 },
          inclusions: ["Durrat O Sallah Hotel Makkah (1 Star, 600m from Haram)", "Guest Time Hotel Madinah (2 Star, 200m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport Jeddah\u2013Makkah\u2013Madinah\u2013Jeddah", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Durrat O Sallah", rating: 1, distance: "600 meters (12 minutes walk)" }, madinah: { name: "Guest Time Hotel", rating: 2, distance: "200 meters from Masjid Nabawi" } },
          flight: "Included",
          transport: "AC Bus Jeddah\u2013Makkah\u2013Madinah\u2013Jeddah",
          food: "As per hotel",
          roomSharing: "5 Person Sharing",
          availableSeats: 80,
          departureDate: /* @__PURE__ */ new Date("2026-04-01"),
          returnDate: /* @__PURE__ */ new Date("2026-04-15"),
          featured: false
        },
        {
          type: "umrah",
          name: "Ramadan Umrah Special \u2013 Last 20 Days",
          category: "Ramadan Umrah",
          description: "Special Ramadan Umrah package for the blessed last 20 days. Stay at Kayan Al Raya Hotel Ajiyad (500m from Haram) in Makkah and Arjwan Sada Hotel (300m from Masjid Nabawi) in Madinah. 4/5 sharing rooms. Departure: 28 January 2027. All packages exclude 5% GST.",
          duration: "20 Days",
          price: "140000",
          roomPrices: { "4_sharing": 14e4, "5_sharing": 14e4 },
          inclusions: ["Kayan Al Raya Hotel Ajiyad Makkah (1 Star, 500m from Haram)", "Arjwan Sada Hotel Madinah (300m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Kayan Al Raya Hotel Ajiyad", rating: 1, distance: "500 meters from Haram" }, madinah: { name: "Arjwan Sada Hotel", rating: 2, distance: "300 meters from Masjid Nabawi" } },
          flight: "Included",
          transport: "AC Bus",
          food: "As per hotel",
          roomSharing: "4 / 5 Sharing",
          availableSeats: 40,
          departureDate: /* @__PURE__ */ new Date("2027-01-28"),
          returnDate: /* @__PURE__ */ new Date("2027-02-17"),
          featured: true
        },
        {
          type: "umrah",
          name: "Ramadan Umrah Full Month Package",
          category: "Ramadan Umrah",
          description: "Complete Ramadan experience \u2013 32 days covering the full blessed month. 20 days in Makkah at Zohratu Sallah Hotel (600m from Haram) and 12 days in Madinah at Lulu Madinah Hotel (300m from Masjid Nabawi). Includes Sahoor, Iftar & Dinner meals, Akasa Air flight with 30 KG baggage + Zamzam. All packages exclude 5% GST.",
          duration: "32 Days",
          price: "180000",
          roomPrices: { "5_sharing": 18e4, "6_sharing": 18e4 },
          inclusions: ["Akasa Air Flight (30 KG + Zamzam)", "Zohratu Sallah Hotel Makkah (600m from Haram) \u2013 20 Days", "Lulu Madinah Hotel (1 Star, 300m from Masjid Nabawi) \u2013 12 Days", "Sahoor + Iftar + Dinner Meals", "AC Bus Jeddah\u2013Makkah\u2013Madinah\u2013Jeddah", "Makkah Ziyarat", "Madinah Ziyarat", "Visa Processing", "Airport Transfers"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Zohratu Sallah Hotel Bir Balila Ajiyad", rating: 1, distance: "600 meters from Haram" }, madinah: { name: "Lulu Madinah Hotel", rating: 1, distance: "300 meters from Masjid Nabawi" } },
          flight: "Akasa Air (30 KG + Zamzam)",
          transport: "AC Bus Jeddah\u2013Makkah\u2013Madinah\u2013Jeddah",
          food: "Sahoor + Iftar + Dinner",
          roomSharing: "5 / 6 Sharing",
          availableSeats: 40,
          departureDate: /* @__PURE__ */ new Date("2027-01-09"),
          returnDate: /* @__PURE__ */ new Date("2027-02-10"),
          featured: true
        },
        {
          type: "hajj",
          name: "Burhan Royal Elite",
          category: "Luxury Hajj Package",
          description: "The ultimate luxury Hajj experience with Clock Tower accommodation at 0 meters from Haram, VIP gypsum board tents with buffet meals, direct Saudi Airlines flight, and premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks",
          price: "1450000",
          roomPrices: { double: 18e5, triple: 155e4, quad: 145e4 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Gypsum Board Tents (A/C) with Buffet Meals", "Luxury A/C Buses", "Clock Tower (Abraj Al Bait) Makkah Hotel", "3 Nights Madinah Stay", "Full Board Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Clock Tower (Abraj Al Bait)", rating: 5, distance: "0 meters from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight",
          transport: "Luxury A/C Buses",
          food: "Full Board \u2013 Continental Meals",
          muallim: "Premium Muallim Service",
          tent: "VIP Gypsum Board Tents (A/C) with Buffet Meals",
          roomSharing: "4 / 3 / 2",
          availableSeats: 50,
          departureDate: /* @__PURE__ */ new Date("2027-05-11"),
          returnDate: /* @__PURE__ */ new Date("2027-06-20"),
          featured: true
        },
        {
          type: "hajj",
          name: "Burhan Elite Plus",
          category: "Premium Hajj Package",
          description: "Premium Hajj package with Azka Al Maqam hotel at 0 meters from Haram, VIP air conditioned tents, direct Saudi Airlines flight, and premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks",
          price: "1195000",
          roomPrices: { double: 145e4, triple: 13e5, quad: 125e4, sharing: 1195e3 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Azka Al Maqam Makkah Hotel (0m from Haram)", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Azka Al Maqam / Similar", rating: 5, distance: "0 meters from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight",
          transport: "Luxury A/C Buses",
          food: "Indian + Continental Meals",
          muallim: "Premium Muallim Service",
          tent: "VIP Air Conditioned Tents",
          roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 50,
          departureDate: /* @__PURE__ */ new Date("2027-05-11"),
          returnDate: /* @__PURE__ */ new Date("2027-06-20"),
          featured: true
        },
        {
          type: "hajj",
          name: "Burhan Comfort Plus",
          category: "Executive Hajj Package",
          description: "Executive Hajj package with Le Meridien Tower (Saja Makkah) with 1.5km shuttle service, VIP A/C tents, direct Saudi Airlines flight. All packages exclude 5% GST.",
          duration: "2 Weeks",
          price: "1075000",
          roomPrices: { double: 13e5, triple: 1175e3, quad: 1125e3, sharing: 1075e3 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Le Meridien Tower (Saja Makkah)", "1.5km Shuttle Service to Haram", "3 Nights Madinah Stay", "Full Board Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Le Meridien Tower (Saja Makkah)", rating: 5, distance: "1.5 km shuttle service" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight",
          transport: "Luxury A/C Buses",
          food: "Full Board \u2013 Continental Meals",
          muallim: "Premium Muallim Service",
          tent: "VIP Air Conditioned Tents",
          roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 60,
          departureDate: /* @__PURE__ */ new Date("2027-05-11"),
          returnDate: /* @__PURE__ */ new Date("2027-06-20"),
          featured: true
        },
        {
          type: "hajj",
          name: "Burhan Comfort",
          category: "Standard Hajj Package",
          description: "Standard Hajj package with Esarah hotel in Setten area, VIP A/C tents, direct Saudi Airlines flight. Indian & Continental meals with premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks",
          price: "975000",
          roomPrices: { double: 117e4, triple: 105e4, quad: 101e4, sharing: 975e3 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 4, distance: "< 4 km from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight",
          transport: "Luxury A/C Buses",
          food: "Indian + Continental Meals",
          muallim: "Premium Muallim Service",
          tent: "VIP Air Conditioned Tents",
          roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 60,
          departureDate: /* @__PURE__ */ new Date("2027-05-11"),
          returnDate: /* @__PURE__ */ new Date("2027-06-20"),
          featured: false
        },
        {
          type: "hajj",
          name: "Burhan Economy Plus",
          category: "Economy Hajj Package",
          description: "Economy Hajj package with Esarah hotel, premium gypsum board A/C tents, direct Saudi Airlines flight. Category A Muallim with Indian & Continental meals. All packages exclude 5% GST.",
          duration: "2 Weeks",
          price: "900000",
          roomPrices: { double: 1035e3, triple: 95e4, quad: 925e3, sharing: 9e5 },
          inclusions: ["Saudi Airlines Direct Flight", "Category A Muallim", "Premium Gypsum Board Tents (A/C)", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 3, distance: "< 4 km from Haram" }, madinah: { name: "Nozol Royal Inn / Similar", rating: 3, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight",
          transport: "Luxury A/C Buses",
          food: "Indian + Continental Meals",
          muallim: "Category A Muallim",
          tent: "Premium Gypsum Board Tents (A/C)",
          roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 80,
          departureDate: /* @__PURE__ */ new Date("2027-05-11"),
          returnDate: /* @__PURE__ */ new Date("2027-06-20"),
          featured: false
        },
        {
          type: "hajj",
          name: "Burhan Budget Saver",
          category: "Budget Hajj Package",
          description: "Most affordable Hajj package with Air India direct flight, premium gypsum board A/C tents, 6-sharing rooms at Esarah hotel. Indian & Continental meals included. All packages exclude 5% GST.",
          duration: "2 Weeks",
          price: "825000",
          roomPrices: { "6_sharing": 825e3 },
          inclusions: ["Air India Direct Flight", "Category A Muallim", "Premium Gypsum Board Tents (A/C)", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 3, distance: "< 4 km from Haram" }, madinah: { name: "Nozol Royal Inn / Similar", rating: 3, distance: "150 meters from Haram" } },
          flight: "Air India - Direct Flight",
          transport: "Luxury A/C Buses",
          food: "Indian + Continental Meals",
          muallim: "Category A Muallim",
          tent: "Premium Gypsum Board Tents (A/C)",
          roomSharing: "6 Sharing",
          availableSeats: 100,
          departureDate: /* @__PURE__ */ new Date("2027-05-11"),
          returnDate: /* @__PURE__ */ new Date("2027-06-20"),
          featured: false
        },
        {
          type: "hajj",
          name: "Burhan Budget Saver Shifting",
          category: "Most Popular Hajj Package 2027",
          description: "Most popular 40-day Hajj package. 10 days pre-Hajj in Azizia area, 15 days post-Hajj at Grand Masa Hotel (3 Star, 400m from Haram), and 9 days in Madinah at Haya Plaza Hotel (3 Star, 100m from Masjid Nabawi). Category D Moulim \u2013 New Mina. Includes AC bus transport, Ziyarat of Makkah, Madinah, Taif & Badar. Comes with complimentary travel kit including bags, umbrella, sunglasses, electric neck fan, sleeping mat, Janamaz, Tasbeeh, Ihram & printed Hajj guide. All packages exclude 5% GST.",
          duration: "40 Days",
          price: "650000",
          roomPrices: { sharing: 65e4 },
          inclusions: ["Category D Moulim \u2013 New Mina", "Azizia Area Hotel (5 km from Haram) \u2013 10 Days Pre-Hajj", "Grand Masa Hotel Makkah (3 Star, 400m from Haram) \u2013 15 Days Post-Hajj", "Haya Plaza Hotel Madinah (3 Star, 100m from Masjid Nabawi) \u2013 9 Days", "AC Bus Transport", "Makkah Ziyarat", "Madinah Ziyarat", "Taif Ziyarat", "Badar Ziyarat", "Visa Processing", "Airport Transfers", 'Complimentary Travel Kit (24" & 20" PP bags, Backpack, Mina/Arafat bag, Passport bag, Shoe bag, Umbrella, Sunglasses, Electric neck fan, Muzdalifah sleeping mat, Janamaz, Tasbeeh, Printed Hajj & Umrah guide, Ihram belt, Ihram)'],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani", "Flight tickets"],
          hotelDetails: { makkah: { name: "Grand Masa Hotel (Post-Hajj) / Azizia Area (Pre-Hajj)", rating: 3, distance: "400 meters from Haram (Post-Hajj)" }, madinah: { name: "Haya Plaza Hotel", rating: 3, distance: "100 meters from Masjid Nabawi" } },
          flight: "Not included",
          transport: "AC Bus",
          food: "As per hotel",
          muallim: "Category D \u2013 New Mina",
          roomSharing: "Sharing",
          availableSeats: 100,
          departureDate: /* @__PURE__ */ new Date("2027-05-05"),
          returnDate: /* @__PURE__ */ new Date("2027-06-20"),
          featured: true
        }
      ]).returning();
      res.json({ success: true, message: "Database seeded successfully", packages: seededPackages });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  function getInvoiceBaseUrl() {
    if (process.env.INVOICE_BASE_URL) {
      return process.env.INVOICE_BASE_URL.replace(/\/$/, "");
    }
    if (process.env.REPLIT_DOMAINS) {
      const first = process.env.REPLIT_DOMAINS.split(",")[0].trim();
      return `https://${first}`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    return "http://localhost:5000";
  }
  async function sendNotifications(userId, bookingId, type) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return;
    const invoiceUrl = `${getInvoiceBaseUrl()}/invoice/${bookingId}`;
    let invoiceNum = "";
    let packageName = "Hajj/Umrah Package";
    let amountPaid = "0";
    let totalAmount = "0";
    let customerName = user.name;
    try {
      const [bk] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (bk) {
        invoiceNum = bk.invoiceNumber || generateInvoiceNumber(bookingId);
        if (!bk.invoiceNumber) {
          await db.update(bookings).set({ invoiceNumber: invoiceNum }).where(eq(bookings.id, bookingId));
        }
        amountPaid = formatINR(parseFloat(bk.paidAmount || "0"));
        totalAmount = formatINR(parseFloat(bk.totalAmount || "0"));
        customerName = bk.contactName || user.name;
        const [pkg] = await db.select().from(packages).where(eq(packages.id, bk.packageId));
        if (pkg) packageName = pkg.name;
      }
    } catch (e) {
    }
    const smsAmount = type === "booking_created" ? totalAmount : amountPaid;
    let message = "";
    switch (type) {
      case "booking_created":
        message = `Assalamu Alaikum

Dear *${customerName}*

Your booking with *Al Burhan Tours & Travels* has been created successfully.

Package: ${packageName}
Invoice No: ${invoiceNum}

View Invoice:
${invoiceUrl}

Our team will contact you shortly.

For assistance please contact:
9893225590
9893989786

*Al Burhan Tours & Travels*`;
        break;
      case "payment_success":
        message = `Assalamu Alaikum

Dear *${customerName}*

Your booking with *Al Burhan Tours & Travels* has been confirmed.

Package: ${packageName}
Amount Paid: \u20B9${amountPaid}

Your invoice is attached below.
${invoiceUrl}

For assistance please contact:
9893225590
9893989786

*Al Burhan Tours & Travels*`;
        break;
    }
    const smsResult = await sendBookingDltSms(user.phone, customerName, packageName, smsAmount, invoiceUrl);
    console.log(`[SMS DLT] To ${user.phone}: ${smsResult ? "sent" : "failed"} | amount=${smsAmount} | url=${invoiceUrl}`);
    const whatsappResult = await sendWhatsAppConfirmationTemplate(
      user.phone,
      customerName,
      packageName,
      `INR ${smsAmount}`,
      invoiceUrl
    );
    console.log(`[WhatsApp Confirmation Template] To ${user.phone}: ${whatsappResult ? "sent" : "failed"}`);
    await db.insert(notifications).values({
      userId,
      bookingId,
      type: "multi_channel",
      channel: "all",
      message,
      status: smsResult || whatsappResult ? "sent" : "pending"
    });
  }
  app2.get("/api/admin/bookings", async (req, res) => {
    try {
      const allBookings = await db.select().from(bookings).orderBy(desc(bookings.bookingDate));
      res.json({ success: true, bookings: allBookings });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/customers", async (req, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt
      }).from(users).orderBy(desc(users.createdAt));
      res.json({ success: true, customers: allUsers });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/payments", async (req, res) => {
    try {
      const allPayments = await db.select().from(payments).orderBy(desc(payments.paymentDate));
      res.json({ success: true, payments: allPayments });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/documents", async (req, res) => {
    try {
      const allDocs = await db.select({
        id: documents.id,
        userId: documents.userId,
        bookingId: documents.bookingId,
        type: documents.type,
        fileName: documents.fileName,
        fileUrl: documents.fileUrl,
        uploadedAt: documents.uploadedAt,
        userName: users.name
      }).from(documents).leftJoin(users, eq(documents.userId, users.id)).orderBy(desc(documents.uploadedAt));
      res.json({ success: true, documents: allDocs });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/stats", async (req, res) => {
    try {
      const allBookings = await db.select().from(bookings);
      const allUsers = await db.select().from(users);
      const allPayments = await db.select().from(payments);
      const allDocs = await db.select().from(documents);
      const totalRevenue = allPayments.filter((p) => p.status === "success").reduce((sum2, p) => sum2 + parseFloat(p.amount), 0);
      const pendingBookings = allBookings.filter((b) => b.status === "pending").length;
      const confirmedBookings = allBookings.filter((b) => b.status === "confirmed").length;
      res.json({
        success: true,
        stats: {
          totalBookings: allBookings.length,
          totalCustomers: allUsers.length,
          totalRevenue,
          pendingBookings,
          confirmedBookings,
          totalPayments: allPayments.length,
          totalDocuments: allDocs.length
        }
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.put("/api/admin/bookings/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ success: false, error: "Status is required" });
      }
      const [updated] = await db.update(bookings).set({
        status,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(bookings.id, parseInt(req.params.id))).returning();
      if (!updated) {
        return res.status(404).json({ success: false, error: "Booking not found" });
      }
      res.json({ success: true, booking: updated });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/upload-document", upload.single("file"), async (req, res) => {
    try {
      const { userId, type } = req.body;
      if (!userId || !type) {
        return res.status(400).json({ success: false, error: "userId and type are required" });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: "File is required" });
      }
      const ALLOWED_EXTENSIONS2 = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "pdf", "doc", "docx"]);
      const ext = (file.originalname || "file").split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS2.has(ext)) {
        return res.status(400).json({ success: false, error: `File type .${ext} not allowed` });
      }
      const client = getStorageClient();
      if (!client) {
        return res.status(500).json({ success: false, error: "Object storage not configured" });
      }
      const randomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 14);
      const storagePath = `public/documents/${userId}/${randomId}.${ext}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) {
        return res.status(500).json({ success: false, error: "File storage failed" });
      }
      const fileUrl = `/api/files/${storagePath}`;
      const [document] = await db.insert(documents).values({
        userId: parseInt(userId),
        bookingId: req.body.bookingId ? parseInt(req.body.bookingId) : null,
        type,
        fileName: file.originalname || "document",
        fileUrl
      }).returning();
      console.log(`[Admin Upload] ${type} for user #${userId}: ${storagePath}`);
      const [targetUser] = await db.select().from(users).where(eq(users.id, parseInt(userId)));
      if (targetUser) {
        const docLabel = type === "visa" ? "Visa" : type === "ticket" ? "Ticket" : type;
        const message = `Assalamu Alaikum ${targetUser.name}, Your ${docLabel} document has been uploaded by AL BURHAN TOURS & TRAVELS. Please check your profile in the app to view it. JazakAllah Khair.`;
        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="background:#047857;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
              <h2 style="margin:0">AL BURHAN TOURS & TRAVELS</h2>
            </div>
            <div style="background:#f0fdf4;padding:24px;border:1px solid #d1fae5">
              <p>Assalamu Alaikum <strong>${targetUser.name}</strong>,</p>
              <p>Your <strong>${docLabel}</strong> document has been uploaded to your profile.</p>
              <p>Please open the AL BURHAN app and check your Profile > Documents section to view and download it.</p>
              <p style="margin-top:20px;color:#6b7280;font-size:13px">JazakAllah Khair<br>AL BURHAN TOURS & TRAVELS Team</p>
            </div>
          </div>`;
        const smsResult = await sendSmsFast2SMS(targetUser.phone, message);
        const waDocResult = await sendWhatsAppBotBee(targetUser.phone, message);
        let whatsappResult = waDocResult.sent;
        if (!waDocResult.sent && waDocResult.blocked) {
          whatsappResult = await sendWhatsAppBookingTemplate(targetUser.phone, targetUser.name);
        }
        const emailResult = await sendEmail(targetUser.email, `Your ${docLabel} Document - AL BURHAN TOURS`, emailHtml);
        await db.insert(notifications).values({
          userId: parseInt(userId),
          type: "document_uploaded",
          channel: "all",
          message,
          status: smsResult || whatsappResult || emailResult ? "sent" : "pending"
        });
        console.log(`[Notification] Doc upload for user #${userId} - SMS:${smsResult} WhatsApp:${whatsappResult} Email:${emailResult}`);
      }
      res.json({ success: true, document });
    } catch (error) {
      console.error("[Admin Upload] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/create-offline-invoice", async (req, res) => {
    try {
      const {
        contactName,
        contactPhone,
        contactEmail,
        address,
        packageId,
        numberOfPeople,
        totalAmount,
        paidAmount,
        travelers,
        roomType,
        specialRequests,
        sendSms,
        sendWhatsapp
      } = req.body;
      if (!contactName || !contactPhone || !packageId || !totalAmount) {
        return res.status(400).json({ success: false, error: "Name, phone, package, and amount are required" });
      }
      let existingUser = await db.select().from(users).where(eq(users.phone, contactPhone));
      let userId;
      if (existingUser.length > 0) {
        userId = existingUser[0].id;
      } else {
        const hashedPassword = await bcrypt.hash("offline_" + Date.now(), 10);
        const [newUser] = await db.insert(users).values({
          name: contactName,
          email: contactEmail || contactName.toLowerCase().replace(/\s/g, "") + Date.now() + "@offline.local",
          phone: contactPhone,
          password: hashedPassword
        }).returning();
        userId = newUser.id;
      }
      const invoiceNum = generateInvoiceNumber(0);
      const [booking] = await db.insert(bookings).values({
        userId,
        packageId: parseInt(packageId),
        numberOfPeople: numberOfPeople || 1,
        totalAmount,
        status: parseFloat(paidAmount || "0") >= parseFloat(totalAmount) ? "confirmed" : "pending",
        paymentStatus: parseFloat(paidAmount || "0") >= parseFloat(totalAmount) ? "completed" : parseFloat(paidAmount || "0") > 0 ? "partial" : "pending",
        paidAmount: paidAmount || "0",
        travelers: travelers || [{ name: contactName, age: 0, gender: "", passportNumber: "", passportExpiry: "" }],
        contactName,
        contactPhone,
        contactEmail: contactEmail || "",
        address: address || "",
        specialRequests: specialRequests || null,
        invoiceNumber: "",
        roomType: roomType || null
      }).returning();
      const actualInvoiceNum = generateInvoiceNumber(booking.id);
      await db.update(bookings).set({ invoiceNumber: actualInvoiceNum }).where(eq(bookings.id, booking.id));
      if (parseFloat(paidAmount || "0") > 0) {
        await db.insert(payments).values({
          bookingId: booking.id,
          amount: paidAmount,
          paymentMethod: "offline",
          transactionId: "OFFLINE_" + Date.now(),
          status: "success"
        });
      }
      const invoiceUrl = `${getInvoiceBaseUrl()}/invoice/${booking.id}`;
      const totalAmt = parseFloat(totalAmount);
      const tcsAmount = totalAmt * 0.05;
      const grandTotal = totalAmt + tcsAmount;
      let offlinePackageName = "Hajj/Umrah Package";
      try {
        const [offlinePkg] = await db.select().from(packages).where(eq(packages.id, parseInt(packageId)));
        if (offlinePkg) offlinePackageName = offlinePkg.name;
      } catch (e) {
      }
      let notificationStatus = "";
      const message = `Assalamu Alaikum

Dear *${contactName}*

Your booking with *Al Burhan Tours & Travels* has been confirmed.

Package: ${offlinePackageName}
Amount Paid: \u20B9${formatINR(parseFloat(paidAmount || "0"))}

Your invoice is attached below.
${invoiceUrl}

For assistance please contact:
9893225590
9893989786

*Al Burhan Tours & Travels*`;
      if (sendSms) {
        const smsOk = await sendBookingDltSms(contactPhone, contactName, offlinePackageName, formatINR(parseFloat(paidAmount || "0")), invoiceUrl);
        console.log(`[SMS DLT Offline] To ${contactPhone}: ${smsOk ? "sent" : "failed"}`);
        notificationStatus += smsOk ? "SMS sent. " : "SMS failed. ";
      }
      if (sendWhatsapp) {
        const waOfflineOk = await sendWhatsAppConfirmationTemplate(
          contactPhone,
          contactName,
          offlinePackageName,
          `INR ${formatINR(parseFloat(paidAmount || "0"))}`,
          invoiceUrl
        );
        notificationStatus += waOfflineOk ? "WhatsApp sent. " : "WhatsApp failed/skipped. ";
      }
      res.json({
        success: true,
        bookingId: booking.id,
        invoiceNumber: actualInvoiceNum,
        grandTotal,
        notificationStatus
      });
    } catch (error) {
      console.error("[Offline Invoice] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/broadcast-notification", async (req, res) => {
    try {
      const { subject, message } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }
      const allUsers = await db.select().from(users);
      if (allUsers.length === 0) {
        return res.json({ success: true, message: "No customers to notify", sent: 0 });
      }
      const emailSubject = subject || "Important Update - AL BURHAN TOURS & TRAVELS";
      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#047857;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
            <h2 style="margin:0">AL BURHAN TOURS & TRAVELS</h2>
          </div>
          <div style="background:#f0fdf4;padding:24px;border:1px solid #d1fae5">
            <p>${message.replace(/\n/g, "<br>")}</p>
            <p style="margin-top:20px;color:#6b7280;font-size:13px">JazakAllah Khair<br>AL BURHAN TOURS & TRAVELS Team</p>
          </div>
        </div>`;
      let sentCount = 0;
      const results = [];
      for (const u of allUsers) {
        const smsResult = await sendSmsFast2SMS(u.phone, message);
        const waBroadcast = await sendWhatsAppBotBee(u.phone, message);
        let whatsappResult = waBroadcast.sent;
        if (!waBroadcast.sent && waBroadcast.blocked) {
          whatsappResult = await sendWhatsAppBookingTemplate(u.phone, u.name);
        }
        const emailResult = await sendEmail(u.email, emailSubject, emailHtml);
        const anySent = smsResult || whatsappResult || emailResult;
        if (anySent) sentCount++;
        await db.insert(notifications).values({
          userId: u.id,
          type: "broadcast",
          channel: "all",
          message,
          status: anySent ? "sent" : "pending"
        });
        results.push({ userId: u.id, name: u.name, sms: smsResult, whatsapp: whatsappResult, email: emailResult });
        console.log(`[Broadcast] User #${u.id} (${u.name}) - SMS:${smsResult} WhatsApp:${whatsappResult} Email:${emailResult}`);
      }
      res.json({ success: true, total: allUsers.length, sent: sentCount, results });
    } catch (error) {
      console.error("[Broadcast] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/notifications/user/:userId", async (req, res) => {
    try {
      const userNotifications = await db.select().from(notifications).where(eq(notifications.userId, parseInt(req.params.userId))).orderBy(desc(notifications.sentAt));
      res.json({ success: true, notifications: userNotifications });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/admin", (req, res) => {
    const templatePath = __require("path").resolve(process.cwd(), "server", "templates", "admin-dashboard.html");
    const fs2 = __require("fs");
    if (fs2.existsSync(templatePath)) {
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  });
  const serveTemplate = (templateName) => (req, res) => {
    const fs2 = __require("fs");
    const templatePath = __require("path").resolve(process.cwd(), "server", "templates", templateName);
    if (fs2.existsSync(templatePath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Page not found");
    }
  };
  app2.get("/privacy-policy", serveTemplate("privacy-policy.html"));
  app2.get("/terms-and-conditions", serveTemplate("terms-and-conditions.html"));
  app2.get("/refund-policy", serveTemplate("refund-policy.html"));
  app2.get("/delete-account", serveTemplate("delete-account.html"));
  app2.delete("/api/user/delete-account", async (req, res) => {
    try {
      const { phone, userId } = req.body;
      let userToDelete = null;
      if (userId) {
        const [found] = await db.select().from(users).where(eq(users.id, userId));
        userToDelete = found;
      } else if (phone) {
        const cleanPhone = phone.replace(/\D/g, "").replace(/^91/, "");
        const [found] = await db.select().from(users).where(eq(users.phone, cleanPhone));
        userToDelete = found;
      }
      if (!userToDelete) {
        return res.status(404).json({ success: false, error: "No account found with this phone number." });
      }
      const userBookings = await db.select().from(bookings).where(eq(bookings.userId, userToDelete.id));
      for (const booking of userBookings) {
        await db.delete(payments).where(eq(payments.bookingId, booking.id));
        await db.delete(documents).where(eq(documents.bookingId, booking.id));
      }
      await db.delete(notifications).where(eq(notifications.userId, userToDelete.id));
      await db.delete(bookings).where(eq(bookings.userId, userToDelete.id));
      await db.delete(users).where(eq(users.id, userToDelete.id));
      console.log(`[Account Deletion] User ${userToDelete.id} (${userToDelete.phone}) deleted`);
      res.json({ success: true, message: "Account and all associated data have been permanently deleted." });
    } catch (error) {
      console.error("[Account Deletion] Error:", error);
      res.status(500).json({ success: false, error: "Failed to delete account. Please try again." });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/replit_integrations/chat/routes.ts
import OpenAI from "openai";

// server/replit_integrations/chat/storage.ts
import { eq as eq2, desc as desc2 } from "drizzle-orm";
var chatStorage = {
  async getConversation(id) {
    const [conversation] = await db.select().from(conversations).where(eq2(conversations.id, id));
    return conversation;
  },
  async getAllConversations() {
    return db.select().from(conversations).orderBy(desc2(conversations.createdAt));
  },
  async createConversation(title) {
    const [conversation] = await db.insert(conversations).values({ title }).returning();
    return conversation;
  },
  async deleteConversation(id) {
    await db.delete(messages).where(eq2(messages.conversationId, id));
    await db.delete(conversations).where(eq2(conversations.id, id));
  },
  async getMessagesByConversation(conversationId) {
    return db.select().from(messages).where(eq2(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },
  async createMessage(conversationId, role, content) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  }
};

// server/replit_integrations/chat/routes.ts
var openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});
function registerChatRoutes(app2) {
  app2.get("/api/conversations", async (req, res) => {
    try {
      const conversations2 = await chatStorage.getAllConversations();
      res.json(conversations2);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });
  app2.get("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages2 = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages: messages2 });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });
  app2.post("/api/conversations", async (req, res) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });
  app2.delete("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });
  app2.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;
      await chatStorage.createMessage(conversationId, "user", content);
      const messages2 = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages2.map((m) => ({
        role: m.role,
        content: m.content
      }));
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const systemPrompt = {
        role: "system",
        content: `You are a helpful travel assistant for AL BURHAN Tours & Travels, specializing in Hajj and Umrah pilgrimage packages. You help customers with:
- Information about available Hajj and Umrah packages
- Booking guidance and requirements
- Visa and passport requirements for Saudi Arabia
- Packing tips and travel preparation
- Religious guidance for Hajj and Umrah rituals
- Hotel and accommodation questions
- Flight and transport information
- Payment and pricing inquiries

Be warm, respectful, and knowledgeable. Use Islamic greetings when appropriate. Keep responses concise and helpful. If you don't know something specific about AL BURHAN's packages, provide general guidance and suggest the customer check available packages in the app or contact support.`
      };
      const stream = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [systemPrompt, ...chatMessages],
        stream: true,
        max_completion_tokens: 8192
      });
      let fullResponse = "";
      for await (const chunk of stream) {
        const content2 = chunk.choices[0]?.delta?.content || "";
        if (content2) {
          fullResponse += content2;
          res.write(`data: ${JSON.stringify({ content: content2 })}

`);
        }
      }
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);
      res.write(`data: ${JSON.stringify({ done: true })}

`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}

`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use((req, _res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path.startsWith("/node_modules/") || req.path.endsWith(".bundle") || req.path.endsWith(".map") || req.path.startsWith("/.expo/") || req.path.startsWith("/assets/") || req.query.platform) {
      return next();
    }
    next();
  });
  app2.use("/api", (req, res, next) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return next();
    }
    express.json({
      verify: (req2, _res, buf) => {
        req2.rawBody = buf;
      }
    })(req, res, next);
  });
  app2.use("/api", (req, res, next) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return next();
    }
    express.urlencoded({ extended: false })(req, res, next);
  });
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  const devDomain = process.env.REPLIT_DEV_DOMAIN || "";
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const metroProxy = createProxyMiddleware({
      target: "http://localhost:8081",
      changeOrigin: true,
      ws: true,
      logger: void 0,
      on: {
        proxyRes: (proxyRes, req) => {
          const isManifest = (req.url === "/" || req.url === "/manifest") && req.headers["expo-platform"];
          if (isManifest && devDomain) {
            const originalWrite = proxyRes.pipe;
            let body = "";
            proxyRes.headers["transfer-encoding"] = "";
            const originalPipe = proxyRes.pipe;
            const chunks = [];
            proxyRes.on("data", (chunk) => {
              chunks.push(chunk);
            });
          }
        }
      }
    });
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      if (req.path === "/admin" || req.path.startsWith("/invoice/")) {
        return next();
      }
      const platform = req.header("expo-platform");
      if (req.path === "/" && !platform) {
        return serveLandingPage({
          req,
          res,
          landingPageTemplate,
          appName
        });
      }
      if ((req.path === "/" || req.path === "/manifest") && platform) {
        const metroUrl = `http://localhost:8081${req.path}`;
        const headers = {};
        const headersToForward = [
          "expo-platform",
          "expo-dev-client-id",
          "expo-runtime-version",
          "expo-expect-signature",
          "expo-protocol-version",
          "expo-sfv-version",
          "accept",
          "user-agent"
        ];
        for (const h of headersToForward) {
          const val = req.header(h);
          if (val) headers[h] = val;
        }
        fetch(metroUrl, { headers }).then(async (metroRes) => {
          metroRes.headers.forEach((value, key) => {
            if (key.toLowerCase() !== "transfer-encoding" && key.toLowerCase() !== "content-length") {
              res.setHeader(key, value);
            }
          });
          let body = await metroRes.text();
          if (devDomain) {
            try {
              const manifest = JSON.parse(body);
              const hostWithPort = `${devDomain}:443`;
              if (manifest.extra?.expoClient) {
                manifest.extra.expoClient.hostUri = hostWithPort;
              }
              if (manifest.extra?.expoGo) {
                manifest.extra.expoGo.debuggerHost = hostWithPort;
              }
              body = JSON.stringify(manifest);
              log(`Manifest rewritten: hostUri=${hostWithPort}`);
            } catch {
              log("Could not parse manifest for URL rewriting");
            }
          }
          res.status(metroRes.status).send(body);
        }).catch((err) => {
          log(`Metro manifest proxy error: ${err}`);
          res.status(502).json({ error: "Could not connect to Metro bundler" });
        });
        return;
      }
      const shouldProxy = req.path.startsWith("/node_modules/") || req.path.startsWith("/.expo/") || req.path.startsWith("/logs") || req.path.startsWith("/inspector") || req.path.startsWith("/symbolicate") || req.path.startsWith("/reload") || req.path.startsWith("/status") || req.path.startsWith("/hot") || req.path.startsWith("/message") || req.path.startsWith("/debugger-proxy") || req.path.endsWith(".bundle") || req.path.endsWith(".map") || req.query.platform;
      if (shouldProxy) {
        return metroProxy(req, res, next);
      }
      next();
    });
    app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
    app2.use(express.static(path.resolve(process.cwd(), "static-build")));
    return metroProxy;
  } else {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      const platform = req.header("expo-platform");
      if ((req.path === "/" || req.path === "/manifest") && platform && (platform === "ios" || platform === "android")) {
        const manifestPath = path.resolve(process.cwd(), "static-build", platform, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
          return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
        }
        res.setHeader("expo-protocol-version", "1");
        res.setHeader("expo-sfv-version", "0");
        res.setHeader("content-type", "application/json");
        const manifest = fs.readFileSync(manifestPath, "utf-8");
        return res.send(manifest);
      }
      if (req.path === "/") {
        return serveLandingPage({ req, res, landingPageTemplate, appName });
      }
      next();
    });
    app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
    app2.use(express.static(path.resolve(process.cwd(), "static-build")));
    return null;
  }
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  const metroProxy = configureExpoAndLanding(app);
  registerChatRoutes(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
  if (metroProxy) {
    server.on("upgrade", (req, socket, head) => {
      if (!req.url?.startsWith("/api")) {
        metroProxy.upgrade(req, socket, head);
      }
    });
    log("WebSocket proxy to Metro enabled");
  }
})();
