import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { db } from "./db";
import { users, packages, bookings, payments, notifications, documents } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import { Client as ObjectStorageClient } from "@replit/object-storage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

let storageClient: ObjectStorageClient | null = null;
function getStorageClient(): ObjectStorageClient | null {
  if (storageClient) return storageClient;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;
  storageClient = new ObjectStorageClient({ bucketId });
  return storageClient;
}

const otpStore = new Map<string, { otp: string; expiresAt: number }>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendSmsFast2SMS(phone: string, message: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS] API key not configured, skipping SMS");
    return false;
  }
  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${encodeURIComponent(message)}&language=english&flash=0&numbers=${phone}`;
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    console.log("[Fast2SMS] Response:", JSON.stringify(data));
    return data.return === true;
  } catch (error) {
    console.error("[Fast2SMS] Error:", error);
    return false;
  }
}

async function sendWhatsAppBotBee(phone: string, message: string): Promise<boolean> {
  const apiKey = process.env.BOTBEE_API_TOKEN || process.env.BOTBEE_WHATSAPP_API_KEY;
  if (!apiKey) {
    console.log("[BotBee] API key not configured, skipping WhatsApp");
    return false;
  }
  const phoneNumberId = process.env.BOTBEE_PHONE_NUMBER_ID || "965912196611113";
  const phoneNumber = phone.startsWith("91") ? phone : `91${phone}`;
  try {
    const formData = new URLSearchParams();
    formData.append("apiToken", apiKey);
    formData.append("phone_number_id", phoneNumberId);
    formData.append("phone_number", phoneNumber);
    formData.append("message", message);

    const response = await fetch("https://app.botbee.io/api/v1/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      console.log("[BotBee] Response:", JSON.stringify(data));
      if (data.status === "0" && data.message?.includes("24 hour")) {
        console.log("[BotBee] 24-hour window restriction - user needs to message the business first");
      }
      return data.status === "1";
    } catch {
      console.log("[BotBee] Non-JSON response:", text.substring(0, 200));
      return false;
    }
  } catch (error) {
    console.error("[BotBee] Error:", error);
    return false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, phone, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db.insert(users).values({
        name,
        email,
        phone,
        password: hashedPassword,
      }).returning();
      const { password: _, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
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
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const otp = generateOtp();
      otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
      const message = `Your AL BURHAN TOURS OTP is ${otp}. Valid for 5 minutes.`;
      const sent = await sendSmsFast2SMS(phone, message);
      console.log(`[OTP] Generated OTP ${otp} for phone ${phone}`);
      res.json({ success: true, message: sent ? "OTP sent via SMS" : "OTP generated (SMS delivery pending - check API key config)" });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/send-whatsapp-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const existing = otpStore.get(phone);
      let otp: string;
      if (existing && existing.expiresAt > Date.now()) {
        otp = existing.otp;
      } else {
        otp = generateOtp();
        otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
      }
      const message = `Your AL BURHAN TOURS OTP is ${otp}. Valid for 5 minutes.`;
      const whatsappSent = await sendWhatsAppBotBee(phone, message);
      if (!whatsappSent) {
        const smsSent = await sendSmsFast2SMS(phone, message);
        console.log(`[OTP] WhatsApp failed, SMS fallback ${smsSent ? "sent" : "also failed"} for ${phone}`);
        res.json({ success: true, message: smsSent ? "OTP sent via SMS (WhatsApp unavailable)" : "OTP sent to your phone" });
      } else {
        console.log(`[OTP] Sent OTP via WhatsApp to ${phone}`);
        res.json({ success: true, message: "OTP sent via WhatsApp" });
      }
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
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
        password: hashedPassword,
      }).returning();
      const { password: _, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/login-with-otp", async (req, res) => {
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
      otpStore.set(`login_${phone}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
      const message = `Your AL BURHAN TOURS login OTP is ${otp}. Valid for 5 minutes.`;
      const sent = await sendSmsFast2SMS(phone, message);
      await sendWhatsAppBotBee(phone, message);
      console.log(`[OTP] Login OTP ${otp} for phone ${phone}`);
      res.json({ success: true, message: "OTP sent" });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/verify-login-otp", async (req, res) => {
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
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/packages", async (req, res) => {
    try {
      const { type, minPrice, maxPrice } = req.query;
      let allPackages = await db.select().from(packages);
      let filtered = allPackages;
      if (type && type !== "all") {
        filtered = filtered.filter(p => p.type === type);
      }
      if (minPrice) {
        filtered = filtered.filter(p => parseFloat(p.price) >= parseFloat(minPrice as string));
      }
      if (maxPrice) {
        filtered = filtered.filter(p => parseFloat(p.price) <= parseFloat(maxPrice as string));
      }
      res.json({ success: true, packages: filtered });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/packages/:id", async (req, res) => {
    try {
      const [pkg] = await db.select().from(packages).where(eq(packages.id, parseInt(req.params.id)));
      if (!pkg) {
        return res.status(404).json({ success: false, error: "Package not found" });
      }
      res.json({ success: true, package: pkg });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const bookingData = req.body;
      const [booking] = await db.insert(bookings).values({
        ...bookingData,
        status: "pending",
        paymentStatus: "pending",
        paidAmount: "0",
      }).returning();
      try {
        await sendNotifications(booking.userId, booking.id, "booking_created");
      } catch (e) {
        console.error("Notification error:", e);
      }
      res.json({ success: true, booking });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/bookings/user/:userId", async (req, res) => {
    try {
      const userBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.userId, parseInt(req.params.userId)))
        .orderBy(desc(bookings.bookingDate));
      res.json({ success: true, bookings: userBookings });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/bookings/:id", async (req, res) => {
    try {
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, parseInt(req.params.id)));
      if (!booking) {
        return res.status(404).json({ success: false, error: "Booking not found" });
      }
      res.json({ success: true, booking });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/payments/create-order", async (req, res) => {
    try {
      const { bookingId, amount } = req.body;
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        return res.status(500).json({ success: false, error: "Payment gateway not configured. Please contact support." });
      }

      const amountInPaise = Math.round(parseFloat(amount) * 100);
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: `booking_${bookingId}`,
        }),
      });

      const order = await response.json();
      if (!response.ok) {
        console.error("[Razorpay] Order creation failed:", order);
        return res.status(400).json({ success: false, error: order.error?.description || "Failed to create Razorpay order" });
      }

      console.log("[Razorpay] Order created:", order.id);
      res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency, keyId });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    try {
      const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;

      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) {
        return res.status(500).json({ success: false, error: "Payment verification unavailable. Server configuration error." });
      }
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ success: false, error: "Missing payment details for verification." });
      }
      const expectedSignature = createHmac("sha256", keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");
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
        razorpaySignature,
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
        updatedAt: new Date(),
      }).where(eq(bookings.id, parseInt(bookingId)));
      try {
        await sendNotifications(booking.userId, booking.id, "payment_success");
      } catch (e) {
        console.error("Notification error:", e);
      }
      res.json({ success: true, payment });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "pdf", "doc", "docx"]);

  app.post("/api/documents/upload", upload.single("file"), async (req: any, res) => {
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
        fileUrl,
      }).returning();
      res.json({ success: true, document });
    } catch (error: any) {
      console.error("[Upload] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/files/public/documents/:userId/:filename", async (req, res) => {
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
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        pdf: "application/pdf", doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${req.params.filename}"`);
      res.send(Buffer.from(result.value));
    } catch (error: any) {
      console.error("[Files] Download error:", error);
      res.status(500).json({ error: "Could not retrieve file" });
    }
  });

  app.get("/api/documents/user/:userId", async (req, res) => {
    try {
      const userDocuments = await db
        .select()
        .from(documents)
        .where(eq(documents.userId, parseInt(req.params.userId)));
      res.json({ success: true, documents: userDocuments });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/seed", async (req, res) => {
    try {
      const existingPackages = await db.select().from(packages);
      if (existingPackages.length > 0) {
        return res.json({ success: true, message: "Data already seeded", packages: existingPackages });
      }
      const seededPackages = await db.insert(packages).values([
        {
          type: "umrah",
          name: "Premium Umrah Package - 14 Days",
          description: "Experience a blessed journey with our premium Umrah package including 5-star accommodations near Haram.",
          duration: "14 Days / 13 Nights",
          price: "125000",
          inclusions: ["Return air tickets", "Visa processing", "5-star hotel near Haram", "Daily buffet breakfast", "Ziyarat tours", "Airport transfers", "Expert guide services"],
          exclusions: ["Personal expenses", "Travel insurance", "Additional meals"],
          hotelDetails: { makkah: { name: "Swissotel Makkah", rating: 5, distance: "200m from Haram" }, madinah: { name: "Madinah Hilton", rating: 5, distance: "100m from Masjid Nabawi" } },
          availableSeats: 40,
          departureDate: new Date("2027-04-15"),
          returnDate: new Date("2027-04-28"),
          featured: true,
        },
        {
          type: "hajj",
          name: "Hajj 2027 Standard Package",
          description: "Complete Hajj package with premium services and accommodations for a comfortable pilgrimage experience.",
          duration: "21 Days / 20 Nights",
          price: "450000",
          inclusions: ["Return air tickets", "Saudi visa", "Accommodation in Mina, Arafat, Muzdalifah", "4-star hotels in Makkah & Madinah", "All meals included", "Hajj training sessions", "Medical assistance", "Experienced Hajj guide"],
          exclusions: ["Travel insurance", "Qurbani", "Personal shopping"],
          hotelDetails: { makkah: { name: "Makkah Towers", rating: 4, distance: "500m from Haram" }, madinah: { name: "Al Aqeeq Hotel", rating: 4, distance: "300m from Masjid Nabawi" } },
          availableSeats: 50,
          departureDate: new Date("2027-06-10"),
          returnDate: new Date("2027-06-30"),
          featured: true,
        },
        {
          type: "umrah",
          name: "Economy Umrah Package - 7 Days",
          description: "Affordable Umrah package with comfortable 3-star accommodations for budget-conscious pilgrims.",
          duration: "7 Days / 6 Nights",
          price: "65000",
          inclusions: ["Return air tickets", "Umrah visa", "3-star hotel", "Daily breakfast", "Airport transfers", "Basic Ziyarat"],
          exclusions: ["Lunch and dinner", "Travel insurance", "Additional tours"],
          hotelDetails: { makkah: { name: "Al Safwah Hotel", rating: 3, distance: "1.2km from Haram" }, madinah: { name: "Madinah Inn", rating: 3, distance: "800m from Masjid Nabawi" } },
          availableSeats: 60,
          departureDate: new Date("2027-03-20"),
          returnDate: new Date("2027-03-26"),
          featured: false,
        },
        {
          type: "umrah",
          name: "Ramadan Umrah Special - 15 Days",
          description: "Special Ramadan Umrah package with premium accommodations and spiritual programs during the holy month.",
          duration: "15 Days / 14 Nights",
          price: "185000",
          inclusions: ["Return air tickets", "Umrah visa", "5-star hotel near Haram", "Iftar & Suhoor meals", "Ziyarat tours", "Airport transfers", "Taraweeh prayers at Haram"],
          exclusions: ["Personal expenses", "Travel insurance", "Shopping"],
          hotelDetails: { makkah: { name: "Pullman ZamZam Makkah", rating: 5, distance: "50m from Haram" }, madinah: { name: "Oberoi Madinah", rating: 5, distance: "200m from Masjid Nabawi" } },
          availableSeats: 30,
          departureDate: new Date("2027-03-01"),
          returnDate: new Date("2027-03-15"),
          featured: true,
        },
      ]).returning();
      res.json({ success: true, message: "Database seeded successfully", packages: seededPackages });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  async function sendNotifications(userId: number, bookingId: number, type: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return;
    let message = "";
    switch (type) {
      case "booking_created":
        message = `Assalamu Alaikum, Your booking #${bookingId} with AL BURHAN TOURS & TRAVELS has been created. Our team will contact you shortly.`;
        break;
      case "payment_success":
        message = `Assalamu Alaikum, Payment received for booking #${bookingId}. Your booking is now confirmed! JazakAllah Khair.`;
        break;
    }

    const whatsappResult = await sendWhatsAppBotBee(user.phone, message);
    console.log(`[WhatsApp/BotBee] To ${user.phone}: ${whatsappResult ? "sent" : "failed/skipped"}`);

    const smsResult = await sendSmsFast2SMS(user.phone, message);
    console.log(`[SMS/Fast2SMS] To ${user.phone}: ${smsResult ? "sent" : "failed/skipped"}`);

    await db.insert(notifications).values({
      userId,
      bookingId,
      type: "multi_channel",
      channel: "all",
      message,
      status: whatsappResult || smsResult ? "sent" : "pending",
    });
  }

  app.get("/api/admin/bookings", async (req, res) => {
    try {
      const allBookings = await db.select().from(bookings).orderBy(desc(bookings.bookingDate));
      res.json({ success: true, bookings: allBookings });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/customers", async (req, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt,
      }).from(users).orderBy(desc(users.createdAt));
      res.json({ success: true, customers: allUsers });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/payments", async (req, res) => {
    try {
      const allPayments = await db.select().from(payments).orderBy(desc(payments.paymentDate));
      res.json({ success: true, payments: allPayments });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/documents", async (req, res) => {
    try {
      const allDocs = await db.select({
        id: documents.id,
        userId: documents.userId,
        bookingId: documents.bookingId,
        type: documents.type,
        fileName: documents.fileName,
        fileUrl: documents.fileUrl,
        uploadedAt: documents.uploadedAt,
        userName: users.name,
      }).from(documents)
        .leftJoin(users, eq(documents.userId, users.id))
        .orderBy(desc(documents.uploadedAt));
      res.json({ success: true, documents: allDocs });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/stats", async (req, res) => {
    try {
      const allBookings = await db.select().from(bookings);
      const allUsers = await db.select().from(users);
      const allPayments = await db.select().from(payments);
      const allDocs = await db.select().from(documents);

      const totalRevenue = allPayments
        .filter(p => p.status === "success")
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

      const pendingBookings = allBookings.filter(b => b.status === "pending").length;
      const confirmedBookings = allBookings.filter(b => b.status === "confirmed").length;

      res.json({
        success: true,
        stats: {
          totalBookings: allBookings.length,
          totalCustomers: allUsers.length,
          totalRevenue,
          pendingBookings,
          confirmedBookings,
          totalPayments: allPayments.length,
          totalDocuments: allDocs.length,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/bookings/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ success: false, error: "Status is required" });
      }
      const [updated] = await db.update(bookings).set({
        status,
        updatedAt: new Date(),
      }).where(eq(bookings.id, parseInt(req.params.id))).returning();
      if (!updated) {
        return res.status(404).json({ success: false, error: "Booking not found" });
      }
      res.json({ success: true, booking: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/admin", (req, res) => {
    const templatePath = require("path").resolve(process.cwd(), "server", "templates", "admin-dashboard.html");
    const fs = require("fs");
    if (fs.existsSync(templatePath)) {
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
