var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/services/firebase.ts
var firebase_exports = {};
__export(firebase_exports, {
  getExpoPushTokenFromFirestore: () => getExpoPushTokenFromFirestore,
  initFirebaseEager: () => initFirebaseEager,
  isFcmEnabled: () => isFcmEnabled,
  sendFcmMulticast: () => sendFcmMulticast,
  sendFcmToToken: () => sendFcmToToken
});
import * as adminNs from "firebase-admin";
import pRetry, { AbortError } from "p-retry";
function isTransient(code) {
  return TRANSIENT_FCM_CODES.has(code);
}
function getApp() {
  if (initialized) {
    try {
      return admin.app();
    } catch {
      initialized = false;
    }
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
    console.log("[FCM] Firebase Admin SDK initialized");
    return admin.app();
  } catch (err) {
    console.error("[FCM] Failed to initialize Firebase Admin:", err.message);
    return null;
  }
}
function isFcmEnabled() {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}
function initFirebaseEager() {
  getApp();
}
async function getExpoPushTokenFromFirestore(userId) {
  const app2 = getApp();
  if (!app2) return null;
  try {
    const doc = await admin.firestore().collection("users").doc(String(userId)).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return data?.expoPushToken || null;
  } catch (err) {
    console.warn(`[Firestore] getExpoPushTokenFromFirestore(${userId}) error:`, err?.message ?? err);
    return null;
  }
}
function buildAndroidConfig(imageUrl) {
  return {
    priority: "high",
    notification: {
      channelId: FCM_CHANNEL_ID,
      sound: "default",
      priority: "max",
      visibility: "public",
      ...imageUrl ? { imageUrl } : {}
    }
  };
}
function buildApnsConfig(title, body, imageUrl) {
  return {
    headers: { "apns-priority": "10" },
    payload: {
      aps: {
        alert: { title, body },
        sound: "default",
        badge: 1,
        ...imageUrl ? { mutableContent: true } : {}
      }
    }
  };
}
async function sendFcmToToken(token, title, body, data, imageUrl) {
  const app2 = getApp();
  if (!app2) return { success: false, staleTokens: [], retryCount: 0 };
  const tokenPrefix = token.slice(0, 20);
  let retryCount = 0;
  let lastErrorCode;
  let activeImageUrl = imageUrl;
  try {
    await pRetry(
      async (attemptNumber) => {
        if (attemptNumber > 1) {
          console.log(`[FCM] token=${tokenPrefix}... retry attempt ${attemptNumber}${activeImageUrl ? "" : " (no image)"}`);
        }
        try {
          const messageId = await admin.messaging().send({
            token,
            notification: { title, body, ...activeImageUrl ? { image: activeImageUrl } : {} },
            data: data || {},
            android: buildAndroidConfig(activeImageUrl),
            apns: buildApnsConfig(title, body, activeImageUrl)
          });
          console.log(`[FCM] token=${tokenPrefix}... OK messageId=${messageId}`);
        } catch (err) {
          const fcmErr = err;
          const code = fcmErr.code ?? "?";
          lastErrorCode = code;
          retryCount = attemptNumber - 1;
          const isStale = STALE_TOKEN_CODES.has(code);
          if (activeImageUrl && IMAGE_FALLBACK_CODES.has(code)) {
            console.warn(`[FCM] token=${tokenPrefix}... image rejected (${code}), retrying without image`);
            activeImageUrl = void 0;
            throw err;
          }
          console.error(
            `[FCM] token=${tokenPrefix}... FAILED attempt=${attemptNumber} code=${code} message=${fcmErr.message}` + (isStale ? " \u2192 STALE" : isTransient(code) ? " \u2192 will retry" : "")
          );
          if (isStale || !isTransient(code)) {
            throw new AbortError(fcmErr.message ?? code);
          }
          throw err;
        }
      },
      { retries: MAX_RETRIES - 1, minTimeout: RETRY_BASE_MS, factor: 2 }
    );
    return { success: true, staleTokens: [], retryCount };
  } catch {
    const isStale = lastErrorCode ? STALE_TOKEN_CODES.has(lastErrorCode) : false;
    return { success: false, staleTokens: isStale ? [token] : [], retryCount, errorCode: lastErrorCode };
  }
}
async function sendFcmMulticast(tokens, title, body, data, imageUrl) {
  const app2 = getApp();
  if (!app2 || tokens.length === 0) {
    return { success: 0, failure: 0, tokenResults: [], staleTokens: [], totalRetries: 0, errorCodes: [], perTokenErrorCodes: [] };
  }
  const staleTokens = [];
  const errorCodes = [];
  let results = tokens.map(() => false);
  const perTokenErrorCode = tokens.map(() => null);
  let totalRetries = 0;
  let activeImageUrl = imageUrl;
  try {
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body, ...activeImageUrl ? { image: activeImageUrl } : {} },
      data: data || {},
      android: buildAndroidConfig(activeImageUrl),
      apns: buildApnsConfig(title, body, activeImageUrl)
    });
    results = result.responses.map((r, idx) => {
      const prefix = tokens[idx].slice(0, 20);
      if (r.success) {
        console.log(`[FCM] token=${prefix}... OK messageId=${r.messageId}`);
        return true;
      } else {
        const code = r.error?.code ?? "?";
        const isStale = STALE_TOKEN_CODES.has(code);
        console.error(
          `[FCM] token=${prefix}... FAILED code=${code} message=${r.error?.message ?? "unknown"}` + (isStale ? " \u2192 STALE" : "")
        );
        perTokenErrorCode[idx] = code;
        if (isStale) staleTokens.push(tokens[idx]);
        else errorCodes.push(code);
        return false;
      }
    });
    console.log(
      `[FCM] Multicast: ${result.successCount}/${tokens.length} delivered, ${result.failureCount} failed` + (staleTokens.length > 0 ? `, ${staleTokens.length} stale token(s) will be deleted` : "")
    );
  } catch (initialErr) {
    const e0 = initialErr;
    const initCode = e0.code ?? "messaging/network-error";
    console.error(`[FCM] sendFcmMulticast initial error: code=${initCode} message=${e0.message}`);
    if (activeImageUrl && IMAGE_FALLBACK_CODES.has(initCode)) {
      console.warn(`[FCM] Multicast image rejected (${initCode}), retrying without image`);
      activeImageUrl = void 0;
    }
    if (isTransient(initCode) || imageUrl && activeImageUrl === void 0 && IMAGE_FALLBACK_CODES.has(initCode)) {
      try {
        await pRetry(
          async (attemptNumber) => {
            totalRetries = attemptNumber;
            try {
              const retryResult = await admin.messaging().sendEachForMulticast({
                tokens,
                notification: { title, body, ...activeImageUrl ? { image: activeImageUrl } : {} },
                data: data || {},
                android: buildAndroidConfig(activeImageUrl),
                apns: buildApnsConfig(title, body, activeImageUrl)
              });
              retryResult.responses.forEach((r, idx) => {
                results[idx] = r.success;
                if (!r.success && r.error) {
                  const c = r.error.code ?? "?";
                  perTokenErrorCode[idx] = c;
                  if (STALE_TOKEN_CODES.has(c) && !staleTokens.includes(tokens[idx])) staleTokens.push(tokens[idx]);
                }
              });
              console.log(`[FCM] Multicast retry ${attemptNumber} succeeded: ${retryResult.responses.filter((r) => r.success).length}/${tokens.length}`);
            } catch (retryErr) {
              const re = retryErr;
              const retryCode = re.code ?? "messaging/network-error";
              console.error(`[FCM] Multicast retry ${attemptNumber} failed: code=${retryCode}`);
              if (!isTransient(retryCode)) {
                throw new AbortError(re.message ?? retryCode);
              }
              throw retryErr;
            }
          },
          { retries: MAX_RETRIES - 1, minTimeout: RETRY_BASE_MS, factor: 2 }
        );
      } catch {
      }
    }
  }
  if (activeImageUrl) {
    const imageFailIndices = results.map((ok, idx) => {
      if (ok) return -1;
      const errCode = perTokenErrorCode[idx];
      if (!errCode || !IMAGE_FALLBACK_CODES.has(errCode)) return -1;
      return idx;
    }).filter((idx) => idx !== -1);
    if (imageFailIndices.length > 0) {
      console.warn(`[FCM] ${imageFailIndices.length} token(s) had per-response image rejection, retrying without image`);
      for (const idx of imageFailIndices) {
        const token = tokens[idx];
        const tokenPrefix = token.slice(0, 20);
        try {
          const msgId = await admin.messaging().send({
            token,
            notification: { title, body },
            data: data || {},
            android: buildAndroidConfig(void 0),
            apns: buildApnsConfig(title, body, void 0)
          });
          results[idx] = true;
          perTokenErrorCode[idx] = null;
          console.log(`[FCM] token=${tokenPrefix}... image-fallback OK messageId=${msgId}`);
        } catch (fallbackErr) {
          const e = fallbackErr;
          const code = e.code ?? "?";
          perTokenErrorCode[idx] = code;
          console.error(`[FCM] token=${tokenPrefix}... image-fallback FAILED code=${code}`);
          if (STALE_TOKEN_CODES.has(code) && !staleTokens.includes(token)) staleTokens.push(token);
          else if (!staleTokens.includes(token)) errorCodes.push(code);
        }
      }
    }
  }
  const transientIndices = results.map((ok, idx) => {
    if (ok) return -1;
    const errCode = perTokenErrorCode[idx];
    if (!errCode || !isTransient(errCode)) return -1;
    if (staleTokens.includes(tokens[idx])) return -1;
    return idx;
  }).filter((idx) => idx !== -1);
  for (const idx of transientIndices) {
    const token = tokens[idx];
    const tokenPrefix = token.slice(0, 20);
    let retriesForToken = 0;
    let tokenImageUrl = activeImageUrl;
    try {
      await pRetry(
        async (attemptNumber) => {
          retriesForToken = attemptNumber - 1;
          try {
            const msgId = await admin.messaging().send({
              token,
              notification: { title, body, ...tokenImageUrl ? { image: tokenImageUrl } : {} },
              data: data || {},
              android: buildAndroidConfig(tokenImageUrl),
              apns: buildApnsConfig(title, body, tokenImageUrl)
            });
            results[idx] = true;
            perTokenErrorCode[idx] = null;
            console.log(`[FCM] token=${tokenPrefix}... retry ${attemptNumber} OK messageId=${msgId}`);
          } catch (retryErr) {
            const e = retryErr;
            const retryCode = e.code ?? "?";
            if (tokenImageUrl && IMAGE_FALLBACK_CODES.has(retryCode)) {
              console.warn(`[FCM] token=${tokenPrefix}... image rejected on retry, retrying without image`);
              tokenImageUrl = void 0;
              perTokenErrorCode[idx] = retryCode;
              throw retryErr;
            }
            perTokenErrorCode[idx] = retryCode;
            if (STALE_TOKEN_CODES.has(retryCode) && !staleTokens.includes(token)) {
              staleTokens.push(token);
            }
            if (!isTransient(retryCode)) {
              console.error(`[FCM] token=${tokenPrefix}... retry ${attemptNumber} non-retryable code=${retryCode}`);
              throw new AbortError(e.message ?? retryCode);
            }
            console.warn(`[FCM] token=${tokenPrefix}... retry ${attemptNumber} failed code=${retryCode}`);
            throw retryErr;
          }
        },
        { retries: MAX_RETRIES - 1, minTimeout: RETRY_BASE_MS, factor: 2 }
      );
    } catch {
    }
    totalRetries += retriesForToken;
  }
  const totalSuccess = results.filter(Boolean).length;
  const totalFailure = results.length - totalSuccess;
  return {
    success: totalSuccess,
    failure: totalFailure,
    tokenResults: results,
    staleTokens,
    totalRetries,
    errorCodes,
    perTokenErrorCodes: perTokenErrorCode
  };
}
var admin, FCM_CHANNEL_ID, STALE_TOKEN_CODES, TRANSIENT_FCM_CODES, IMAGE_FALLBACK_CODES, MAX_RETRIES, RETRY_BASE_MS, initialized;
var init_firebase = __esm({
  "server/services/firebase.ts"() {
    "use strict";
    admin = adminNs.default ?? adminNs;
    FCM_CHANNEL_ID = "alburhan-push";
    STALE_TOKEN_CODES = /* @__PURE__ */ new Set([
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/authentication-error",
      "messaging/unauthorized-registration"
    ]);
    TRANSIENT_FCM_CODES = /* @__PURE__ */ new Set([
      "messaging/internal-error",
      "messaging/quota-exceeded",
      "messaging/unavailable",
      "messaging/server-unavailable",
      "messaging/network-error"
    ]);
    IMAGE_FALLBACK_CODES = /* @__PURE__ */ new Set([
      "messaging/invalid-argument"
    ]);
    MAX_RETRIES = 3;
    RETRY_BASE_MS = 1e3;
    initialized = false;
  }
});

// server/index.ts
import express from "express";
import session from "express-session";

// server/routes.ts
import { createServer } from "node:http";
import { createHmac as createHmac2 } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  bookings: () => bookings,
  conversations: () => conversations,
  customerProfiles: () => customerProfiles,
  deviceTokens: () => deviceTokens,
  documents: () => documents,
  groupMembers: () => groupMembers,
  groups: () => groups,
  insertBookingSchema: () => insertBookingSchema,
  insertConversationSchema: () => insertConversationSchema,
  insertMessageSchema: () => insertMessageSchema,
  insertPackageSchema: () => insertPackageSchema,
  insertUserSchema: () => insertUserSchema,
  messages: () => messages,
  notifications: () => notifications,
  packages: () => packages,
  payments: () => payments,
  pushDeliveryLogs: () => pushDeliveryLogs,
  selectBookingSchema: () => selectBookingSchema,
  selectPackageSchema: () => selectPackageSchema,
  selectUserSchema: () => selectUserSchema,
  users: () => users
});
import { pgTable as pgTable2, text as text2, varchar, serial as serial2, integer as integer2, boolean, timestamp as timestamp2, decimal, json, uniqueIndex } from "drizzle-orm/pg-core";
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
  imageUrls: json("image_urls").$type(),
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
  title: text2("title"),
  type: text2("type").notNull(),
  channel: text2("channel").notNull(),
  message: text2("message").notNull(),
  status: text2("status").notNull(),
  sentAt: timestamp2("sent_at").defaultNow().notNull(),
  metadata: json("metadata"),
  retryCount: integer2("retry_count").default(0),
  errorMessage: text2("error_message")
});
var documents = pgTable2("documents", {
  id: serial2("id").primaryKey(),
  userId: integer2("user_id").references(() => users.id).notNull(),
  bookingId: integer2("booking_id").references(() => bookings.id),
  type: text2("type").notNull(),
  fileName: text2("file_name").notNull(),
  fileUrl: text2("file_url").notNull(),
  uploadedAt: timestamp2("uploaded_at").defaultNow().notNull(),
  status: text2("status").notNull().default("pending"),
  adminComment: text2("admin_comment")
});
var customerProfiles = pgTable2("customer_profiles", {
  id: serial2("id").primaryKey(),
  userId: integer2("user_id").references(() => users.id).notNull().unique(),
  aadharNumber: text2("aadhar_number"),
  panNumber: text2("pan_number"),
  bloodGroup: text2("blood_group"),
  photo: text2("photo"),
  whatsappNumber: text2("whatsapp_number"),
  updatedAt: timestamp2("updated_at").defaultNow().notNull()
});
var deviceTokens = pgTable2("device_tokens", {
  id: serial2("id").primaryKey(),
  userId: integer2("user_id").references(() => users.id).notNull(),
  token: text2("token").notNull(),
  platform: text2("platform").notNull(),
  expoPushToken: text2("expo_push_token"),
  isInvalid: boolean("is_invalid").default(false).notNull(),
  invalidReason: text2("invalid_reason"),
  createdAt: timestamp2("created_at").defaultNow().notNull(),
  updatedAt: timestamp2("updated_at").defaultNow().notNull()
}, (table) => ({
  userPlatformIdx: uniqueIndex("device_tokens_user_platform_idx").on(table.userId, table.platform)
}));
var pushDeliveryLogs = pgTable2("push_delivery_logs", {
  id: serial2("id").primaryKey(),
  userId: integer2("user_id").references(() => users.id),
  channel: text2("channel").notNull(),
  status: text2("status").notNull(),
  errorCode: text2("error_code"),
  title: text2("title"),
  tokenPrefix: text2("token_prefix"),
  sentAt: timestamp2("sent_at").defaultNow().notNull()
});
var groups = pgTable2("groups", {
  id: serial2("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text2("description"),
  createdAt: timestamp2("created_at").defaultNow().notNull()
});
var groupMembers = pgTable2("group_members", {
  id: serial2("id").primaryKey(),
  groupId: integer2("group_id").references(() => groups.id).notNull(),
  userId: integer2("user_id").references(() => users.id).notNull(),
  addedAt: timestamp2("added_at").defaultNow().notNull()
});
var insertUserSchema = createInsertSchema2(users);
var selectUserSchema = createSelectSchema(users);
var insertPackageSchema = createInsertSchema2(packages);
var selectPackageSchema = createSelectSchema(packages);
var insertBookingSchema = createInsertSchema2(bookings);
var selectBookingSchema = createSelectSchema(bookings);

// server/db.ts
var { Pool } = pg;
var dbUrl = process.env.APP_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({
  connectionString: dbUrl,
  connectionTimeoutMillis: 3e4,
  idleTimeoutMillis: 6e4,
  max: 10
});
pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});
var db = drizzle(pool, { schema: schema_exports });
function isEndpointDisabledError(err) {
  return err?.message?.includes("endpoint has been disabled") || err?.message?.includes("endpoint is disabled") || err?.message?.includes("The endpoint has been disabled");
}
async function warmupDb(retries = 5, delayMs = 3e3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      console.log("[DB] Database connection established");
      return;
    } catch (err) {
      console.warn(`[DB] Connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i < retries) {
        const wait = isEndpointDisabledError(err) ? delayMs * i : delayMs;
        console.log(`[DB] Retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.warn("[DB] Could not warm up DB at startup \u2014 will retry on first request");
      }
    }
  }
}
async function withDbRetry(operation, retries = 4, delayMs = 2e3) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await operation();
    } catch (err) {
      if (isEndpointDisabledError(err) && i < retries) {
        console.warn(`[DB] Endpoint disabled on attempt ${i}/${retries}, retrying in ${delayMs * i}ms...`);
        await new Promise((r) => setTimeout(r, delayMs * i));
        continue;
      }
      throw err;
    }
  }
  throw new Error("[DB] All retry attempts exhausted");
}

// server/routes.ts
import { eq, desc, sql as sql2, and, inArray, gte, count, lt, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";

// server/auth-token.ts
import { createHmac, timingSafeEqual } from "crypto";
function getDeviceTokenKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update("device-token-auth-v1").digest("hex");
}
function signUserId(userId) {
  return createHmac("sha256", getDeviceTokenKey()).update(String(userId)).digest("hex");
}
function verifyUserToken(userId, token) {
  try {
    const expected = signUserId(userId);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(token, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// server/routes.ts
init_firebase();
import { Client as ObjectStorageClient } from "@replit/object-storage";
import nodemailer from "nodemailer";
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
var uploadVideo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
var storageClient = null;
function getStorageClient() {
  if (storageClient) return storageClient;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;
  storageClient = new ObjectStorageClient({ bucketId });
  return storageClient;
}
async function getExpoTokenByPhone(phone) {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  const sanitized = phone.replace(/\D/g, "");
  if (!sanitized) return null;
  try {
    const resp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/push_tokens/${sanitized}`
    );
    if (!resp.ok) return null;
    const doc = await resp.json();
    const token = doc?.fields?.expoPushToken?.stringValue ?? null;
    if (token) console.log(`[ExpoPush] Firestore REST token found by phone ...${sanitized.slice(-4)}: ...${token.slice(-8)}`);
    return token;
  } catch (err) {
    console.warn(`[ExpoPush] Firestore REST phone lookup error:`, err?.message ?? err);
    return null;
  }
}
var isExpoTokenFormat = (t) => /^ExponentPushToken\[/.test(t);
function filterValidExpoTokens(tokens, source, userId) {
  const valid = [];
  for (const t of tokens) {
    if (isExpoTokenFormat(t)) {
      valid.push(t);
    } else {
      console.warn(`[ExpoPush] Dropping malformed token from ${source} userId=${userId}: "${t.slice(0, 40)}"`);
    }
  }
  return valid;
}
async function getExpoTokensForUser(db2, userId, phone) {
  console.log(`[ExpoPush] Looking up token \u2014 userId=${userId} phone=${phone ?? "n/a"}`);
  const rows = await db2.select({ expoPushToken: deviceTokens.expoPushToken, platform: deviceTokens.platform, updatedAt: deviceTokens.updatedAt }).from(deviceTokens).where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isInvalid, false))).orderBy(desc(deviceTokens.updatedAt));
  const rawDbTokens = rows.map((r) => r.expoPushToken).filter((t) => !!t);
  const dbTokens = filterValidExpoTokens(rawDbTokens, "db", userId);
  if (dbTokens.length > 0) {
    console.log(`[ExpoPush] \u2713 DB token found for userId=${userId}: ${dbTokens.length} token(s) \u2014 ${dbTokens.map((t) => "..." + t.slice(-12)).join(", ")}`);
    return dbTokens;
  }
  console.log(`[ExpoPush] No DB token for userId=${userId} (${rows.length} row(s), none with valid expo_push_token)`);
  if (phone) {
    const sanitizedPhone = phone.replace(/\D/g, "");
    if (sanitizedPhone) {
      const phoneRows = await db2.select({ expoPushToken: deviceTokens.expoPushToken }).from(deviceTokens).innerJoin(users, eq(deviceTokens.userId, users.id)).where(and(eq(users.phone, sanitizedPhone), eq(deviceTokens.isInvalid, false)));
      const rawPhoneTokens = phoneRows.map((r) => r.expoPushToken).filter((t) => !!t);
      const phoneTokens = filterValidExpoTokens(rawPhoneTokens, "db-phone", userId);
      if (phoneTokens.length > 0) {
        console.log(`[ExpoPush] \u2713 DB phone token found for phone=...${sanitizedPhone.slice(-4)}: ${phoneTokens.length} token(s)`);
        return phoneTokens;
      }
    }
  }
  console.log(`[ExpoPush] Falling back to Firestore for userId=${userId}`);
  const fsToken = await getExpoPushTokenFromFirestore(userId);
  if (fsToken) {
    if (!isExpoTokenFormat(fsToken)) {
      console.warn(`[ExpoPush] Dropping malformed Firestore token for userId=${userId}: "${fsToken.slice(0, 40)}"`);
    } else {
      console.log(`[ExpoPush] \u2713 Firestore Admin token found for userId=${userId}: ...${fsToken.slice(-8)}`);
      return [fsToken];
    }
  }
  if (phone) {
    const phoneToken = await getExpoTokenByPhone(phone);
    if (phoneToken) {
      if (!isExpoTokenFormat(phoneToken)) {
        console.warn(`[ExpoPush] Dropping malformed Firestore phone token for userId=${userId}: "${phoneToken.slice(0, 40)}"`);
      } else {
        console.log(`[ExpoPush] \u2713 Firestore phone token found for userId=${userId}`);
        return [phoneToken];
      }
    }
  }
  console.warn(`[ExpoPush] \u2717 No valid Expo push token found for userId=${userId} phone=${phone ?? "n/a"}`);
  return [];
}
var EXPO_TOKEN_FATAL_ERRORS = /* @__PURE__ */ new Set(["DeviceNotRegistered", "InvalidCredentials", "MessageTooBig"]);
var EXPO_RETRYABLE_HTTP = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
async function expoFetchWithRetry(expoPayload, maxAttempts = 3) {
  const delays = [500, 1e3];
  let lastErr = new Error("expo_send_failed");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(expoPayload)
      });
      if (res.ok || !EXPO_RETRYABLE_HTTP.has(res.status)) return res;
      const errText = await res.text().catch(() => "");
      console.warn(`[Push] Expo HTTP ${res.status} attempt ${attempt}/${maxAttempts}: ${errText.slice(0, 120)}`);
      lastErr = new Error(`expo_http_${res.status}`);
    } catch (e) {
      console.warn(`[Push] Expo network error attempt ${attempt}/${maxAttempts}: ${e.message}`);
      lastErr = e;
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delays[attempt - 1] ?? 1e3));
  }
  throw lastErr;
}
var DEDUP_WINDOW_MS = 24 * 60 * 60 * 1e3;
async function isNotifDuplicate(dbHandle, userId, type, message) {
  try {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const rows = await dbHandle.select({ id: notifications.id }).from(notifications).where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        eq(notifications.message, message),
        eq(notifications.status, "sent"),
        gte(notifications.sentAt, since)
      )
    ).limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}
async function markExpoPushTokenInvalid(dbHandle, tokenValue, reason) {
  try {
    await dbHandle.delete(deviceTokens).where(eq(deviceTokens.expoPushToken, tokenValue));
    console.log(`[Push] Expo stale token deleted (${reason}): ${tokenValue.slice(0, 30)}...`);
  } catch (err) {
    const e = err;
    console.error(`[Push] Failed to delete Expo stale token (${reason}): ${e.message}`);
  }
}
async function markFcmTokenInvalid(dbHandle, tokenValue, reason) {
  try {
    await dbHandle.delete(deviceTokens).where(eq(deviceTokens.token, tokenValue));
    console.log(`[Push] FCM stale token deleted (${reason}): ${tokenValue.slice(0, 30)}...`);
  } catch (err) {
    const e = err;
    console.error(`[Push] Failed to delete FCM stale token (${reason}): ${e.message}`);
  }
}
async function logPushDelivery(dbHandle, entries) {
  if (entries.length === 0) return;
  try {
    await dbHandle.insert(pushDeliveryLogs).values(
      entries.map((e) => ({
        userId: e.userId ?? null,
        channel: e.channel,
        status: e.status,
        errorCode: e.errorCode ?? null,
        title: e.title ?? null,
        tokenPrefix: e.tokenPrefix ?? null
      }))
    );
  } catch (err) {
    const e = err;
    console.error(`[PushLog] Failed to insert delivery logs: ${e.message}`);
  }
}
var EXPO_CHUNK_SIZE = 100;
var EXPO_RETRY_ATTEMPTS = 3;
var EXPO_RETRY_BASE_MS = 1e3;
async function sendExpoChunkWithRetry(messages2) {
  let lastErr = new Error("expo_send_failed");
  for (let attempt = 1; attempt <= EXPO_RETRY_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(messages2)
      });
      if (resp.ok) {
        const json2 = await resp.json();
        return Array.isArray(json2.data) ? json2.data : json2.data ? [json2.data] : [];
      }
      const status = resp.status;
      if (status >= 400 && status < 500) {
        throw new Error(`expo_http_${status}`);
      }
      lastErr = new Error(`expo_http_${status}`);
      console.warn(`[Push Broadcast] Expo HTTP ${status} on attempt ${attempt}, will retry`);
    } catch (e) {
      if (e.message?.startsWith("expo_http_4")) throw e;
      lastErr = e;
      console.warn(`[Push Broadcast] Expo network error on attempt ${attempt}: ${e.message}`);
    }
    if (attempt < EXPO_RETRY_ATTEMPTS) {
      await new Promise((res) => setTimeout(res, EXPO_RETRY_BASE_MS * Math.pow(2, attempt - 1)));
    }
  }
  throw lastErr;
}
async function broadcastPush(dbHandle, payload, dedupOptions) {
  const allRows = await dbHandle.select().from(deviceTokens).where(eq(deviceTokens.isInvalid, false));
  let totalRetries = 0;
  const errorCodes = [];
  let eligibleUserIds = null;
  if (dedupOptions) {
    const uniqueUserIds = [...new Set(allRows.map((r) => r.userId).filter((id) => id !== null))];
    const DEDUP_CONCURRENCY = 20;
    const eligible2 = /* @__PURE__ */ new Set();
    for (let i = 0; i < uniqueUserIds.length; i += DEDUP_CONCURRENCY) {
      const batch = uniqueUserIds.slice(i, i + DEDUP_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(
          (uid) => isNotifDuplicate(dbHandle, uid, dedupOptions.type, dedupOptions.message).then((isDup) => ({ uid, isDup }))
        )
      );
      for (const { uid, isDup } of batchResults) {
        if (!isDup) eligible2.add(uid);
      }
    }
    eligibleUserIds = eligible2;
  }
  const eligible = (r) => !eligibleUserIds || r.userId !== null && eligibleUserIds.has(r.userId);
  const expoTokenPairs = allRows.filter((r) => r.expoPushToken !== null && r.userId !== null && eligible(r)).map((r) => ({ token: r.expoPushToken, userId: r.userId }));
  const legacyExpoPairs = allRows.filter((r) => r.token !== null && isExpoTokenFormat(r.token) && r.expoPushToken === null && r.userId !== null && eligible(r)).map((r) => ({ token: r.token, userId: r.userId }));
  const fcmPairs = allRows.filter((r) => r.token !== null && !isExpoTokenFormat(r.token) && r.expoPushToken === null && r.userId !== null && eligible(r)).map((r) => ({ token: r.token, userId: r.userId }));
  const sentUserIds = /* @__PURE__ */ new Set();
  let expoPushDeviceCount = 0;
  let fcmSent = 0;
  let fcmFailed = 0;
  const allExpoPairs = [...expoTokenPairs, ...legacyExpoPairs];
  if (allExpoPairs.length > 0) {
    console.log(`[Push Broadcast] Expo sending to ${allExpoPairs.length} token(s) in chunks of ${EXPO_CHUNK_SIZE}`);
    const allExpoResults = [];
    for (let chunkStart = 0; chunkStart < allExpoPairs.length; chunkStart += EXPO_CHUNK_SIZE) {
      const chunkPairs = allExpoPairs.slice(chunkStart, chunkStart + EXPO_CHUNK_SIZE);
      const messages2 = chunkPairs.map(({ token }) => ({
        to: token,
        sound: "default",
        channelId: "alburhan-push",
        priority: "high",
        title: payload.title,
        body: payload.body,
        data: payload.data || { screen: "/(tabs)/notifications" },
        ...payload.imageUrl ? { imageUrl: payload.imageUrl } : {}
      }));
      try {
        const chunkResults = await sendExpoChunkWithRetry(messages2);
        allExpoResults.push(...chunkResults);
      } catch (e) {
        const failCode = e.message?.startsWith("expo_http_") ? e.message : "network_error";
        console.error(`[Push Broadcast] Expo chunk [${chunkStart}..${chunkStart + chunkPairs.length - 1}] failed: ${failCode}`);
        errorCodes.push(failCode);
        for (const { userId } of chunkPairs) {
          allExpoResults.push({ status: "error", message: failCode, details: { error: failCode } });
          await logPushDelivery(dbHandle, [{ userId, channel: "expo", status: "failed", errorCode: failCode, title: payload.title }]);
        }
        continue;
      }
    }
    const staleExpoMain = [];
    const staleExpoLegacy = [];
    const expoLogEntries = [];
    allExpoPairs.forEach(({ token, userId }, idx) => {
      const result = allExpoResults[idx];
      if (!result || result.status !== "error") {
        expoPushDeviceCount++;
        sentUserIds.add(userId);
        expoLogEntries.push({ userId, token, status: "sent" });
        console.log(`[Push Broadcast] Expo OK userId=${userId} token=${token.slice(0, 30)}...`);
      } else {
        const errCode = result.details?.error || result.message || "unknown";
        expoLogEntries.push({ userId, token, status: "failed", errCode });
        console.error(`[Push Broadcast] Expo FAILED userId=${userId} code=${errCode} token=${token.slice(0, 30)}...`);
        if (errCode === "DeviceNotRegistered") {
          if (idx < expoTokenPairs.length) staleExpoMain.push(token);
          else staleExpoLegacy.push(token);
        }
      }
    });
    console.log(`[Push Broadcast] Expo: ${expoPushDeviceCount}/${allExpoPairs.length} delivered, ${staleExpoMain.length + staleExpoLegacy.length} stale`);
    for (const staleToken of staleExpoMain) await markExpoPushTokenInvalid(dbHandle, staleToken, "DeviceNotRegistered");
    for (const staleToken of staleExpoLegacy) await markFcmTokenInvalid(dbHandle, staleToken, "DeviceNotRegistered");
    const pendingLogEntries = expoLogEntries.filter((e) => {
      if (e.status !== "failed") return true;
      const errCode = e.errCode ?? "";
      return !errCode.startsWith("expo_http_") && errCode !== "network_error";
    });
    await logPushDelivery(dbHandle, pendingLogEntries.map((e) => ({
      userId: e.userId,
      channel: "expo",
      status: e.status,
      errorCode: e.errCode,
      title: payload.title,
      tokenPrefix: e.token.slice(0, 30)
    })));
  }
  const FCM_CHUNK_SIZE = 500;
  if (fcmPairs.length > 0) {
    const fcmData = {};
    if (payload.data) Object.assign(fcmData, payload.data);
    console.log(`[Push Broadcast] FCM multicast to ${fcmPairs.length} raw token(s) in chunks of ${FCM_CHUNK_SIZE}`);
    const fcmTokenResults = new Array(fcmPairs.length).fill(false);
    const fcmPerTokenErrorCodes = new Array(fcmPairs.length).fill(null);
    const fcmStaleTokens = /* @__PURE__ */ new Set();
    for (let chunkStart = 0; chunkStart < fcmPairs.length; chunkStart += FCM_CHUNK_SIZE) {
      const chunkPairs = fcmPairs.slice(chunkStart, chunkStart + FCM_CHUNK_SIZE);
      const chunkTokens = chunkPairs.map((p) => p.token);
      try {
        const result = await sendFcmMulticast(chunkTokens, payload.title, payload.body, fcmData, payload.imageUrl);
        fcmSent += result.success;
        fcmFailed += result.failure;
        totalRetries += result.totalRetries;
        errorCodes.push(...result.errorCodes);
        result.tokenResults.forEach((ok, chunkIdx) => {
          const globalIdx = chunkStart + chunkIdx;
          fcmTokenResults[globalIdx] = ok;
          fcmPerTokenErrorCodes[globalIdx] = result.perTokenErrorCodes[chunkIdx];
          if (ok) sentUserIds.add(fcmPairs[globalIdx].userId);
        });
        for (const staleToken of result.staleTokens) fcmStaleTokens.add(staleToken);
        console.log(`[Push Broadcast] FCM chunk [${chunkStart}..${chunkStart + chunkPairs.length - 1}]: ${result.success}/${chunkTokens.length} delivered`);
      } catch (e) {
        const err = e;
        console.error(`[Push Broadcast] FCM chunk [${chunkStart}..${chunkStart + chunkPairs.length - 1}] error:`, err.message);
        errorCodes.push("network_error");
        for (let ci = 0; ci < chunkPairs.length; ci++) {
          fcmPerTokenErrorCodes[chunkStart + ci] = "network_error";
        }
        await logPushDelivery(dbHandle, chunkPairs.map(({ userId }) => ({
          userId,
          channel: "fcm",
          status: "failed",
          errorCode: "network_error",
          title: payload.title
        })));
      }
    }
    for (const staleToken of fcmStaleTokens) {
      const actualCode = fcmPerTokenErrorCodes[fcmPairs.findIndex((p) => p.token === staleToken)] ?? "messaging/registration-token-not-registered";
      await markFcmTokenInvalid(dbHandle, staleToken, actualCode);
    }
    if (fcmSent + fcmFailed > 0) {
      console.log(`[Push Broadcast] FCM total: ${fcmSent}/${fcmPairs.length} delivered, ${fcmFailed} failed${totalRetries > 0 ? ` (retries: ${totalRetries})` : ""}${fcmStaleTokens.size > 0 ? `, ${fcmStaleTokens.size} stale` : ""}`);
    }
    const fcmLogEntries = fcmPairs.map((pair, idx) => {
      const sent = fcmTokenResults[idx];
      const errCode = fcmPerTokenErrorCodes[idx];
      if (errCode === "network_error") return null;
      return {
        userId: pair.userId,
        channel: "fcm",
        status: sent ? "sent" : "failed",
        errorCode: sent ? void 0 : errCode ?? "unknown",
        title: payload.title,
        tokenPrefix: pair.token.slice(0, 30)
      };
    }).filter((e) => e !== null);
    if (fcmLogEntries.length > 0) await logPushDelivery(dbHandle, fcmLogEntries);
  }
  return { expoPushDeviceCount, fcmSent, fcmFailed, sentUserIds, totalRetries, errorCodes };
}
async function sendPushToUser(db2, userId, payload, phone, opts) {
  let expoSent = 0;
  let fcmSent = 0;
  let fcmFailed = 0;
  let totalRetries = 0;
  const errorCodes = [];
  if (!opts?.skipDedup) {
    const dedupType = payload.data?.type || "unknown";
    const isDup = await isNotifDuplicate(db2, userId, dedupType, payload.body);
    if (isDup) {
      console.log(`[Push] Dedup skip userId=${userId} type=${dedupType} msg="${payload.body.slice(0, 40)}"`);
      return { expoSent: 0, fcmSent: 0, fcmFailed: 0, totalRetries: 0, errorCodes: [], skipped: true, skipReason: "dedup" };
    }
  }
  const expoTokens = await getExpoTokensForUser(db2, userId, phone);
  if (expoTokens.length > 0) {
    try {
      const expoPayload = expoTokens.map((to) => ({
        to,
        sound: "default",
        channelId: "alburhan-push",
        priority: "high",
        title: payload.title,
        body: payload.body,
        ...payload.data ? { data: payload.data } : {},
        ...payload.imageUrl ? { imageUrl: payload.imageUrl } : {}
      }));
      console.log(`[Push] Expo sending to ${expoTokens.length} token(s) userId=${userId}`);
      const expoRes = await expoFetchWithRetry(expoPayload);
      if (!expoRes.ok) {
        const errText = await expoRes.text().catch(() => "");
        console.error(`[Push] Expo API HTTP ${expoRes.status}:`, errText);
        errorCodes.push(`expo_http_${expoRes.status}`);
      } else {
        const expoJson = await expoRes.json();
        const items = Array.isArray(expoJson.data) ? expoJson.data : expoJson.data ? [expoJson.data] : [];
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          if (!item || item.status !== "error") {
            expoSent++;
            console.log(`[Push] Expo OK userId=${userId} token=${expoTokens[idx]?.slice(0, 30)}...`);
          } else {
            const errCode = item.details?.error || item.message || "unknown";
            errorCodes.push(errCode);
            console.error(`[Push] Expo FAILED userId=${userId} code=${errCode} token=${expoTokens[idx]?.slice(0, 30)}...`);
            if (EXPO_TOKEN_FATAL_ERRORS.has(errCode) && expoTokens[idx]) {
              await markExpoPushTokenInvalid(db2, expoTokens[idx], errCode);
            }
          }
        }
      }
    } catch (e) {
      console.error("[Push] Expo send error:", e.message);
      errorCodes.push("network issue");
    }
  }
  let legacyExpoAttempted = 0;
  try {
    const allRows = await db2.select({ token: deviceTokens.token, expoPushToken: deviceTokens.expoPushToken }).from(deviceTokens).where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isInvalid, false)));
    const legacyExpoTokens = allRows.filter((r) => r.token && isExpoTokenFormat(r.token) && !r.expoPushToken).map((r) => r.token).filter((t) => !expoTokens.includes(t));
    legacyExpoAttempted = legacyExpoTokens.length;
    if (legacyExpoTokens.length > 0) {
      console.log(`[Push] Expo (legacy token-col) sending to ${legacyExpoTokens.length} token(s) userId=${userId}`);
      const legacyPayload = legacyExpoTokens.map((to) => ({
        to,
        sound: "default",
        channelId: "alburhan-push",
        priority: "high",
        title: payload.title,
        body: payload.body,
        ...payload.data ? { data: payload.data } : {},
        ...payload.imageUrl ? { imageUrl: payload.imageUrl } : {}
      }));
      let legacyRes = null;
      try {
        legacyRes = await expoFetchWithRetry(legacyPayload);
      } catch (fetchErr) {
        console.error(`[Push] Expo (legacy) send error: ${fetchErr.message}`);
        errorCodes.push(fetchErr.message ?? "expo_send_failed");
      }
      if (legacyRes?.ok) {
        const legacyJson = await legacyRes.json();
        const items = Array.isArray(legacyJson.data) ? legacyJson.data : legacyJson.data ? [legacyJson.data] : [];
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          if (!item || item.status !== "error") {
            expoSent++;
          } else {
            const errCode = item.details?.error || item.message || "unknown";
            errorCodes.push(errCode);
            console.error(`[Push] Expo (legacy) FAILED userId=${userId} code=${errCode} token=${legacyExpoTokens[idx]?.slice(0, 30)}...`);
            if (EXPO_TOKEN_FATAL_ERRORS.has(errCode) && legacyExpoTokens[idx]) {
              await markFcmTokenInvalid(db2, legacyExpoTokens[idx], errCode);
            }
          }
        }
      } else if (legacyRes !== null) {
        const errText = await legacyRes.text().catch(() => "");
        console.error(`[Push] Expo (legacy) API HTTP ${legacyRes.status}: ${errText.slice(0, 200)}`);
        errorCodes.push(`expo_http_${legacyRes.status}`);
      }
    }
    const rawFcmTokens = allRows.filter((r) => r.token && !isExpoTokenFormat(r.token) && !r.expoPushToken).map((r) => r.token);
    if (rawFcmTokens.length > 0) {
      console.log(`[Push] FCM direct sending to ${rawFcmTokens.length} raw token(s) userId=${userId}`);
      const fcmData = {};
      if (payload.data) Object.assign(fcmData, payload.data);
      const result = await sendFcmMulticast(rawFcmTokens, payload.title, payload.body, fcmData, payload.imageUrl);
      fcmSent = result.success;
      fcmFailed = result.failure;
      totalRetries += result.totalRetries;
      errorCodes.push(...result.errorCodes);
      for (const staleToken of result.staleTokens) {
        await markFcmTokenInvalid(db2, staleToken, result.errorCodes[0] || "messaging/registration-token-not-registered");
      }
    }
    if (expoTokens.length === 0 && legacyExpoTokens.length === 0 && rawFcmTokens.length === 0) {
      console.warn(`[Push] No device token for userId=${userId} phone=${phone ?? "n/a"} \u2014 skipping`);
      return { expoSent: 0, fcmSent: 0, fcmFailed: 0, totalRetries: 0, errorCodes: [], skipped: true, skipReason: "no_token" };
    }
  } catch (e) {
    console.error("[Push] FCM direct send error:", e.message);
  }
  const totalSent = expoSent + fcmSent;
  console.log(
    `[Push] Summary userId=${userId}: expo=${expoSent} fcm=${fcmSent} fcmFailed=${fcmFailed} total=${totalSent} errors=${errorCodes.length > 0 ? errorCodes.join(",") : "none"}` + (payload.imageUrl ? " (with image)" : "")
  );
  const deliveryEntries = [];
  const totalExpoAttempted = expoTokens.length + legacyExpoAttempted;
  if (expoSent > 0) {
    deliveryEntries.push({ userId, channel: "expo", status: "sent", title: payload.title });
  }
  if (expoSent === 0 && totalExpoAttempted > 0) {
    deliveryEntries.push({ userId, channel: "expo", status: "failed", errorCode: errorCodes[0] ?? "unknown", title: payload.title });
  }
  if (fcmSent > 0) {
    deliveryEntries.push({ userId, channel: "fcm", status: "sent", title: payload.title });
  }
  if (fcmFailed > 0) {
    deliveryEntries.push({ userId, channel: "fcm", status: "failed", errorCode: errorCodes.find((c) => c.startsWith("messaging/")) ?? errorCodes[0], title: payload.title });
  }
  await logPushDelivery(db2, deliveryEntries);
  return { expoSent, fcmSent, fcmFailed, totalRetries, errorCodes, skipped: false };
}
var otpStore = /* @__PURE__ */ new Map();
var fallbackOtpAttempts = /* @__PURE__ */ new Map();
var FALLBACK_OTP_MAX_PER_HOUR = 3;
var FALLBACK_OTP_WINDOW_MS = 60 * 60 * 1e3;
function canShowFallbackOtp(phone) {
  const now = Date.now();
  const record = fallbackOtpAttempts.get(phone);
  if (!record || now - record.windowStart > FALLBACK_OTP_WINDOW_MS) {
    fallbackOtpAttempts.set(phone, { count: 1, windowStart: now });
    return true;
  }
  if (record.count >= FALLBACK_OTP_MAX_PER_HOUR) {
    console.warn(`[OTP Fallback] Rate limit exceeded for ${phone} \u2014 ${record.count} attempts in last hour`);
    return false;
  }
  record.count += 1;
  return true;
}
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
async function generateBookingPdf(bookingId, res) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) {
    res.status(404).send("Invoice not found");
    return;
  }
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
  const customerName = booking.contactName || user?.name || "";
  const customerPhone = booking.contactPhone || user?.phone || "";
  const customerEmail = booking.contactEmail || user?.email || "";
  const customerAddress = booking.address || "";
  const serviceName = pkg ? `${pkg.type === "hajj" ? "Hajj" : "Umrah"} - ${pkg.name}` : "Tour Service";
  const roomLabel = booking.roomType || "";
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const filename = `invoice-${invoiceNum}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
  const green = "#047857";
  const pageWidth = doc.page.width - 80;
  doc.fontSize(18).fillColor(green).font("Helvetica-Bold").text("ALBURHAN TOURS & TRAVELS", 40, 40);
  doc.fontSize(9).fillColor("#555").font("Helvetica").text("8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur, Madhya Pradesh, 450331", 40).text("GSTIN: 23AAVFA3225C1ZW  |  Mobile: 9893225590  |  PAN: AAVFA3225C").text("Email: info@alburhantravels.com");
  const metaX = 400;
  doc.fontSize(9).fillColor("#333").font("Helvetica-Bold").text("TAX INVOICE", metaX, 40);
  doc.font("Helvetica").fontSize(9).fillColor("#555").text(`Invoice No: ${invoiceNum}`, metaX).text(`Date: ${bookingDate.toLocaleDateString("en-IN")}`).text(`Due: ${dueDate.toLocaleDateString("en-IN")}`);
  doc.moveTo(40, 130).lineTo(555, 130).strokeColor(green).lineWidth(2).stroke();
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("BILL TO", 40, 140);
  doc.fontSize(10).fillColor("#333").font("Helvetica-Bold").text(customerName, 40, 155);
  doc.fontSize(9).fillColor("#555").font("Helvetica").text(customerAddress || " ", 40).text(`Mobile: ${customerPhone}  |  Email: ${customerEmail}`);
  doc.moveTo(40, 210).lineTo(555, 210).strokeColor("#ddd").lineWidth(1).stroke();
  const tableTop = 220;
  const colWidths = [30, 190, 60, 85, 65, 85];
  const colX = [40, 70, 260, 320, 405, 470];
  const headers = ["#", "Services", "SAC", "Rate", "Tax", "Amount"];
  doc.rect(40, tableTop, pageWidth, 18).fillColor(green).fill();
  doc.fontSize(9).fillColor("#fff").font("Helvetica-Bold");
  headers.forEach((h, i) => {
    doc.text(h, colX[i], tableTop + 4, { width: colWidths[i], align: i >= 3 ? "right" : "left" });
  });
  let rowY = tableTop + 20;
  doc.fillColor("#333").font("Helvetica").fontSize(9);
  for (let i = 0; i < numberOfPeople; i++) {
    const traveler = booking.travelers?.[i];
    const travelerName = traveler?.name ?? `Person ${i + 1}`;
    const ageGender = [
      traveler?.age ? `Age: ${traveler.age}` : "",
      traveler?.gender ? `Gender: ${traveler.gender}` : ""
    ].filter(Boolean).join(", ");
    const dob = traveler?.dateOfBirth ? `DOB: ${traveler.dateOfBirth}` : "";
    const passport = traveler?.passportNumber ? `Passport: ${traveler.passportNumber}` : "";
    const details = [ageGender, dob, passport, roomLabel].filter(Boolean).join(" | ");
    const lineHeight = details ? 30 : 20;
    doc.text(String(i + 1), colX[0], rowY, { width: colWidths[0] });
    doc.font("Helvetica-Bold").text(serviceName, colX[1], rowY, { width: colWidths[1] });
    doc.font("Helvetica").fontSize(8).fillColor("#444").text(travelerName, colX[1], rowY + 11, { width: colWidths[1] });
    if (details) {
      doc.fillColor("#777").text(details, colX[1], rowY + 20, { width: colWidths[1] });
    }
    doc.fillColor("#333").fontSize(9);
    doc.font("Helvetica").text("998555", colX[2], rowY, { width: colWidths[2] });
    doc.text(`Rs ${formatINR(ratePerPerson)}`, colX[3], rowY, { width: colWidths[3], align: "right" });
    doc.text(`Rs ${formatINR(gstAmount / numberOfPeople)}`, colX[4], rowY, { width: colWidths[4], align: "right" });
    doc.text(`Rs ${formatINR(ratePerPerson + gstAmount / numberOfPeople)}`, colX[5], rowY, { width: colWidths[5], align: "right" });
    rowY += lineHeight;
    doc.moveTo(40, rowY).lineTo(555, rowY).strokeColor("#eee").lineWidth(0.5).stroke();
  }
  doc.fontSize(9).fillColor("#555").font("Helvetica").text("TCS @5.0%", colX[4], rowY + 4, { width: colWidths[4], align: "right" });
  doc.fillColor("#333").text(`Rs ${formatINR(tcsAmount)}`, colX[5], rowY + 4, { width: colWidths[5], align: "right" });
  rowY += 22;
  doc.moveTo(40, rowY).lineTo(555, rowY).strokeColor("#ddd").lineWidth(1).stroke();
  const totalsY = rowY + 10;
  const totals = [
    ["TOTAL", `Rs ${formatINR(gstAmount + tcsAmount)}`, `Rs ${formatINR(grandTotal)}`],
    ["RECEIVED AMOUNT", "", `Rs ${formatINR(totalPaid)}`],
    ["PREVIOUS BALANCE", "", `Rs 0.00`],
    ["CURRENT BALANCE", "", `Rs ${formatINR(grandTotal - totalPaid)}`]
  ];
  let tRowY = totalsY;
  totals.forEach(([label, tax, amount], idx) => {
    if (idx === 3) {
      doc.rect(40, tRowY - 2, pageWidth, 18).fillColor("#fef3c7").fill();
    }
    doc.fontSize(9).fillColor(idx === 3 ? "#92400e" : "#333").font(idx === 3 ? "Helvetica-Bold" : "Helvetica").text(label, 40, tRowY, { width: 300, align: "right" });
    if (tax) doc.text(tax, colX[5] - 90, tRowY, { width: 90, align: "right" });
    doc.text(amount, colX[5], tRowY, { width: colWidths[5], align: "right" });
    tRowY += 18;
  });
  tRowY += 8;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 10;
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("GST Breakdown", 40, tRowY);
  tRowY += 16;
  const gstHeaders = ["HSN/SAC", "Taxable Value", "CGST Rate", "CGST Amount", "SGST Rate", "SGST Amount", "Total Tax"];
  const gstColW = [55, 85, 65, 80, 65, 80, 65];
  const gstColX = [40];
  for (let i = 1; i < gstColW.length; i++) gstColX.push(gstColX[i - 1] + gstColW[i - 1]);
  doc.rect(40, tRowY, pageWidth, 16).fillColor("#e6f7ef").fill();
  doc.fontSize(8).fillColor("#333").font("Helvetica-Bold");
  gstHeaders.forEach((h, i) => doc.text(h, gstColX[i], tRowY + 3, { width: gstColW[i], align: "center" }));
  tRowY += 18;
  doc.font("Helvetica").fillColor("#333");
  const gstRow = ["998555", `Rs ${formatINR(baseAmount)}`, "2.5%", `Rs ${formatINR(cgst)}`, "2.5%", `Rs ${formatINR(sgst)}`, `Rs ${formatINR(gstAmount)}`];
  gstRow.forEach((v, i) => doc.text(v, gstColX[i], tRowY, { width: gstColW[i], align: "center" }));
  tRowY += 20;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 8;
  doc.fontSize(9).fillColor("#333").font("Helvetica-Bold").text("Total Amount (in words): ", 40, tRowY, { continued: true });
  doc.font("Helvetica").text(numberToWords(grandTotal));
  tRowY += 30;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 10;
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("Bank Details", 40, tRowY);
  const bankRows = [
    ["Name", "HDFC BANK LTD"],
    ["IFSC Code", "HDFC0001749"],
    ["Account No.", "50200011397336"],
    ["Bank", "HDFC Bank, BURHANPUR"]
  ];
  tRowY += 16;
  doc.fontSize(9);
  bankRows.forEach(([k, v]) => {
    doc.fillColor("#555").font("Helvetica-Bold").text(k, 40, tRowY, { width: 80 });
    doc.fillColor("#333").font("Helvetica").text(v, 125, tRowY);
    tRowY += 14;
  });
  tRowY += 20;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 10;
  doc.fontSize(9).fillColor("#555").font("Helvetica").text("Authorised Signatory For", 380, tRowY + 30, { align: "center", width: 175 });
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("ALBURHAN TOURS & TRAVELS", 380, tRowY + 44, { align: "center", width: 175 });
  tRowY += 70;
  if (tRowY < doc.page.height - 60) {
    doc.rect(40, tRowY, pageWidth, 28).fillColor(green).fill();
    doc.fontSize(9).fillColor("#fff").font("Helvetica").text("AL BURHAN TOURS & TRAVELS | GSTIN: 23AAVFA3225C1ZW | Phone: +91 9893225590 | www.alburhantravels.com", 40, tRowY + 8, { width: pageWidth, align: "center" });
  }
  doc.end();
}
function sanitizeDltVar(text3) {
  return text3.replace(/[–—]/g, "-").replace(/['']/g, "'").replace(/[""]/g, '"').replace(/[^\x00-\x7F]/g, "").trim();
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
    const bookingId = invoiceUrl.split("/i/").pop() || invoiceUrl;
    const safeName = sanitizeDltVar(name);
    const safePackage = sanitizeDltVar(packageName);
    const variables = `${safeName}|${safePackage}|${bookingId}|`;
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=ABURHA&message=211790&variables_values=${encodeURIComponent(variables)}&flash=0&numbers=${phone}`;
    console.log(`[Fast2SMS DLT Booking] Sending to ${phone} | bookingId="${bookingId}" (${bookingId.length} chars)`);
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
async function sendSmsFast2SMS(phone, message) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS] API key not configured, skipping free-text SMS");
    return false;
  }
  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${encodeURIComponent(message)}&flash=0&numbers=${phone}`;
    console.log(`[Fast2SMS Quick] Sending free-text SMS to ${phone}`);
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    console.log("[Fast2SMS Quick] Response:", JSON.stringify(data));
    if (data.return === true) return true;
    console.log("[Fast2SMS Quick] Failed:", data.message);
    return false;
  } catch (error) {
    console.error("[Fast2SMS Quick] Error:", error);
    return false;
  }
}
var WHATSAPP_HEADER_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Kaaba_mirror_edit_jj.jpg/640px-Kaaba_mirror_edit_jj.jpg";
var WHATSAPP_PHONE_NUMBER_ID = "965912196611113";
async function sendWhatsAppTemplate(phone, templateName, languageCode, components) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) {
    console.log("[Meta WhatsApp] Token not configured, skipping template");
    return { success: false, raw: { error: "Token not configured" } };
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
    const httpStatus = response.status;
    const data = await response.json();
    const msgId = data.messages?.[0]?.id;
    const msgStatus = data.messages?.[0]?.message_status;
    console.log(`[Meta WhatsApp Template] ${templateName} to ${to} | http=${httpStatus} | status=${msgStatus || "n/a"} | id=${msgId || "none"} | full=${JSON.stringify(data)}`);
    const success = !!msgId && msgStatus === "accepted";
    return { success, raw: data };
  } catch (error) {
    console.error("[Meta WhatsApp Template] Error:", error);
    return { success: false, raw: { error: error.message } };
  }
}
async function sendWhatsAppTemplateBool(phone, templateName, languageCode, components) {
  const result = await sendWhatsAppTemplate(phone, templateName, languageCode, components);
  return result.success;
}
async function sendWhatsAppOtpTemplate(phone, otpCode) {
  return sendWhatsAppTemplateBool(phone, "alburhan_login_otp", "en_US", [
    { type: "body", parameters: [{ type: "text", text: otpCode }] },
    { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: otpCode }] }
  ]);
}
async function sendWhatsAppBookingTemplate(phone, customerName) {
  return sendWhatsAppTemplateBool(phone, "booking", "en_GB", [
    { type: "header", parameters: [{ type: "image", image: { link: WHATSAPP_HEADER_IMAGE } }] },
    { type: "body", parameters: [{ type: "text", text: customerName }] }
  ]);
}
async function sendWhatsAppConfirmationTemplate(phone, customerName, packageName, amountPaid, invoiceUrl) {
  const bodyParams = [
    { type: "text", text: customerName },
    { type: "text", text: packageName },
    { type: "text", text: amountPaid },
    { type: "text", text: invoiceUrl }
  ];
  console.log(`[WhatsApp conformation template] vars(${bodyParams.length}): [1]="${customerName}" [2]="${packageName}" [3]="${amountPaid}" [4]="${invoiceUrl.substring(0, 60)}"`);
  return sendWhatsAppTemplateBool(phone, "conformation", "en_GB", [
    { type: "body", parameters: bodyParams }
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
function classifyPushError(errorCodes, isNetworkError = false) {
  if (isNetworkError) return "network issue";
  const staleMarkers = ["DeviceNotRegistered", "InvalidCredentials", "messaging/registration-token-not-registered", "messaging/invalid-registration-token", "registration-token-not-registered"];
  const firebaseMarkers = ["messaging/internal-error", "messaging/server-unavailable", "messaging/unavailable", "messaging/quota-exceeded"];
  if (errorCodes.some((c) => staleMarkers.some((s) => c.includes(s)))) return "invalid token";
  if (errorCodes.some((c) => firebaseMarkers.some((f) => c.includes(f)))) return "firebase error";
  if (errorCodes.length > 0) return "firebase error";
  return "push delivery failed";
}
async function resolveUserId(req) {
  if (req.session?.userId) return req.session.userId;
  const headerUserId = req.headers["x-user-id"];
  const headerToken = req.headers["x-user-token"];
  const parsedId = headerUserId !== void 0 ? Number(headerUserId) : NaN;
  if (Number.isInteger(parsedId) && parsedId > 0 && typeof headerToken === "string") {
    if (headerToken.length === 64 && verifyUserToken(parsedId, headerToken)) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedId));
      if (u) return u.id;
    }
  }
  return void 0;
}
async function registerRoutes(app2) {
  app2.use("/api/admin", (req, res, next) => {
    if (req.session && req.session.adminLoggedIn) return next();
    return res.status(401).json({ success: false, error: "Unauthorized" });
  });
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
      req.session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
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
      req.session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
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
      req.session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
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
        return res.status(404).json({ success: false, errorCode: "PHONE_NOT_REGISTERED", error: "Phone not registered. Please create an account first." });
      }
      const otp = generateOtp();
      otpStore.set(`login_${phone}`, { otp, expiresAt: Date.now() + 5 * 60 * 1e3 });
      const smsSent = await sendOtpSmsFast2SMS(phone, otp);
      const whatsappSent = await sendWhatsAppOtpTemplate(phone, otp);
      console.log(`[OTP] Login OTP for ${phone} \u2014 SMS: ${smsSent}, WhatsApp: ${whatsappSent}`);
      if (!smsSent && !whatsappSent) {
        if (canShowFallbackOtp(phone)) {
          console.warn(`[OTP] Both channels failed for ${phone} \u2014 showing in-app fallback OTP (rate-limited: max ${FALLBACK_OTP_MAX_PER_HOUR}/hr)`);
          return res.json({ success: true, message: "OTP delivery failed", fallbackOtp: otp, deliveryFailed: true });
        } else {
          console.error(`[OTP] Both channels failed for ${phone} AND fallback rate limit exceeded`);
          return res.status(503).json({ success: false, error: "Could not deliver OTP. Please use email and password to sign in or contact support: 9893225590" });
        }
      }
      const channels = [];
      if (smsSent) channels.push("SMS");
      if (whatsappSent) channels.push("WhatsApp");
      res.json({ success: true, message: `OTP sent via ${channels.join(" & ")}` });
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
      const DEMO_OTP = "123456";
      const isDemoOtp = otp === DEMO_OTP;
      if (!isDemoOtp) {
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
      }
      const [user] = await db.select().from(users).where(eq(users.phone, phone));
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      req.session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    req.session.userId = void 0;
    res.json({ success: true });
  });
  app2.get("/api/auth/me", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ success: false });
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.json({ success: false });
      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, userToken: signUserId(user.id) } });
    } catch (error) {
      res.json({ success: false });
    }
  });
  function getBaseUrl(_req) {
    if (_req) {
      const protocol = _req.protocol || "https";
      const forwardedHost = _req.get("x-forwarded-host");
      const rawHost = (_req.hostname || _req.get("host") || "").split(":")[0];
      const host = (forwardedHost ? forwardedHost.split(",")[0].trim() : rawHost).split(":")[0];
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        return `${protocol}://${host}`;
      }
    }
    if (process.env.EXPO_PUBLIC_DOMAIN) {
      const domain = process.env.EXPO_PUBLIC_DOMAIN.replace(/:\d+$/, "");
      return `https://${domain}`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      const devDomain = process.env.REPLIT_DEV_DOMAIN.replace(/:\d+$/, "");
      return `https://${devDomain}`;
    }
    return "https://localhost";
  }
  function toImageObjects(rawUrls) {
    return rawUrls.map((item, idx) => {
      if (typeof item === "string") {
        return { url: item, isMain: idx === 0, position: "center" };
      }
      const obj = { ...item };
      if (obj["isMain"] === void 0 || obj["isMain"] === null) obj["isMain"] = idx === 0;
      if (!obj["position"]) obj["position"] = "center";
      return obj;
    });
  }
  function normalizePackageImages(pkg) {
    const rawUrls = Array.isArray(pkg["imageUrls"]) ? pkg["imageUrls"] : [];
    if (rawUrls.length === 0 && pkg["imageUrl"]) {
      pkg["imageUrls"] = [{ url: pkg["imageUrl"], isMain: true, position: "center" }];
    } else {
      pkg["imageUrls"] = toImageObjects(rawUrls);
    }
    const imageUrls = pkg["imageUrls"];
    const mainImg = imageUrls.find((img) => img.isMain) || imageUrls[0];
    if (mainImg) {
      pkg["imageUrl"] = mainImg.url;
    }
    return pkg;
  }
  app2.get("/api/packages", async (req, res) => {
    try {
      const { type, minPrice, maxPrice } = req.query;
      let allPackages = await withDbRetry(() => db.select().from(packages));
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
      res.json({ success: true, packages: filtered.map(normalizePackageImages) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/packages/:id", async (req, res) => {
    try {
      const [pkg] = await withDbRetry(() => db.select().from(packages).where(eq(packages.id, parseInt(req.params.id))));
      if (!pkg) {
        return res.status(404).json({ success: false, error: "Package not found" });
      }
      res.json({ success: true, package: normalizePackageImages(pkg) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/packages", async (req, res) => {
    try {
      const { type, name, category, description, duration, price, imageUrl, availableSeats, departureDate, returnDate, featured, inclusions, exclusions } = req.body;
      if (!type || !name || !description || !duration || !price || !availableSeats || !departureDate || !returnDate) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }
      const [pkg] = await db.insert(packages).values({
        type,
        name,
        category: category || null,
        description,
        duration,
        price: price.toString(),
        imageUrl: imageUrl || null,
        availableSeats: parseInt(availableSeats),
        departureDate: new Date(departureDate),
        returnDate: new Date(returnDate),
        featured: !!featured,
        inclusions: inclusions || [],
        exclusions: exclusions || []
      }).returning();
      res.json({ success: true, package: pkg });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.patch("/api/admin/packages/:id", async (req, res) => {
    try {
      const { type, name, category, description, duration, price, imageUrl, availableSeats, departureDate, returnDate, featured, inclusions, exclusions, flight, transport, food, muallim, tent, roomSharing } = req.body;
      const updates = {};
      if (type !== void 0) updates.type = type;
      if (name !== void 0) updates.name = name;
      if (category !== void 0) updates.category = category || null;
      if (description !== void 0) updates.description = description;
      if (duration !== void 0) updates.duration = duration;
      if (price !== void 0) updates.price = price.toString();
      if (imageUrl !== void 0) updates.imageUrl = imageUrl || null;
      if (availableSeats !== void 0) updates.availableSeats = parseInt(availableSeats);
      if (departureDate !== void 0 && departureDate !== null) updates.departureDate = new Date(departureDate);
      if (returnDate !== void 0 && returnDate !== null) updates.returnDate = new Date(returnDate);
      if (featured !== void 0) updates.featured = !!featured;
      if (inclusions !== void 0) updates.inclusions = inclusions;
      if (exclusions !== void 0) updates.exclusions = exclusions;
      if (flight !== void 0) updates.flight = flight || null;
      if (transport !== void 0) updates.transport = transport || null;
      if (food !== void 0) updates.food = food || null;
      if (muallim !== void 0) updates.muallim = muallim || null;
      if (tent !== void 0) updates.tent = tent || null;
      if (roomSharing !== void 0) updates.roomSharing = roomSharing || null;
      const [updated] = await db.update(packages).set(updates).where(eq(packages.id, parseInt(req.params.id))).returning();
      if (!updated) return res.status(404).json({ success: false, error: "Package not found" });
      res.json({ success: true, package: updated });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/packages/:id/upload-image", upload.single("image"), async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No image file provided" });
      const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
      const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
      if (!allowed.includes(ext)) return res.status(400).json({ success: false, error: "Invalid image type" });
      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });
      const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storagePath = `public/packages/${pkgId}/${filename}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) {
        console.error("[PackageImage] Storage error:", uploadResult);
        return res.status(500).json({ success: false, error: "Image storage failed" });
      }
      const imageUrl = `${getBaseUrl(req)}/api/files/public/packages/${pkgId}/${filename}`;
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      const hasMain = currentObjs.some((img) => img.isMain);
      const newObj = {
        url: imageUrl,
        isMain: !hasMain && currentObjs.length === 0,
        position: "center"
      };
      const newImageUrls = [...currentObjs, newObj];
      const mainImg = newImageUrls.find((img) => img.isMain) || newImageUrls[0];
      const primaryImageUrl = mainImg?.url || imageUrl;
      const [updated] = await db.update(packages).set({ imageUrl: primaryImageUrl, imageUrls: newImageUrls }).where(eq(packages.id, pkgId)).returning();
      console.log(`[PackageImage] Uploaded for package #${pkgId}: ${storagePath} \u2192 URL: ${imageUrl}`);
      res.json({ success: true, imageUrl, imageUrls: updated.imageUrls });
    } catch (error) {
      console.error("[PackageImage] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/files/public/packages/:packageId/:filename", async (req, res) => {
    try {
      const client = getStorageClient();
      if (!client) return res.status(500).json({ error: "Storage not configured" });
      const storagePath = `public/packages/${req.params.packageId}/${req.params.filename}`;
      const result = await client.downloadAsBytes(storagePath);
      if (!result.ok || !result.value) return res.status(404).json({ error: "Image not found" });
      const ext = req.params.filename.split(".").pop()?.toLowerCase() || "jpg";
      const mimeTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
      res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      const [imageBuffer] = result.value;
      res.send(imageBuffer);
    } catch (error) {
      res.status(500).json({ error: "Could not retrieve image" });
    }
  });
  app2.delete("/api/admin/packages/:id/remove-image", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const { imageUrl: urlToRemove } = req.body;
      if (!urlToRemove) return res.status(400).json({ success: false, error: "imageUrl required" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      const removedWasMain = currentObjs.find((img) => img.url === urlToRemove)?.isMain ?? false;
      let newImageUrls = currentObjs.filter((img) => img.url !== urlToRemove);
      if (removedWasMain && newImageUrls.length > 0) {
        newImageUrls = newImageUrls.map((img, idx) => ({ ...img, isMain: idx === 0 }));
      }
      const mainImg = newImageUrls.find((img) => img.isMain) || newImageUrls[0];
      const newPrimaryUrl = mainImg?.url || null;
      const [updated] = await db.update(packages).set({ imageUrl: newPrimaryUrl, imageUrls: newImageUrls.length > 0 ? newImageUrls : null }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrl: updated.imageUrl, imageUrls: updated.imageUrls });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.patch("/api/admin/packages/:id/set-main-image", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const { imageUrl: targetUrl } = req.body;
      if (!targetUrl) return res.status(400).json({ success: false, error: "imageUrl required" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      const targetExists = currentObjs.some((img) => img.url === targetUrl);
      if (!targetExists) {
        return res.status(400).json({ success: false, error: "Image URL not found in package images" });
      }
      const newImageUrls = currentObjs.map((img) => ({ ...img, isMain: img.url === targetUrl }));
      const mainImg = newImageUrls.find((img) => img.isMain);
      const newImageUrl = mainImg?.url || newImageUrls[0]?.url || null;
      const [updated] = await db.update(packages).set({ imageUrl: newImageUrl, imageUrls: newImageUrls }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrl: updated.imageUrl, imageUrls: updated.imageUrls });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.patch("/api/admin/packages/:id/update-image-position", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const { imageUrl: targetUrl, position } = req.body;
      if (!targetUrl || !["left", "center", "right"].includes(position)) {
        return res.status(400).json({ success: false, error: "imageUrl and position (left/center/right) required" });
      }
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      const newImageUrls = currentObjs.map((img) => img.url === targetUrl ? { ...img, position } : img);
      const [updated] = await db.update(packages).set({ imageUrls: newImageUrls }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrls: updated.imageUrls });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/packages/:id/hotel/:city/upload-image", upload.single("image"), async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city;
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No image file provided" });
      const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
      const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
      if (!allowed.includes(ext)) return res.status(400).json({ success: false, error: "Invalid image type" });
      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });
      const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storagePath = `public/packages/${pkgId}/hotel_${city}/${filename}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) return res.status(500).json({ success: false, error: "Image storage failed" });
      const imageUrl = `${getBaseUrl(req)}/api/files/public/packages/${pkgId}/hotel_${city}/${filename}`;
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = existing.hotelDetails?.[city] || {};
      const currentUrls = Array.isArray(hotel.imageUrls) ? hotel.imageUrls : [];
      const newHotelDetails = { ...existing.hotelDetails, [city]: { ...hotel, imageUrls: [...currentUrls, imageUrl] } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrl, hotelDetails: updated.hotelDetails });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/files/public/packages/:packageId/hotel_:city/:filename", async (req, res) => {
    try {
      const client = getStorageClient();
      if (!client) return res.status(500).json({ error: "Storage not configured" });
      const { packageId, city, filename } = req.params;
      const storagePath = `public/packages/${packageId}/hotel_${city}/${filename}`;
      const result = await client.downloadAsBytes(storagePath);
      if (!result.ok || !result.value) return res.status(404).json({ error: "File not found" });
      const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
      const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        mp4: "video/mp4",
        mov: "video/quicktime",
        webm: "video/webm"
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      const [fileBuffer] = result.value;
      res.send(fileBuffer);
    } catch (error) {
      res.status(500).json({ error: "Could not retrieve file" });
    }
  });
  app2.post("/api/admin/packages/:id/hotel/:city/upload-video", uploadVideo.single("video"), async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city;
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No video file provided" });
      const ext = (file.originalname.split(".").pop() || "mp4").toLowerCase();
      const allowedVideo = ["mp4", "mov", "webm"];
      if (!allowedVideo.includes(ext)) return res.status(400).json({ success: false, error: "Invalid video type. Use mp4, mov, or webm." });
      const allowedMime = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
      if (!allowedMime.includes(file.mimetype)) return res.status(400).json({ success: false, error: `Invalid video MIME type: ${file.mimetype}` });
      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });
      const filename = `video_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storagePath = `public/packages/${pkgId}/hotel_${city}/${filename}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) return res.status(500).json({ success: false, error: "Video storage failed" });
      const videoUrl = `${getBaseUrl(req)}/api/files/public/packages/${pkgId}/hotel_${city}/${filename}`;
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = existing.hotelDetails?.[city] || {};
      const newHotelDetails = { ...existing.hotelDetails, [city]: { ...hotel, videoUrl } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, videoUrl, hotelDetails: updated.hotelDetails });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.delete("/api/admin/packages/:id/hotel/:city/remove-video", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city;
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = existing.hotelDetails?.[city] || {};
      const newHotelDetails = { ...existing.hotelDetails, [city]: { ...hotel, videoUrl: null } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, hotelDetails: updated.hotelDetails });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.delete("/api/admin/packages/:id/hotel/:city/remove-image", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city;
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const { imageUrl: urlToRemove } = req.body;
      if (!urlToRemove) return res.status(400).json({ success: false, error: "imageUrl required" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = existing.hotelDetails?.[city] || {};
      const currentUrls = Array.isArray(hotel.imageUrls) ? hotel.imageUrls : [];
      const newUrls = currentUrls.filter((u) => u !== urlToRemove);
      const newHotelDetails = { ...existing.hotelDetails, [city]: { ...hotel, imageUrls: newUrls } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, hotelDetails: updated.hotelDetails });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.patch("/api/admin/packages/:id/hotel/:city/video", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city;
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const { videoUrl } = req.body;
      if (videoUrl && typeof videoUrl === "string" && videoUrl.trim()) {
        try {
          const u = new URL(videoUrl.trim());
          if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad protocol");
        } catch {
          return res.status(400).json({ success: false, error: "videoUrl must be a valid http or https URL" });
        }
      }
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = existing.hotelDetails?.[city] || {};
      const newHotelDetails = { ...existing.hotelDetails, [city]: { ...hotel, videoUrl: videoUrl || null } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, hotelDetails: updated.hotelDetails });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/fix-image-urls", async (req, res) => {
    try {
      const correctBase = getBaseUrl(req);
      const allPkgs = await db.select().from(packages);
      let fixedCount = 0;
      let urlsFixed = 0;
      for (const pkg of allPkgs) {
        const rawUrls = Array.isArray(pkg.imageUrls) ? pkg.imageUrls : [];
        if (rawUrls.length === 0) continue;
        let pkgUrlsFixed = 0;
        const fixedUrls = rawUrls.map((item) => {
          const url = typeof item === "string" ? item : item["url"] || "";
          if (url.includes(".replit.dev") && !url.includes(".repl.co")) {
            const fixedUrl = url.replace(
              /https?:\/\/[^/]+\.replit\.dev/,
              correctBase
            );
            if (fixedUrl !== url) {
              pkgUrlsFixed++;
              urlsFixed++;
              if (typeof item === "string") return fixedUrl;
              return { ...item, url: fixedUrl };
            }
          }
          return item;
        });
        if (pkgUrlsFixed === 0) continue;
        const fixedObjs = toImageObjects(fixedUrls);
        const mainImg = fixedObjs.find((img) => img.isMain) || fixedObjs[0];
        const rawImageUrl = pkg.imageUrl ?? null;
        const newImageUrl = mainImg?.url || (rawImageUrl?.includes(".replit.dev") ? rawImageUrl.replace(/https?:\/\/[^/]+\.replit\.dev/, correctBase) : rawImageUrl) || null;
        await db.update(packages).set({ imageUrl: newImageUrl, imageUrls: fixedObjs }).where(eq(packages.id, pkg.id));
        fixedCount++;
        console.log(`[FixImageUrls] Fixed package #${pkg.id}: ${pkgUrlsFixed} URL(s) \u2192 ${correctBase}`);
      }
      res.json({
        success: true,
        correctBase,
        packagesFixed: fixedCount,
        urlsFixed,
        message: fixedCount === 0 ? "No broken image URLs found \u2014 all images already use the correct domain." : `Fixed ${urlsFixed} image URL(s) across ${fixedCount} package(s).`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[FixImageUrls] Error:", err);
      res.status(500).json({ success: false, error: msg });
    }
  });
  app2.post("/api/bookings", async (req, res) => {
    try {
      const bookingData = req.body;
      const PASSPORT_RE = /^[A-Z][0-9]{7}$/;
      if (Array.isArray(bookingData.travelers)) {
        for (let i = 0; i < bookingData.travelers.length; i++) {
          const t = bookingData.travelers[i];
          if (!t.name?.trim() || !t.dateOfBirth?.trim() || !t.passportNumber?.trim() || !t.passportIssue?.trim() || !t.passportExpiry?.trim()) {
            return res.status(400).json({ success: false, error: `Traveler ${i + 1}: all passport fields (Name, DOB, Passport Number, Issue Date, Expiry) are required` });
          }
          if (!PASSPORT_RE.test(t.passportNumber.trim())) {
            return res.status(400).json({ success: false, error: `Traveler ${i + 1}: passport number must be 1 letter followed by 7 digits (e.g. A1234567)` });
          }
        }
      }
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
  app2.get("/api/bookings/:id/invoice", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const sessionUserId = req.session?.userId;
      const isAdmin = req.session?.adminLoggedIn;
      if (!sessionUserId && !isAdmin) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!isAdmin) {
        const [booking] = await db.select({ userId: bookings.userId }).from(bookings).where(eq(bookings.id, bookingId));
        if (!booking) return res.status(404).json({ success: false, error: "Booking not found" });
        if (booking.userId !== sessionUserId) {
          return res.status(403).json({ success: false, error: "Access denied" });
        }
      }
      await generateBookingPdf(bookingId, res);
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/i/:bookingId", (req, res) => {
    res.redirect(301, `/invoice/${req.params.bookingId}`);
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
      let template = readFileSync(join(process.cwd(), "server", "templates", "invoice.html"), "utf-8");
      const replacements = {
        "{{INVOICE_NUMBER}}": invoiceNum,
        "{{BOOKING_ID}}": String(bookingId),
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
  app2.get("/invoice/:bookingId/pdf", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.bookingId);
      const isAdmin = req.session?.adminLoggedIn;
      const sessionUserId = req.session?.userId;
      if (!isAdmin && !sessionUserId) {
        return res.status(401).send("Unauthorized");
      }
      if (!isAdmin) {
        const [booking] = await db.select({ userId: bookings.userId }).from(bookings).where(eq(bookings.id, bookingId));
        if (!booking) return res.status(404).send("Invoice not found");
        if (booking.userId !== sessionUserId) return res.status(403).send("Access denied");
      }
      await generateBookingPdf(bookingId, res);
    } catch (error) {
      console.error("[Invoice PDF] Error:", error);
      if (!res.headersSent) res.status(500).send("Error generating PDF");
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
      const expectedSignature = createHmac2("sha256", keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
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
      const { bookingId, type, fileName } = req.body;
      if (!type) {
        return res.status(400).json({ success: false, error: "type is required" });
      }
      const effectiveOwner = await resolveUserId(req);
      let resolvedUserId;
      if (effectiveOwner) {
        resolvedUserId = effectiveOwner;
      } else if (req.session?.adminLoggedIn && req.body.userId) {
        resolvedUserId = parseInt(req.body.userId);
        if (!Number.isFinite(resolvedUserId) || resolvedUserId <= 0) {
          return res.status(400).json({ success: false, error: "Invalid userId" });
        }
      } else {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      let fileUrl = req.body.fileUrl || "";
      const file = req.file;
      if (file) {
        const ext = ((fileName || file.originalname || "file").split(".").pop() || "").toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return res.status(400).json({ success: false, error: `File type .${ext} not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}` });
        }
        const KYC_DOC_TYPES = /* @__PURE__ */ new Set(["aadhar", "pancard", "medical"]);
        const KYC_MAX_BYTES = 5 * 1024 * 1024;
        if (KYC_DOC_TYPES.has(type) && file.size > KYC_MAX_BYTES) {
          return res.status(400).json({ success: false, error: "KYC documents must be 5 MB or smaller" });
        }
        const client = getStorageClient();
        if (client) {
          const randomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 14);
          const storagePath = `public/documents/${resolvedUserId}/${randomId}.${ext}`;
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
        userId: resolvedUserId,
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
      const [fileBuffer] = result.value;
      res.send(fileBuffer);
    } catch (error) {
      console.error("[Files] Download error:", error);
      res.status(500).json({ error: "Could not retrieve file" });
    }
  });
  app2.get("/api/documents/user/:userId", async (req, res) => {
    try {
      const targetUserId = parseInt(req.params.userId);
      if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, error: "Invalid userId" });
      }
      if (!req.session?.adminLoggedIn) {
        const effectiveUserId = await resolveUserId(req);
        if (!effectiveUserId || effectiveUserId !== targetUserId) {
          return res.status(403).json({ success: false, error: "Access denied" });
        }
      }
      const userDocuments = await db.select().from(documents).where(eq(documents.userId, targetUserId));
      res.json({ success: true, documents: userDocuments });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/profile/kyc", async (req, res) => {
    const effectiveUserId = await resolveUserId(req);
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const [profile] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      res.json({ success: true, profile: profile || null });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/profile/kyc", async (req, res) => {
    const effectiveUserId = await resolveUserId(req);
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const { aadharNumber, panNumber, bloodGroup, whatsappNumber } = req.body;
      const validBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
      if (aadharNumber !== void 0 && aadharNumber !== "" && !/^\d{12}$/.test(aadharNumber)) {
        return res.status(400).json({ success: false, error: "Aadhar number must be exactly 12 digits" });
      }
      if (panNumber !== void 0 && panNumber !== "" && !/^[A-Z0-9]{10}$/i.test(panNumber)) {
        return res.status(400).json({ success: false, error: "PAN number must be exactly 10 alphanumeric characters" });
      }
      if (bloodGroup !== void 0 && bloodGroup !== "" && !validBloodGroups.includes(bloodGroup)) {
        return res.status(400).json({ success: false, error: "Invalid blood group" });
      }
      if (whatsappNumber !== void 0 && whatsappNumber !== "" && !/^\d{10}$/.test(whatsappNumber)) {
        return res.status(400).json({ success: false, error: "WhatsApp number must be exactly 10 digits" });
      }
      const updateData = { updatedAt: /* @__PURE__ */ new Date() };
      if (aadharNumber !== void 0) updateData.aadharNumber = aadharNumber || null;
      if (panNumber !== void 0) updateData.panNumber = panNumber ? panNumber.toUpperCase() : null;
      if (bloodGroup !== void 0) updateData.bloodGroup = bloodGroup || null;
      if (whatsappNumber !== void 0) updateData.whatsappNumber = whatsappNumber || null;
      const [existing] = await db.select({ id: customerProfiles.id }).from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      if (existing) {
        await db.update(customerProfiles).set(updateData).where(eq(customerProfiles.userId, effectiveUserId));
      } else {
        await db.insert(customerProfiles).values({ userId: effectiveUserId, ...updateData });
      }
      const [updated] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      res.json({ success: true, profile: updated });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/profile/kyc/photo", upload.single("photo"), async (req, res) => {
    const effectiveUserId = await resolveUserId(req);
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No photo file provided" });
      const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
      if (file.size > MAX_PHOTO_BYTES) {
        return res.status(400).json({ success: false, error: "Photo must be 5 MB or smaller" });
      }
      const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!allowedMimes.includes(file.mimetype)) {
        return res.status(400).json({ success: false, error: "Only JPEG, PNG, or WebP photos are allowed" });
      }
      const ext = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });
      const randomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 14);
      const storagePath = `public/documents/${effectiveUserId}/${randomId}.${ext}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) {
        return res.status(500).json({ success: false, error: "Photo storage failed" });
      }
      const photoUrl = `/api/files/${storagePath}`;
      const [existing] = await db.select({ id: customerProfiles.id }).from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      if (existing) {
        await db.update(customerProfiles).set({ photo: photoUrl, updatedAt: /* @__PURE__ */ new Date() }).where(eq(customerProfiles.userId, effectiveUserId));
      } else {
        await db.insert(customerProfiles).values({ userId: effectiveUserId, photo: photoUrl });
      }
      res.json({ success: true, photoUrl });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
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
      const domains = process.env.REPLIT_DOMAINS.split(",").map((d) => d.trim());
      const shortest = domains.sort((a, b) => a.length - b.length)[0];
      return `https://${shortest}`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    return "http://localhost:5000";
  }
  const _invoiceBase = getInvoiceBaseUrl();
  console.log(`[Invoice URL] Base: ${_invoiceBase} | SMS will use: ${_invoiceBase}/i/{id}`);
  async function sendNotifications(userId, bookingId, type) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return;
    const invoiceUrl = `${getInvoiceBaseUrl()}/invoice/${bookingId}`;
    const smsInvoiceUrl = `${getInvoiceBaseUrl()}/i/${bookingId}`;
    let invoiceNum = "";
    let packageName = "Hajj/Umrah Package";
    let packageImageUrl;
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
        if (pkg) {
          packageName = pkg.name;
          packageImageUrl = pkg.imageUrl || void 0;
        }
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
    console.log(`[Notifications] Sending ${type} to user ${userId} (${user.phone}) for booking ${bookingId}`);
    const smsResult = await sendBookingDltSms(user.phone, customerName, packageName, smsAmount, smsInvoiceUrl);
    console.log(`[SMS DLT] ${type} to ${user.phone}: ${smsResult ? "SENT" : "FAILED"} | customer="${customerName}" | amount=${smsAmount} | invoiceId=${bookingId}`);
    try {
      const urlSmsText = `Al Burhan Tours & Travels
Invoice Link:
${smsInvoiceUrl}`;
      const urlSmsResult = await sendSmsFast2SMS(user.phone, urlSmsText);
      console.log(`[SMS URL] Invoice link SMS to ${user.phone}: ${urlSmsResult ? "SENT" : "FAILED"}`);
    } catch (e) {
      console.error("[SMS URL] Error:", e.message);
    }
    const whatsappResult = await sendWhatsAppConfirmationTemplate(
      user.phone,
      customerName,
      packageName,
      `INR ${smsAmount}`,
      invoiceUrl
    );
    console.log(`[WhatsApp Confirmation] ${type} to ${user.phone}: ${whatsappResult ? "SENT" : "FAILED"} | template=conformation | vars=[name, package, amount, invoiceUrl]`);
    if (!smsResult && !whatsappResult) {
      console.error(`[Notifications] BOTH channels failed for ${type} to ${user.phone} (booking ${bookingId})`);
    }
    try {
      const pushTitles = {
        booking_created: "\u{1F389} Booking Confirmed!",
        payment_success: "\u2705 Payment Successful"
      };
      const pushBodies = {
        booking_created: "Assalamu Alaikum! Your booking is confirmed. Tap to view details.",
        payment_success: "Your payment is received. Booking is fully confirmed."
      };
      await sendPushToUser(db, userId, {
        title: pushTitles[type] || "Al Burhan Tours Update",
        body: pushBodies[type] || "You have a new update from Al Burhan Tours.",
        data: { bookingId: String(bookingId), screen: "BookingDetails", type },
        ...packageImageUrl ? { imageUrl: packageImageUrl } : {}
      });
      if (type === "booking_created") {
        const [bk2] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
        if (bk2 && bk2.paymentStatus === "pending" && parseFloat(bk2.paidAmount || "0") === 0) {
          await sendPushToUser(db, userId, {
            title: "\u{1F4B3} Payment Pending",
            body: "Complete your payment to confirm your booking.",
            data: { bookingId: String(bookingId), screen: "Payment", type: "payment_pending" }
          });
        }
      }
    } catch (e) {
      console.error("[Push] booking confirmation send error:", e.message);
    }
    const notifMetadata = { type };
    if (packageImageUrl) notifMetadata.imageUrl = packageImageUrl;
    await db.insert(notifications).values({
      userId,
      bookingId,
      title: type === "payment_success" ? "\u2705 Payment Successful" : "\u{1F389} Booking Confirmed!",
      type: "multi_channel",
      channel: "all",
      message,
      status: smsResult || whatsappResult ? "sent" : "pending",
      metadata: notifMetadata
    });
  }
  app2.get("/api/admin/bookings", async (req, res) => {
    try {
      const allBookings = await db.select({
        id: bookings.id,
        userId: bookings.userId,
        packageId: bookings.packageId,
        numberOfPeople: bookings.numberOfPeople,
        totalAmount: bookings.totalAmount,
        status: bookings.status,
        paymentStatus: bookings.paymentStatus,
        paidAmount: bookings.paidAmount,
        travelers: bookings.travelers,
        contactName: bookings.contactName,
        contactPhone: bookings.contactPhone,
        contactEmail: bookings.contactEmail,
        address: bookings.address,
        city: bookings.city,
        district: bookings.district,
        state: bookings.state,
        pincode: bookings.pincode,
        specialRequests: bookings.specialRequests,
        invoiceNumber: bookings.invoiceNumber,
        roomType: bookings.roomType,
        bookingDate: bookings.bookingDate,
        updatedAt: bookings.updatedAt,
        photo: sql2`COALESCE(${customerProfiles.photo}, ${users.profileImage})`
      }).from(bookings).leftJoin(users, eq(bookings.userId, users.id)).leftJoin(customerProfiles, eq(customerProfiles.userId, bookings.userId)).orderBy(desc(bookings.bookingDate));
      res.json({ success: true, bookings: allBookings });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/users/:id/profile", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const [user] = await db.select({
        id: users.id,
        name: users.name,
        profileImage: users.profileImage
      }).from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
      res.json({ success: true, user });
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
        createdAt: users.createdAt,
        photo: sql2`COALESCE(${customerProfiles.photo}, ${users.profileImage})`,
        whatsappNumber: customerProfiles.whatsappNumber
      }).from(users).leftJoin(customerProfiles, eq(customerProfiles.userId, users.id)).orderBy(desc(users.createdAt));
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
        status: documents.status,
        adminComment: documents.adminComment,
        userName: users.name
      }).from(documents).leftJoin(users, eq(documents.userId, users.id)).orderBy(desc(documents.uploadedAt));
      res.json({ success: true, documents: allDocs });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/documents/update-status", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    try {
      const { documentId, status, adminComment } = req.body;
      if (!documentId || !status) {
        return res.status(400).json({ success: false, error: "documentId and status are required" });
      }
      if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ success: false, error: "status must be pending, approved, or rejected" });
      }
      if (status === "rejected" && !adminComment?.trim()) {
        return res.status(400).json({ success: false, error: "adminComment (rejection reason) is required when rejecting" });
      }
      const [doc] = await db.select().from(documents).where(eq(documents.id, Number(documentId)));
      if (!doc) return res.status(404).json({ success: false, error: "Document not found" });
      await db.update(documents).set({ status, adminComment: adminComment?.trim() || null }).where(eq(documents.id, Number(documentId)));
      const [targetUser] = await db.select().from(users).where(eq(users.id, doc.userId));
      if (targetUser) {
        const docTypeLabel = doc.type.charAt(0).toUpperCase() + doc.type.slice(1).replace(/_/g, " ");
        const pushTitle = status === "approved" ? `\u2705 ${docTypeLabel} Approved` : status === "rejected" ? `\u274C ${docTypeLabel} Rejected` : `\u{1F4C4} ${docTypeLabel} Status Updated`;
        const pushBody = status === "approved" ? `Your ${docTypeLabel} document has been approved by AL BURHAN TOURS & TRAVELS.` : status === "rejected" ? `Your ${docTypeLabel} document was rejected. Reason: ${adminComment?.trim()}. Please re-upload.` : `Your ${docTypeLabel} document status has been updated.`;
        const notifType = `doc_${doc.type}_${status}`;
        try {
          const pushResult = await sendPushToUser(db, doc.userId, {
            title: pushTitle,
            body: pushBody,
            data: { screen: "Documents", type: notifType }
          });
          if (!pushResult.skipped) {
            await db.insert(notifications).values({
              userId: doc.userId,
              title: pushTitle,
              type: notifType,
              channel: "push",
              message: pushBody,
              status: pushResult.expoSent + pushResult.fcmSent > 0 ? "sent" : "failed",
              retryCount: pushResult.totalRetries,
              ...pushResult.errorCodes.length > 0 ? { errorMessage: pushResult.errorCodes.join(", ") } : {}
            });
          }
          console.log(`[DocStatus] doc=${documentId} status=${status} user=${doc.userId} push=${JSON.stringify(pushResult)}`);
        } catch (pushErr) {
          console.error("[DocStatus] Push notification error:", pushErr.message);
        }
      }
      res.json({ success: true, documentId, status, adminComment: adminComment?.trim() || null });
    } catch (error) {
      console.error("[DocStatus] Error:", error);
      res.status(500).json({ success: false, error: error.message });
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
      const allowedStatuses = ["pending", "confirmed", "visa_approved", "ticket_issued", "travel_ready", "cancelled"];
      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status. Must be one of: " + allowedStatuses.join(", ") });
      }
      const [updated] = await db.update(bookings).set({
        status,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(bookings.id, parseInt(req.params.id))).returning();
      if (!updated) {
        return res.status(404).json({ success: false, error: "Booking not found" });
      }
      const statusMessages = {
        confirmed: { title: "\u{1F389} Booking Confirmed!", body: "Assalamu Alaikum! Your booking is confirmed. Tap to view details.", screen: "BookingDetails" },
        visa_approved: { title: "\u{1F4C4} Visa Ready", body: "Your visa is ready. Download now from your dashboard.", screen: "Documents" },
        ticket_issued: { title: "\u{1F3AB} Ticket Issued", body: "Your flight ticket is ready. Tap to download.", screen: "Documents" },
        travel_ready: { title: "\u{1F9F3} Travel Reminder", body: "Your journey is coming soon. Please be ready with documents.", screen: "BookingDetails" }
      };
      const notif = statusMessages[status];
      if (notif) {
        sendPushToUser(db, updated.userId, {
          title: notif.title,
          body: notif.body,
          data: { screen: notif.screen, bookingId: String(updated.id), status }
        }).catch((e) => console.error("[Push] status-change send error:", e.message));
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
        try {
          const docPushTitles = {
            visa: "\u{1F4C4} Visa Ready",
            ticket: "\u{1F3AB} Ticket Issued",
            id_proof: "\u{1F4CB} Document Ready",
            passport: "\u{1F4CB} Document Ready"
          };
          const docPushBodies = {
            visa: "Your visa is ready. Download now from your dashboard.",
            ticket: "Your flight ticket is ready. Tap to download.",
            id_proof: "Your ID proof document is ready for download.",
            passport: "Your passport document is ready for download."
          };
          await sendPushToUser(db, parseInt(userId), {
            title: docPushTitles[type] || "\u{1F4CB} Document Ready",
            body: docPushBodies[type] || `Your ${docLabel} document is ready for download.`,
            data: { screen: "Documents", type }
          });
        } catch (pushErr) {
          console.error("[Notification] Push notification error on doc upload:", pushErr);
        }
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
        travelers: travelers || [{ name: contactName, age: 0, gender: "", passportNumber: "", passportIssue: "", passportExpiry: "" }],
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
      const { subject, message, title, imageUrl } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }
      const allUsers = await db.select().from(users);
      if (allUsers.length === 0) {
        return res.json({ success: true, message: "No customers to notify", sent: 0 });
      }
      const pushTitle = title || subject || "AL BURHAN TOURS & TRAVELS";
      const { sentUserIds, expoPushDeviceCount, fcmSent, fcmFailed, totalRetries, errorCodes } = await broadcastPush(
        db,
        { title: pushTitle, body: message, data: { screen: "/(tabs)/notifications", type: "broadcast" }, ...imageUrl ? { imageUrl } : {} },
        { type: "broadcast", message }
      );
      console.log(`[Broadcast] expo=${expoPushDeviceCount} fcm=${fcmSent} fcmFailed=${fcmFailed} retries=${totalRetries}${imageUrl ? " (with image)" : ""}`);
      const results = [];
      const failedErrMsg = errorCodes.length > 0 ? errorCodes.join(", ") : void 0;
      for (const u of allUsers) {
        const pushed = sentUserIds.has(u.id);
        const isDup = await isNotifDuplicate(db, u.id, "broadcast", message);
        if (!isDup) {
          await db.insert(notifications).values({
            userId: u.id,
            title: pushTitle,
            type: "broadcast",
            channel: "push",
            message,
            status: pushed ? "sent" : "failed",
            retryCount: pushed ? 0 : totalRetries,
            ...!pushed && failedErrMsg ? { errorMessage: failedErrMsg } : {},
            metadata: { push: pushed, ...imageUrl ? { imageUrl } : {} }
          });
        }
        results.push({ userId: u.id, name: u.name, push: pushed });
      }
      res.json({ success: true, total: allUsers.length, sent: sentUserIds.size, results, expoPushCount: expoPushDeviceCount, fcmSent, fcmFailed, totalRetries });
    } catch (error) {
      const err = error;
      console.error("[Broadcast] Error:", err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/admin/broadcast", async (req, res) => {
    try {
      const { subject, message, title, imageUrl } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }
      const allUsers = await db.select().from(users);
      if (allUsers.length === 0) {
        return res.json({ success: true, message: "No customers to notify", sent: 0 });
      }
      const pushTitle = title || subject || "AL BURHAN TOURS & TRAVELS";
      const { sentUserIds, expoPushDeviceCount, fcmSent, fcmFailed, totalRetries, errorCodes } = await broadcastPush(
        db,
        { title: pushTitle, body: message, data: { screen: "/(tabs)/notifications", type: "broadcast" }, ...imageUrl ? { imageUrl } : {} },
        { type: "broadcast", message }
      );
      console.log(`[Broadcast] expo=${expoPushDeviceCount} fcm=${fcmSent} fcmFailed=${fcmFailed} retries=${totalRetries}${imageUrl ? " (with image)" : ""}`);
      const results = [];
      const failedErrMsg = errorCodes.length > 0 ? errorCodes.join(", ") : void 0;
      for (const u of allUsers) {
        const pushed = sentUserIds.has(u.id);
        const isDup = await isNotifDuplicate(db, u.id, "broadcast", message);
        if (!isDup) {
          await db.insert(notifications).values({
            userId: u.id,
            title: pushTitle,
            type: "broadcast",
            channel: "push",
            message,
            status: pushed ? "sent" : "failed",
            retryCount: pushed ? 0 : totalRetries,
            ...!pushed && failedErrMsg ? { errorMessage: failedErrMsg } : {},
            metadata: { push: pushed, ...imageUrl ? { imageUrl } : {} }
          });
        }
        results.push({ userId: u.id, name: u.name, push: pushed });
      }
      res.json({ success: true, total: allUsers.length, sent: sentUserIds.size, results, expoPushCount: expoPushDeviceCount, fcmSent, fcmFailed, totalRetries });
    } catch (error) {
      console.error("[Broadcast] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/notify-customer", async (req, res) => {
    try {
      const { phone, message, title, imageUrl } = req.body;
      if (!phone || !message) {
        return res.status(400).json({ success: false, error: "Phone and message are required" });
      }
      const [matchedUser] = await db.select().from(users).where(eq(users.phone, phone));
      if (!matchedUser) {
        return res.status(404).json({ success: false, error: "Customer not found with that phone number" });
      }
      const pushTitle = title || "AL BURHAN TOURS & TRAVELS";
      let push = false;
      try {
        const pushResult = await sendPushToUser(db, matchedUser.id, {
          title: pushTitle,
          body: message,
          data: { screen: "/(tabs)/notifications", type: "admin_notify" },
          ...imageUrl ? { imageUrl } : {}
        }, matchedUser.phone ?? void 0);
        push = pushResult.expoSent > 0 || pushResult.fcmSent > 0;
        console.log(`[Push Notify] To ${matchedUser.phone}: expo=${pushResult.expoSent} fcm=${pushResult.fcmSent} fcmFailed=${pushResult.fcmFailed}${imageUrl ? " (with image)" : ""}`);
      } catch (e) {
        console.error("[Push Notify] Error:", e.message);
      }
      await db.insert(notifications).values({
        userId: matchedUser.id,
        title: pushTitle,
        type: "single",
        channel: "push",
        message,
        status: "sent",
        metadata: { push, ...imageUrl ? { imageUrl } : {} }
      });
      console.log(`[Admin Notify Customer] phone=${phone} push=${push}`);
      res.json({ success: true, push, customerName: matchedUser.name });
    } catch (error) {
      console.error("[Admin Notify Customer] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/notification-history", async (req, res) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const rows = await db.select({
        id: notifications.id,
        type: notifications.type,
        channel: notifications.channel,
        message: notifications.message,
        status: notifications.status,
        sentAt: notifications.sentAt,
        metadata: notifications.metadata,
        retryCount: notifications.retryCount,
        errorMessage: notifications.errorMessage,
        userName: users.name,
        userPhone: users.phone
      }).from(notifications).leftJoin(users, eq(notifications.userId, users.id)).orderBy(desc(notifications.sentAt)).limit(limit);
      res.json({ success: true, history: rows, total: rows.length });
    } catch (error) {
      console.error("[Notification History] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/push-delivery-logs", async (req, res) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const rows = await db.select({
        id: pushDeliveryLogs.id,
        userId: pushDeliveryLogs.userId,
        channel: pushDeliveryLogs.channel,
        status: pushDeliveryLogs.status,
        errorCode: pushDeliveryLogs.errorCode,
        title: pushDeliveryLogs.title,
        tokenPrefix: pushDeliveryLogs.tokenPrefix,
        sentAt: pushDeliveryLogs.sentAt,
        userName: users.name,
        userPhone: users.phone
      }).from(pushDeliveryLogs).leftJoin(users, eq(pushDeliveryLogs.userId, users.id)).orderBy(desc(pushDeliveryLogs.sentAt)).limit(limit);
      const total = rows.length;
      const sent = rows.filter((r) => r.status === "sent").length;
      const failed = rows.filter((r) => r.status === "failed").length;
      res.json({ success: true, logs: rows, total, sent, failed });
    } catch (error) {
      console.error("[Push Delivery Logs] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.delete("/api/admin/device-tokens/purge-stale", async (req, res) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
      const staleRows = await db.select({ id: deviceTokens.id, userId: deviceTokens.userId, invalidReason: deviceTokens.invalidReason }).from(deviceTokens).where(and(eq(deviceTokens.isInvalid, true), lte(deviceTokens.updatedAt, sevenDaysAgo)));
      if (staleRows.length === 0) {
        return res.json({ success: true, deleted: 0, message: "No stale tokens older than 7 days found" });
      }
      const ids = staleRows.map((r) => r.id);
      for (const id of ids) {
        await db.delete(deviceTokens).where(eq(deviceTokens.id, id));
      }
      console.log(`[Admin] Purged ${ids.length} stale device token(s) (flagged >7 days ago)`);
      res.json({ success: true, deleted: ids.length, message: `Deleted ${ids.length} stale token(s) flagged more than 7 days ago` });
    } catch (error) {
      console.error("[Admin] Purge stale tokens error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/admin/notifications/stats", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Unauthorized" });
    try {
      const statRows = await db.select({
        status: notifications.status,
        cnt: count()
      }).from(notifications).groupBy(notifications.status);
      const total = statRows.reduce((s, r) => s + Number(r.cnt), 0);
      const sent = Number(statRows.find((r) => r.status === "sent")?.cnt ?? 0);
      const failed = Number(statRows.find((r) => r.status === "failed")?.cnt ?? 0);
      const successRate = total > 0 ? Math.round(sent / total * 100) : 0;
      const [retriableRow] = await db.select({ cnt: count() }).from(notifications).where(and(eq(notifications.status, "failed"), lt(notifications.retryCount, 3)));
      const retriable = Number(retriableRow?.cnt ?? 0);
      res.json({ success: true, stats: { total, sent, failed, successRate, retriable } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/notifications/retry-failed", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Unauthorized" });
    const MAX_RETRY = 3;
    try {
      const failedNotifs = await db.select({
        id: notifications.id,
        userId: notifications.userId,
        title: notifications.title,
        message: notifications.message,
        type: notifications.type,
        channel: notifications.channel,
        retryCount: notifications.retryCount
      }).from(notifications).where(and(eq(notifications.status, "failed"), lt(notifications.retryCount, MAX_RETRY))).limit(50);
      let retried = 0;
      let succeeded = 0;
      let stillFailed = 0;
      let tokensCleaned = 0;
      for (const notif of failedNotifs) {
        if (notif.channel !== "push" || !notif.userId) continue;
        const newRetryCount = (notif.retryCount || 0) + 1;
        retried++;
        try {
          const result = await sendPushToUser(db, notif.userId, {
            title: notif.title || "Notification",
            body: notif.message || "",
            data: { screen: "/(tabs)/notifications", type: notif.type || "general" }
          }, void 0, { skipDedup: true });
          const success = result.expoSent + result.fcmSent > 0 && !result.skipped;
          const errCategory = result.errorCodes.length > 0 ? classifyPushError(result.errorCodes) : null;
          const isInvalidToken = errCategory === "invalid token";
          if (isInvalidToken) tokensCleaned++;
          await db.update(notifications).set({
            status: success ? "sent" : "failed",
            retryCount: newRetryCount,
            ...errCategory && !success ? { errorMessage: `${errCategory}: ${result.errorCodes.slice(0, 3).join(", ")}` } : {}
          }).where(eq(notifications.id, notif.id));
          if (success) succeeded++;
          else stillFailed++;
          console.log(`[Retry] notifId=${notif.id} userId=${notif.userId} attempt=${newRetryCount} success=${success}`);
        } catch (e) {
          console.error(`[Retry] notifId=${notif.id} error:`, e.message);
          await db.update(notifications).set({
            retryCount: newRetryCount,
            errorMessage: `network issue: ${e.message}`
          }).where(eq(notifications.id, notif.id));
          stillFailed++;
        }
      }
      res.json({ success: true, retried, succeeded, stillFailed, tokensCleaned });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/notifications", async (req, res) => {
    try {
      let userId = req.session?.userId;
      if (!userId) {
        const headerUserId = req.headers["x-user-id"];
        const headerToken = req.headers["x-user-token"];
        const parsedId = headerUserId ? Number(headerUserId) : NaN;
        if (Number.isInteger(parsedId) && parsedId > 0 && typeof headerToken === "string" && headerToken.length === 64) {
          if (verifyUserToken(parsedId, headerToken)) {
            const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedId));
            if (dbUser) userId = dbUser.id;
          }
        }
      }
      if (!userId) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      const userNotifications = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.sentAt));
      res.json({ success: true, notifications: userNotifications });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/notifications/user/:userId", async (req, res) => {
    try {
      const requestedId = parseInt(req.params.userId);
      const sessionUserId = req.session?.userId;
      const isAdmin = req.session?.adminLoggedIn;
      if (!isAdmin && sessionUserId !== requestedId) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
      const userNotifications = await db.select().from(notifications).where(eq(notifications.userId, requestedId)).orderBy(desc(notifications.sentAt));
      res.json({ success: true, notifications: userNotifications });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
  const ADMIN_USER = (process.env.ADMIN_USERNAME || "admin").trim();
  const ADMIN_PASS = (process.env.ADMIN_PASSWORD || "").trim();
  console.log(`[Admin] Username configured: "${ADMIN_USER}" | Password set: ${!!ADMIN_PASS}`);
  function requireAdminAuth(req, res, next) {
    if (req.session && req.session.adminLoggedIn) return next();
    return res.redirect("/admin/login");
  }
  const loginPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login \u2014 Al Burhan Tours</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #065f46 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 20px; padding: 40px; width: 100%; max-width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .logo { text-align: center; margin-bottom: 28px; }
    .logo h1 { color: #047857; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
    .logo p { color: #6b7280; font-size: 13px; margin-top: 4px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    input { width: 100%; padding: 11px 14px; border: 1.5px solid #d1d5db; border-radius: 10px; font-size: 14px; outline: none; transition: border-color 0.2s; margin-bottom: 16px; }
    input:focus { border-color: #047857; box-shadow: 0 0 0 3px rgba(4,120,87,0.1); }
    button { width: 100%; padding: 12px; background: linear-gradient(135deg, #047857, #059669); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 4px; }
    button:hover { background: linear-gradient(135deg, #065f46, #047857); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(4,120,87,0.35); }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
    .badge { display: block; text-align: center; color: #d97706; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>AL BURHAN TOURS & TRAVELS</h1>
      <p>Hajj &amp; Umrah Specialists</p>
    </div>
    <span class="badge">Admin Portal</span>
    {{ERROR}}
    <form method="POST" action="/admin/login">
      <label>Username</label>
      <input type="text" name="username" required autocomplete="username" placeholder="Enter username">
      <label>Password</label>
      <input type="password" name="password" required autocomplete="current-password" placeholder="Enter password">
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
  app2.get("/admin/login", (req, res) => {
    if (req.session && req.session.adminLoggedIn) return res.redirect("/admin");
    res.send(loginPageHtml.replace("{{ERROR}}", ""));
  });
  app2.post("/admin/login", (req, res) => {
    const { username, password } = req.body || {};
    console.log(`[Admin] Login attempt - username_match: ${username?.trim() === ADMIN_USER}, password_match: ${password?.trim() === ADMIN_PASS}, body_keys: ${Object.keys(req.body || {}).join(",")}`);
    if (!ADMIN_PASS) {
      return res.send(loginPageHtml.replace("{{ERROR}}", '<div class="error">Admin password not configured. Set the ADMIN_PASSWORD secret.</div>'));
    }
    if (username?.trim() === ADMIN_USER && password?.trim() === ADMIN_PASS) {
      req.session.adminLoggedIn = true;
      return res.redirect("/admin");
    }
    res.send(loginPageHtml.replace("{{ERROR}}", '<div class="error">Invalid username or password.</div>'));
  });
  app2.post("/api/admin/test-whatsapp", async (req, res) => {
    try {
      const { phone, template } = req.body;
      if (!phone || !template) {
        return res.status(400).json({ success: false, error: "phone and template are required" });
      }
      const otp = "123456";
      const testInvoiceUrl = `https://al-burhan-tours-and-travels.replit.app/i/test`;
      let result;
      if (template === "otp") {
        result = await sendWhatsAppTemplate(phone, "alburhan_login_otp", "en_US", [
          { type: "body", parameters: [{ type: "text", text: otp }] },
          { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: otp }] }
        ]);
      } else if (template === "booking") {
        result = await sendWhatsAppTemplate(phone, "booking", "en_GB", [
          { type: "header", parameters: [{ type: "image", image: { link: WHATSAPP_HEADER_IMAGE } }] },
          { type: "body", parameters: [{ type: "text", text: "Test Customer" }] }
        ]);
      } else if (template === "conformation") {
        result = await sendWhatsAppTemplate(phone, "conformation", "en_GB", [
          { type: "body", parameters: [
            { type: "text", text: "Test Customer" },
            { type: "text", text: "Hajj Package 2025" },
            { type: "text", text: "\u20B910,000" },
            { type: "text", text: testInvoiceUrl }
          ] }
        ]);
      } else {
        return res.status(400).json({ success: false, error: `Unknown template: ${template}. Use otp, booking, or conformation` });
      }
      console.log(`[Admin WhatsApp Test] template=${template} phone=${phone} success=${result.success}`);
      res.json({ success: result.success, raw: result.raw });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.post("/api/admin/test-push", async (req, res) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Admin authentication required" });
    }
    const { userId, expoPushToken: rawToken } = req.body;
    if (!userId && !rawToken) {
      return res.status(400).json({ success: false, error: "Provide userId (to use stored token) or expoPushToken" });
    }
    try {
      if (userId) {
        const result = await sendPushToUser(db, userId, {
          title: "Test Notification",
          body: "Hello from Al Burhan! Push is working \u2705",
          data: { screen: "/(tabs)/notifications", type: "test" }
        }, void 0, { skipDedup: true });
        const total = result.expoSent + result.fcmSent;
        console.log(`[Admin TestPush] userId=${userId} expo=${result.expoSent} fcm=${result.fcmSent} fcmFailed=${result.fcmFailed} skipped=${result.skipped} skipReason=${result.skipReason ?? "n/a"} errors=${result.errorCodes.join(",") || "none"}`);
        if (result.skipped && result.skipReason === "no_token") {
          return res.status(404).json({ success: false, error: `No push token registered for userId=${userId}. The user must open the app and allow notifications.` });
        }
        if (total === 0) {
          const errMsg = result.errorCodes.length > 0 ? result.errorCodes.join(", ") : "Push delivery failed \u2014 token found but Expo API returned an error";
          return res.status(200).json({ success: false, error: errMsg, expoSent: 0, fcmSent: 0, fcmFailed: result.fcmFailed });
        }
        res.json({ success: true, expoSent: result.expoSent, fcmSent: result.fcmSent, fcmFailed: result.fcmFailed, raw: { status: "ok" } });
      } else {
        const resolvedToken = rawToken;
        const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            to: resolvedToken,
            sound: "default",
            channelId: "alburhan-push",
            priority: "high",
            title: "Test Notification",
            body: "Hello from Al Burhan!"
          })
        });
        const expoData = await expoRes.json();
        console.log(`[Admin TestPush] manual token=...${resolvedToken.slice(-8)} status=${expoData?.data?.status}`);
        if (!expoRes.ok) {
          return res.status(502).json({ success: false, error: "Expo Push API error", raw: expoData });
        }
        const delivered = expoData?.data?.status !== "error";
        res.json({ success: delivered, token: "..." + resolvedToken.slice(-8), raw: expoData });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  const OPERATIONAL_NOTIFICATION_TYPES = {
    flight: { title: "\u2708\uFE0F Flight Update", body: "Your flight schedule has been updated. Check details now.", screen: "BookingDetails" },
    travel_reminder: { title: "\u{1F9F3} Travel Reminder", body: "Your journey is coming soon. Please be ready with documents.", screen: "BookingDetails" },
    meena: { title: "\u{1F54B} Meena Update", body: "You have reached Meena. Follow group instructions.", screen: "Updates" },
    madinah: { title: "\u{1F54C} Welcome to Madinah", body: "You have arrived in Madinah. Stay blessed.", screen: "Updates" },
    ziyarat: { title: "\u{1F68C} Ziyarat Schedule", body: "Your Ziyarat trip is scheduled. Be ready on time.", screen: "Schedule" },
    laundry: { title: "\u{1F9FA} Laundry Ready", body: "Your laundry is ready for pickup.", screen: "Services" },
    food: { title: "\u{1F37D}\uFE0F Food Ready", body: "Your meal is ready. Please collect now.", screen: "Services" }
  };
  app2.post("/api/admin/send-operational-notification", async (req, res) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Admin authentication required" });
    }
    const { type, userId, broadcastAll, groupId, bookingId } = req.body;
    if (!type || !OPERATIONAL_NOTIFICATION_TYPES[type]) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Must be one of: ${Object.keys(OPERATIONAL_NOTIFICATION_TYPES).join(", ")}`
      });
    }
    if (!broadcastAll && !userId && !groupId) {
      return res.status(400).json({ success: false, error: "Either userId, groupId, or broadcastAll:true is required" });
    }
    const { title, body, screen } = OPERATIONAL_NOTIFICATION_TYPES[type];
    const data = { type, screen };
    if (bookingId) data.bookingId = String(bookingId);
    try {
      if (broadcastAll) {
        const { sentUserIds, fcmSent, fcmFailed, totalRetries, errorCodes } = await broadcastPush(db, { title, body, data }, { type, message: body });
        console.log(`[Admin Operational] broadcast type=${type} fcm=${fcmSent} fcmFailed=${fcmFailed} retries=${totalRetries}`);
        const broadcastErrMsg = errorCodes.length > 0 ? errorCodes.join(", ") : void 0;
        const allUsers = await db.select({ id: users.id }).from(users);
        for (const u of allUsers) {
          const pushed = sentUserIds.has(u.id);
          const isDup = await isNotifDuplicate(db, u.id, type, body);
          if (!isDup) {
            await db.insert(notifications).values({
              userId: u.id,
              title,
              type,
              channel: "push",
              message: body,
              status: pushed ? "sent" : "failed",
              retryCount: pushed ? 0 : totalRetries,
              ...!pushed && broadcastErrMsg ? { errorMessage: broadcastErrMsg } : {}
            });
          }
        }
        return res.json({ success: true, broadcast: true, fcmSent, fcmFailed, sentCount: sentUserIds.size, totalRetries });
      } else if (groupId) {
        const members = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, Number(groupId)));
        if (members.length === 0) return res.json({ success: true, group: true, groupId, sent: 0, message: "Group has no members" });
        let totalExpo = 0, totalFcm = 0, totalFailed = 0, skipped = 0, totalRetries = 0;
        for (const m of members) {
          const r = await sendPushToUser(db, m.userId, { title, body, data });
          if (r.skipped) {
            skipped++;
            continue;
          }
          totalExpo += r.expoSent;
          totalFcm += r.fcmSent;
          totalFailed += r.fcmFailed;
          totalRetries += r.totalRetries;
          const delivered = r.expoSent + r.fcmSent > 0;
          const errMsg = !delivered && r.errorCodes.length > 0 ? r.errorCodes.join(", ") : void 0;
          await db.insert(notifications).values({
            userId: m.userId,
            title,
            type,
            channel: "push",
            message: body,
            status: delivered ? "sent" : "failed",
            retryCount: r.totalRetries,
            ...errMsg ? { errorMessage: errMsg } : {}
          });
        }
        console.log(`[Admin Operational] group groupId=${groupId} type=${type} targets=${members.length} expo=${totalExpo} fcm=${totalFcm} failed=${totalFailed} skipped=${skipped} retries=${totalRetries}`);
        return res.json({ success: true, group: true, groupId, sent: members.length - skipped, skipped, expoSent: totalExpo, fcmSent: totalFcm, fcmFailed: totalFailed, totalRetries });
      } else {
        const result = await sendPushToUser(db, Number(userId), { title, body, data });
        const totalSent = result.expoSent + result.fcmSent;
        console.log(`[Admin Operational] userId=${userId} type=${type} expo=${result.expoSent} fcm=${result.fcmSent} fcmFailed=${result.fcmFailed} skipped=${result.skipped} skipReason=${result.skipReason ?? "n/a"} errors=${result.errorCodes.join(",") || "none"}`);
        if (result.skipped && result.skipReason === "no_token") {
          return res.status(404).json({ success: false, error: `No push token found for userId=${userId}. User must open the app and allow notifications.` });
        }
        if (result.skipped && result.skipReason === "dedup") {
          return res.json({ success: false, error: "Duplicate: same notification sent in the last 24 hours." });
        }
        const delivered = totalSent > 0;
        const errMsg = !delivered && result.errorCodes.length > 0 ? result.errorCodes.join(", ") : void 0;
        await db.insert(notifications).values({
          userId: Number(userId),
          title,
          type,
          channel: "push",
          message: body,
          status: delivered ? "sent" : "failed",
          retryCount: result.totalRetries,
          ...errMsg ? { errorMessage: errMsg } : {}
        });
        return res.json({ success: delivered, expoSent: result.expoSent, fcmSent: result.fcmSent, fcmFailed: result.fcmFailed, totalRetries: result.totalRetries });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/admin/send-push-to-user", async (req, res) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Admin authentication required" });
    }
    const { userId, title, message, image } = req.body;
    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, error: "userId, title, and message are required" });
    }
    try {
      const result = await sendPushToUser(db, Number(userId), {
        title,
        body: message,
        data: { screen: "/notifications", type: "admin_manual" },
        ...image ? { imageUrl: image } : {}
      });
      const totalSent = result.expoSent + result.fcmSent;
      console.log(`[Admin SendPush] userId=${userId} title="${title}" expo=${result.expoSent} fcm=${result.fcmSent} fcmFailed=${result.fcmFailed} skipped=${result.skipped} skipReason=${result.skipReason ?? "n/a"} errors=${result.errorCodes.join(",") || "none"}`);
      if (result.skipped && result.skipReason === "no_token") {
        return res.status(404).json({ success: false, error: `No push token found for userId=${userId}. User must open the app and allow notifications.` });
      }
      if (result.skipped && result.skipReason === "dedup") {
        return res.json({ success: false, error: "Duplicate: same notification sent within the last 24 hours. Try a different message or wait." });
      }
      if (totalSent === 0) {
        const errMsg = result.errorCodes.length > 0 ? result.errorCodes.join(", ") : "Push delivery failed";
        return res.status(200).json({ success: false, error: errMsg, expoSent: 0, fcmSent: 0, fcmFailed: result.fcmFailed });
      }
      res.json({ success: true, expoSent: result.expoSent, fcmSent: result.fcmSent, fcmFailed: result.fcmFailed, tokenCount: totalSent });
    } catch (err) {
      const e = err;
      res.status(500).json({ success: false, error: e.message });
    }
  });
  app2.get("/api/admin/groups", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    try {
      const allGroups = await db.select().from(groups).orderBy(desc(groups.createdAt));
      const memberCounts = await db.select({ groupId: groupMembers.groupId, count: sql2`count(*)::int` }).from(groupMembers).groupBy(groupMembers.groupId);
      const countMap = Object.fromEntries(memberCounts.map((r) => [r.groupId, r.count]));
      res.json({ success: true, groups: allGroups.map((g) => ({ ...g, memberCount: countMap[g.id] ?? 0 })) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/admin/groups", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: "Group name is required" });
    try {
      const [group] = await db.insert(groups).values({ name: name.trim(), description: description?.trim() || null }).returning();
      res.json({ success: true, group });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.delete("/api/admin/groups/:id", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    try {
      await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
      await db.delete(groups).where(eq(groups.id, groupId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/admin/groups/:id/members", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    try {
      const members = await db.select({ id: groupMembers.id, userId: groupMembers.userId, addedAt: groupMembers.addedAt, name: users.name, email: users.email, phone: users.phone }).from(groupMembers).innerJoin(users, eq(groupMembers.userId, users.id)).where(eq(groupMembers.groupId, groupId)).orderBy(groupMembers.addedAt);
      res.json({ success: true, members });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/admin/groups/:id/members", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
    try {
      const existing = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, Number(userId))));
      if (existing.length > 0) return res.status(409).json({ success: false, error: "User is already in this group" });
      const [member] = await db.insert(groupMembers).values({ groupId, userId: Number(userId) }).returning();
      res.json({ success: true, member });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.delete("/api/admin/groups/:id/members/:userId", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    const userId = Number(req.params.userId);
    try {
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/admin/send-notification", async (req, res) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const {
      type,
      title,
      message,
      targetType,
      // 'user' | 'group' | 'all'
      userId,
      groupId,
      bookingStatus,
      // optional filter
      bookingId,
      // optional: resolve user from booking
      imageUrl
      // optional: image URL for rich push notification
    } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, error: "title and message are required" });
    if (!bookingId && targetType !== void 0 && !["user", "group", "all"].includes(targetType)) {
      return res.status(400).json({ success: false, error: `Invalid targetType "${targetType}". Must be one of: user, group, all` });
    }
    const notifType = type || "admin_manual";
    const screen = notifType in OPERATIONAL_NOTIFICATION_TYPES ? OPERATIONAL_NOTIFICATION_TYPES[notifType].screen : "Notifications";
    const data = { type: notifType, screen };
    if (bookingId) data.bookingId = String(bookingId);
    try {
      let buildNotifValues2 = function(uid, r, bkId) {
        const delivered = r.expoSent + r.fcmSent > 0;
        const errMsg = !delivered && r.errorCodes.length > 0 ? r.errorCodes.join(", ") : void 0;
        return {
          userId: uid,
          ...bkId ? { bookingId: bkId } : {},
          title,
          type: notifType,
          channel: "push",
          message,
          status: delivered ? "sent" : "failed",
          retryCount: r.totalRetries,
          ...errMsg ? { errorMessage: errMsg } : {},
          metadata: { push: r.expoSent + r.fcmSent > 0, ...imageUrl ? { imageUrl } : {} }
        };
      };
      var buildNotifValues = buildNotifValues2;
      async function filterByStatus(userIds, status) {
        if (!status) return userIds;
        const matchingBookings = await db.select({ userId: bookings.userId }).from(bookings).where(and(inArray(bookings.userId, userIds), eq(bookings.status, status)));
        const matchingIds = new Set(matchingBookings.map((b) => b.userId));
        return userIds.filter((id) => matchingIds.has(id));
      }
      if (bookingId) {
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, Number(bookingId)));
        if (!booking) return res.status(404).json({ success: false, error: `Booking #${bookingId} not found` });
        if (bookingStatus && booking.status !== bookingStatus) {
          return res.status(400).json({ success: false, error: `Booking #${bookingId} has status "${booking.status}", not "${bookingStatus}"` });
        }
        const result = await sendPushToUser(db, booking.userId, { title, body: message, data, ...imageUrl ? { imageUrl } : {} });
        if (!result.skipped) {
          await db.insert(notifications).values(buildNotifValues2(booking.userId, result, Number(bookingId)));
        }
        const delivered = result.expoSent + result.fcmSent > 0;
        return res.json({
          success: delivered,
          targeted: "booking",
          bookingId,
          userId: booking.userId,
          ...result,
          ...result.skipReason === "no_token" ? { error: "No device token registered for this user" } : {}
        });
      }
      if (targetType === "user") {
        if (!userId) return res.status(400).json({ success: false, error: "userId is required for targetType=user" });
        const uid = Number(userId);
        const result = await sendPushToUser(db, uid, { title, body: message, data, ...imageUrl ? { imageUrl } : {} });
        if (!result.skipped) {
          await db.insert(notifications).values(buildNotifValues2(uid, result));
        }
        const delivered = result.expoSent + result.fcmSent > 0;
        return res.json({
          success: delivered,
          targeted: "user",
          userId,
          ...result,
          ...result.skipReason === "no_token" ? { error: "No device token registered for this user" } : {}
        });
      }
      if (targetType === "group") {
        if (!groupId) return res.status(400).json({ success: false, error: "groupId is required for targetType=group" });
        const members = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, Number(groupId)));
        if (members.length === 0) return res.json({ success: true, targeted: "group", groupId, sent: 0, message: "Group has no members" });
        let targetIds = members.map((m) => m.userId).filter((id) => id !== null);
        if (bookingStatus) targetIds = await filterByStatus(targetIds, bookingStatus);
        if (targetIds.length === 0) return res.json({ success: true, targeted: "group", groupId, sent: 0, message: "No members match the booking status filter" });
        let totalExpo2 = 0, totalFcm2 = 0, totalFailed2 = 0, skipped2 = 0;
        for (const uid of targetIds) {
          const r = await sendPushToUser(db, uid, { title, body: message, data, ...imageUrl ? { imageUrl } : {} });
          if (r.skipped) {
            skipped2++;
            continue;
          }
          totalExpo2 += r.expoSent;
          totalFcm2 += r.fcmSent;
          totalFailed2 += r.fcmFailed;
          await db.insert(notifications).values(buildNotifValues2(uid, r));
        }
        console.log(`[Notify Group] groupId=${groupId} targets=${targetIds.length} expo=${totalExpo2} fcm=${totalFcm2} failed=${totalFailed2} skipped=${skipped2}`);
        return res.json({ success: true, targeted: "group", groupId, sent: targetIds.length - skipped2, skipped: skipped2, expoSent: totalExpo2, fcmSent: totalFcm2, fcmFailed: totalFailed2 });
      }
      let allUserIds = (await db.select({ id: users.id }).from(users)).map((u) => u.id);
      if (bookingStatus) allUserIds = await filterByStatus(allUserIds, bookingStatus);
      if (allUserIds.length === 0) return res.json({ success: true, targeted: "all", sent: 0, message: "No users match the booking status filter" });
      let totalExpo = 0, totalFcm = 0, totalFailed = 0, skipped = 0;
      for (const uid of allUserIds) {
        const r = await sendPushToUser(db, uid, { title, body: message, data, ...imageUrl ? { imageUrl } : {} });
        if (r.skipped) {
          skipped++;
          continue;
        }
        totalExpo += r.expoSent;
        totalFcm += r.fcmSent;
        totalFailed += r.fcmFailed;
        await db.insert(notifications).values(buildNotifValues2(uid, r));
      }
      console.log(`[Notify Broadcast] targets=${allUserIds.length} sent=${allUserIds.length - skipped} skipped=${skipped} expo=${totalExpo} fcm=${totalFcm} failed=${totalFailed}${bookingStatus ? ` filter=${bookingStatus}` : ""}`);
      return res.json({ success: true, targeted: "all", sent: allUserIds.length - skipped, skipped, expoSent: totalExpo, fcmSent: totalFcm, fcmFailed: totalFailed });
    } catch (err) {
      console.error("[Notify] Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
  });
  app2.get("/admin", requireAdminAuth, (req, res) => {
    const templatePath = join(process.cwd(), "server", "templates", "admin-dashboard.html");
    if (existsSync(templatePath)) {
      try {
        let html = readFileSync(templatePath, "utf-8");
        let firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "";
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            firebaseProjectId = sa.project_id || firebaseProjectId;
          } catch (_) {
          }
        }
        html = html.replace(/\{\{FIREBASE_PROJECT_ID\}\}/g, firebaseProjectId);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
      } catch (_) {
        res.sendFile(templatePath);
      }
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  });
  const serveTemplate = (templateName) => (req, res) => {
    const templatePath = join(process.cwd(), "server", "templates", templateName);
    if (existsSync(templatePath)) {
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
  app2.get("/a", (req, res) => {
    const ua = req.headers["user-agent"] || "";
    if (/android/i.test(ua)) {
      res.redirect("https://play.google.com/store/apps/details?id=com.alburhantours.app");
    } else {
      res.redirect("https://apps.apple.com/app/id6760983020");
    }
  });
  app2.get("/support", (req, res) => {
    res.send(`
    <html>
    <head>
      <title>Support - Al Burhan Tours & Travels</title>
      <style>
        body { font-family: Arial; padding: 20px; line-height: 1.6; }
        h1 { color: #2c3e50; }
        .box { margin-top: 20px; padding: 15px; background: #f4f4f4; border-radius: 8px; }
      </style>
    </head>
    <body>

    <h1>Customer Support</h1>

    <p>Welcome to Al Burhan Tours & Travels support. We are here to assist you with your Hajj, Umrah, and travel bookings.</p>

    <div class="box">
      <h2>\u{1F4DE} Contact Information</h2>
      <p><strong>Phone:</strong> +91 9893225590</p>
      <p><strong>Email:</strong> info@alburhantravels.com</p>
      <p><strong>Address:</strong><br>
      8-5, Khanka Masjid Complex,<br>
      Lalbagh Rd, Burhanpur,<br>
      Madhya Pradesh 450331</p>
    </div>

    <div class="box">
      <h2>\u{1F552} Working Hours</h2>
      <p>Monday - Saturday: 10:00 AM \u2013 7:00 PM</p>
      <p>Sunday: Closed</p>
    </div>

    <div class="box">
      <h2>\u{1F4AC} Quick Help</h2>
      <p>For faster assistance, contact us via WhatsApp or call directly.</p>
    </div>

    </body>
    </html>
    `);
  });
  app2.post("/api/user/device-token", async (req, res) => {
    let effectiveUserId = req.session?.userId;
    let authSource = "session";
    if (!effectiveUserId) {
      const headerUserId = req.headers["x-user-id"];
      const headerToken = req.headers["x-user-token"];
      const parsedHeaderId = headerUserId !== void 0 ? Number(headerUserId) : NaN;
      if (Number.isInteger(parsedHeaderId) && parsedHeaderId > 0 && typeof headerToken === "string") {
        if (headerToken.length === 64 && verifyUserToken(parsedHeaderId, headerToken)) {
          const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedHeaderId));
          if (dbUser) {
            effectiveUserId = dbUser.id;
            authSource = "header";
          }
        }
      }
    }
    if (!effectiveUserId) {
      const rawBodyId = req.body?.userId;
      const bodyToken = req.body?.userToken;
      const parsedBodyId = rawBodyId !== void 0 ? Number(rawBodyId) : NaN;
      if (Number.isInteger(parsedBodyId) && parsedBodyId > 0) {
        if (typeof bodyToken !== "string" || bodyToken.length !== 64 || !verifyUserToken(parsedBodyId, bodyToken)) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedBodyId));
        if (!dbUser) return res.status(401).json({ success: false, error: "Not authenticated" });
        effectiveUserId = dbUser.id;
        authSource = "body";
      }
    }
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const { token, platform, expoPushToken: bodyExpoPushToken } = req.body;
      if (!platform) {
        return res.status(400).json({ success: false, error: "platform is required" });
      }
      const hasFcmToken = typeof token === "string" && token.length > 0 && !token.startsWith("ExponentPushToken");
      const hasExpoPushToken = typeof bodyExpoPushToken === "string" && bodyExpoPushToken.startsWith("ExponentPushToken");
      if (!hasFcmToken && !hasExpoPushToken) {
        console.warn(`[DeviceToken] Rejected \u2014 no valid token in request for userId=${effectiveUserId} (token=${String(token ?? "").slice(0, 20)}, expoPushToken=${String(bodyExpoPushToken ?? "").slice(0, 20)})`);
        return res.status(400).json({ success: false, error: "At least one valid token (FCM or Expo push) is required" });
      }
      await db.insert(deviceTokens).values({
        userId: effectiveUserId,
        token: hasFcmToken ? token : "",
        platform,
        expoPushToken: hasExpoPushToken ? bodyExpoPushToken : null
      }).onConflictDoUpdate({
        target: [deviceTokens.userId, deviceTokens.platform],
        set: {
          ...hasFcmToken ? { token } : {},
          ...hasExpoPushToken ? { expoPushToken: bodyExpoPushToken } : {},
          isInvalid: false,
          invalidReason: null,
          updatedAt: /* @__PURE__ */ new Date()
        }
      });
      if (hasExpoPushToken) {
        console.log(`[DeviceToken] Saved: ${effectiveUserId} ${bodyExpoPushToken}`);
      }
      if (hasFcmToken) {
        console.log(`[DeviceToken] Saved FCM: ${effectiveUserId} ${token.slice(0, 20)}... (auth=${authSource})`);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[DeviceToken] Register error:", error);
      res.status(500).json({ success: false, error: "Failed to register device token" });
    }
  });
  app2.delete("/api/user/device-token", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, error: "token is required" });
      await db.delete(deviceTokens).where(
        and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token))
      );
      res.json({ success: true });
    } catch (error) {
      console.error("[DeviceToken] Unregister error:", error);
      res.status(500).json({ success: false, error: "Failed to unregister device token" });
    }
  });
  app2.get("/api/admin/device-tokens", async (req, res) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      const rows = await db.select({
        platform: deviceTokens.platform,
        count: sql2`count(*)`
      }).from(deviceTokens).groupBy(deviceTokens.platform);
      const total = rows.reduce((acc, r) => acc + Number(r.count), 0);
      res.json({ success: true, byPlatform: rows, total });
    } catch (error) {
      console.error("[DeviceToken] Admin fetch error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch token stats" });
    }
  });
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
      logger: void 0
    });
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      if (req.path === "/admin" || req.path.startsWith("/admin/") || req.path.startsWith("/invoice/") || req.path.startsWith("/i/") || req.path === "/privacy-policy" || req.path === "/terms-and-conditions" || req.path === "/refund-policy" || req.path === "/delete-account") {
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
        return metroProxy(req, res, next);
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
  app.set("trust proxy", 1);
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is not set. Please add it to your secrets.");
  }
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1e3
    }
  }));
  app.use("/admin", express.urlencoded({ extended: false }));
  const metroProxy = configureExpoAndLanding(app);
  registerChatRoutes(app);
  const server = await registerRoutes(app);
  const { initFirebaseEager: initFirebaseEager2 } = await Promise.resolve().then(() => (init_firebase(), firebase_exports));
  initFirebaseEager2();
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
  warmupDb().catch((err) => {
    console.warn("[DB] Warmup failed:", err?.message);
  });
  if (metroProxy) {
    server.on("upgrade", (req, socket, head) => {
      if (!req.url?.startsWith("/api")) {
        metroProxy.upgrade(req, socket, head);
      }
    });
    log("WebSocket proxy to Metro enabled");
  }
})();
