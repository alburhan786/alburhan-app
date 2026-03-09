import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db";
import { users, packages, bookings, payments, notifications, documents } from "@shared/schema";
import { eq, desc, sql, sum } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import nodemailer from "nodemailer";

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

function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  return convert(Math.round(num)) + " Rupees Only";
}

function formatINR(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function generateInvoiceNumber(bookingId: number): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  return `ABTTH${yy}${mm}${bookingId.toString().padStart(2, "0")}`;
}

async function sendOtpSmsFast2SMS(phone: string, otpCode: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS] API key not configured, skipping OTP SMS");
    return false;
  }
  try {
    const dltUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=ALBURH&message=164844&variables_values=${otpCode}|&numbers=${phone}&flash=0`;
    const dltResponse = await fetch(dltUrl, { method: "GET" });
    const dltData = await dltResponse.json();
    console.log("[Fast2SMS DLT Route] Response:", JSON.stringify(dltData));
    if (dltData.return === true) {
      return true;
    }
    console.log("[Fast2SMS DLT Route] Failed:", dltData.message);
    return false;
  } catch (error) {
    console.error("[Fast2SMS] Error:", error);
    return false;
  }
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
  const apiKey = process.env.BOTBEE_API_KEY || process.env.BOTBEE_API_TOKEN || process.env.BOTBEE_WHATSAPP_API_KEY;
  if (!apiKey) {
    console.log("[BotBee] API key not configured, skipping WhatsApp");
    return false;
  }
  const phoneNumberId = process.env.BOTBEE_PHONE_NUMBER_ID || "965912196611113";
  const phoneNumber = phone.startsWith("91") ? phone : `91${phone}`;
  try {
    const response = await fetch("https://app.botbee.io/api/v1/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiToken: apiKey,
        phone_number_id: phoneNumberId,
        message: message,
        phone_number: phoneNumber,
      }),
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

async function sendEmail(to: string, subject: string, htmlBody: string): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("[Email] EMAIL_USER or EMAIL_PASS not configured, skipping email");
      return false;
    }
    await transporter.sendMail({
      from: `"AL BURHAN TOURS & TRAVELS" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlBody,
    });
    console.log(`[Email] Sent to ${to}`);
    return true;
  } catch (error) {
    console.error("[Email] Error:", error);
    return false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req, res) => {
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
      const sent = await sendOtpSmsFast2SMS(phone, otp);
      console.log(`[OTP] Generated OTP ${otp} for phone ${phone}, SMS sent: ${sent}`);
      if (!sent) {
        return res.status(500).json({ success: false, error: "Failed to send SMS. Please try WhatsApp or register directly with email." });
      }
      res.json({ success: true, message: "OTP sent via SMS" });
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
      const whatsappMessage = `Your AL BURHAN TOURS OTP is ${otp}. Valid for 5 minutes.`;
      const whatsappSent = await sendWhatsAppBotBee(phone, whatsappMessage);
      if (!whatsappSent) {
        const smsSent = await sendOtpSmsFast2SMS(phone, otp);
        console.log(`[OTP] WhatsApp failed, SMS fallback ${smsSent ? "sent" : "also failed"} for ${phone}`);
        if (!smsSent) {
          return res.status(500).json({ success: false, error: "Failed to send OTP via WhatsApp and SMS. Please register directly with email instead." });
        }
        res.json({ success: true, message: "OTP sent via SMS (WhatsApp unavailable)" });
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
      const whatsappMessage = `Your AL BURHAN TOURS login OTP is ${otp}. Valid for 5 minutes.`;
      const smsSent = await sendOtpSmsFast2SMS(phone, otp);
      const whatsappSent = await sendWhatsAppBotBee(phone, whatsappMessage);
      console.log(`[OTP] Login OTP ${otp} for phone ${phone}, SMS: ${smsSent}, WhatsApp: ${whatsappSent}`);
      if (!smsSent && !whatsappSent) {
        return res.status(500).json({ success: false, error: "Failed to send OTP. Please use email and password to sign in." });
      }
      const method = whatsappSent ? "WhatsApp" : "SMS";
      res.json({ success: true, message: `OTP sent via ${method}` });
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

  app.get("/invoice/:bookingId", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.bookingId);
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).send("Invoice not found");

      const [pkg] = await db.select().from(packages).where(eq(packages.id, booking.packageId));
      const [user] = await db.select().from(users).where(eq(users.id, booking.userId));

      const allPayments = await db.select().from(payments)
        .where(eq(payments.bookingId, bookingId));
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

      const bookingDate = booking.bookingDate ? new Date(booking.bookingDate) : new Date();
      const dueDate = new Date(bookingDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const serviceName = pkg ? `${pkg.type === 'hajj' ? 'Hajj' : 'Umrah'} - ${pkg.name}` : 'Tour Service';
      const roomLabel = booking.roomType || '';

      let serviceRows = '';
      for (let i = 0; i < numberOfPeople; i++) {
        const traveler = booking.travelers && booking.travelers[i];
        const travelerName = traveler ? traveler.name : `Person ${i + 1}`;
        serviceRows += `
          <tr>
            <td>${i + 1}</td>
            <td>
              <div class="service-name">${serviceName}</div>
              <div class="service-desc">${travelerName}${roomLabel ? ' | ' + roomLabel : ''}</div>
            </td>
            <td>998555</td>
            <td style="text-align:right">₹ ${formatINR(ratePerPerson)}</td>
            <td style="text-align:right">₹ ${formatINR(gstAmount / numberOfPeople)}</td>
            <td style="text-align:right">₹ ${formatINR(ratePerPerson + gstAmount / numberOfPeople)}</td>
          </tr>`;
      }

      const previousBalance = 0;
      const currentBalance = grandTotal - totalPaid;

      let template = readFileSync(join(__dirname, "templates", "invoice.html"), "utf-8");
      const replacements: Record<string, string> = {
        "{{INVOICE_NUMBER}}": invoiceNum,
        "{{INVOICE_DATE}}": bookingDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        "{{DUE_DATE}}": dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        "{{CUSTOMER_NAME}}": booking.contactName || user?.name || "",
        "{{CUSTOMER_ADDRESS}}": booking.address || "",
        "{{CUSTOMER_PHONE}}": booking.contactPhone || user?.phone || "",
        "{{CUSTOMER_EMAIL}}": booking.contactEmail || user?.email || "",
        "{{SERVICE_ROWS}}": serviceRows,
        "{{TCS_AMOUNT}}": `₹ ${formatINR(tcsAmount)}`,
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
        "{{SHARE_URL}}": encodeURIComponent(`https://${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/invoice/${bookingId}`),
      };

      for (const [key, value] of Object.entries(replacements)) {
        template = template.split(key).join(value);
      }

      res.send(template);
    } catch (error: any) {
      console.error("[Invoice] Error:", error);
      res.status(500).send("Error generating invoice");
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
          type: "umrah", name: "Premium Umrah Package", category: "Premium Umrah",
          description: "Premium Umrah experience with 3-star Azka Safa Hotel just 200 meters from Haram in Makkah and Rose Holiday Hotel 100 meters from Masjid Nabawi in Madinah. Weekly departures available. All packages exclude 5% GST.",
          duration: "14 Nights / 15 Days", price: "150000",
          roomPrices: { quad: 150000 },
          inclusions: ["Azka Safa Hotel Makkah (3 Star, 200m from Haram)", "Rose Holiday Hotel Madinah (3 Star, 100m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport Jeddah–Makkah–Madinah–Jeddah", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Azka Safa Hotel", rating: 3, distance: "200 meters from Haram" }, madinah: { name: "Rose Holiday Hotel", rating: 3, distance: "100 meters from Masjid Nabawi" } },
          flight: "Included", transport: "AC Bus Jeddah–Makkah–Madinah–Jeddah", food: "As per hotel",
          roomSharing: "4 Sharing",
          availableSeats: 50, departureDate: new Date("2026-04-01"), returnDate: new Date("2026-04-15"), featured: true,
        },
        {
          type: "umrah", name: "Economy Umrah Package", category: "Economy Umrah",
          description: "Affordable Umrah package with Durrat O Sallah Hotel (600m, 12 min walk from Haram) in Makkah and Guest Time Hotel (200m from Masjid Nabawi) in Madinah. 5-person sharing rooms. Departures every 15 days. All packages exclude 5% GST.",
          duration: "14 Nights / 15 Days", price: "90000",
          roomPrices: { "5_sharing": 90000 },
          inclusions: ["Durrat O Sallah Hotel Makkah (1 Star, 600m from Haram)", "Guest Time Hotel Madinah (2 Star, 200m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport Jeddah–Makkah–Madinah–Jeddah", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Durrat O Sallah", rating: 1, distance: "600 meters (12 minutes walk)" }, madinah: { name: "Guest Time Hotel", rating: 2, distance: "200 meters from Masjid Nabawi" } },
          flight: "Included", transport: "AC Bus Jeddah–Makkah–Madinah–Jeddah", food: "As per hotel",
          roomSharing: "5 Person Sharing",
          availableSeats: 80, departureDate: new Date("2026-04-01"), returnDate: new Date("2026-04-15"), featured: false,
        },
        {
          type: "umrah", name: "Ramadan Umrah Special – Last 20 Days", category: "Ramadan Umrah",
          description: "Special Ramadan Umrah package for the blessed last 20 days. Stay at Kayan Al Raya Hotel Ajiyad (500m from Haram) in Makkah and Arjwan Sada Hotel (300m from Masjid Nabawi) in Madinah. 4/5 sharing rooms. Departure: 28 January 2027. All packages exclude 5% GST.",
          duration: "20 Days", price: "140000",
          roomPrices: { "4_sharing": 140000, "5_sharing": 140000 },
          inclusions: ["Kayan Al Raya Hotel Ajiyad Makkah (1 Star, 500m from Haram)", "Arjwan Sada Hotel Madinah (300m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Kayan Al Raya Hotel Ajiyad", rating: 1, distance: "500 meters from Haram" }, madinah: { name: "Arjwan Sada Hotel", rating: 2, distance: "300 meters from Masjid Nabawi" } },
          flight: "Included", transport: "AC Bus", food: "As per hotel",
          roomSharing: "4 / 5 Sharing",
          availableSeats: 40, departureDate: new Date("2027-01-28"), returnDate: new Date("2027-02-17"), featured: true,
        },
        {
          type: "umrah", name: "Ramadan Umrah Full Month Package", category: "Ramadan Umrah",
          description: "Complete Ramadan experience – 32 days covering the full blessed month. 20 days in Makkah at Zohratu Sallah Hotel (600m from Haram) and 12 days in Madinah at Lulu Madinah Hotel (300m from Masjid Nabawi). Includes Sahoor, Iftar & Dinner meals, Akasa Air flight with 30 KG baggage + Zamzam. All packages exclude 5% GST.",
          duration: "32 Days", price: "180000",
          roomPrices: { "5_sharing": 180000, "6_sharing": 180000 },
          inclusions: ["Akasa Air Flight (30 KG + Zamzam)", "Zohratu Sallah Hotel Makkah (600m from Haram) – 20 Days", "Lulu Madinah Hotel (1 Star, 300m from Masjid Nabawi) – 12 Days", "Sahoor + Iftar + Dinner Meals", "AC Bus Jeddah–Makkah–Madinah–Jeddah", "Makkah Ziyarat", "Madinah Ziyarat", "Visa Processing", "Airport Transfers"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Zohratu Sallah Hotel Bir Balila Ajiyad", rating: 1, distance: "600 meters from Haram" }, madinah: { name: "Lulu Madinah Hotel", rating: 1, distance: "300 meters from Masjid Nabawi" } },
          flight: "Akasa Air (30 KG + Zamzam)", transport: "AC Bus Jeddah–Makkah–Madinah–Jeddah", food: "Sahoor + Iftar + Dinner",
          roomSharing: "5 / 6 Sharing",
          availableSeats: 40, departureDate: new Date("2027-01-09"), returnDate: new Date("2027-02-10"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Royal Elite", category: "Luxury Hajj Package",
          description: "The ultimate luxury Hajj experience with Clock Tower accommodation at 0 meters from Haram, VIP gypsum board tents with buffet meals, direct Saudi Airlines flight, and premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "1450000",
          roomPrices: { double: 1800000, triple: 1550000, quad: 1450000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Gypsum Board Tents (A/C) with Buffet Meals", "Luxury A/C Buses", "Clock Tower (Abraj Al Bait) Makkah Hotel", "3 Nights Madinah Stay", "Full Board Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Clock Tower (Abraj Al Bait)", rating: 5, distance: "0 meters from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Full Board – Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Gypsum Board Tents (A/C) with Buffet Meals", roomSharing: "4 / 3 / 2",
          availableSeats: 50, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Elite Plus", category: "Premium Hajj Package",
          description: "Premium Hajj package with Azka Al Maqam hotel at 0 meters from Haram, VIP air conditioned tents, direct Saudi Airlines flight, and premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "1195000",
          roomPrices: { double: 1450000, triple: 1300000, quad: 1250000, sharing: 1195000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Azka Al Maqam Makkah Hotel (0m from Haram)", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Azka Al Maqam / Similar", rating: 5, distance: "0 meters from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Air Conditioned Tents", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 50, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Comfort Plus", category: "Executive Hajj Package",
          description: "Executive Hajj package with Le Meridien Tower (Saja Makkah) with 1.5km shuttle service, VIP A/C tents, direct Saudi Airlines flight. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "1075000",
          roomPrices: { double: 1300000, triple: 1175000, quad: 1125000, sharing: 1075000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Le Meridien Tower (Saja Makkah)", "1.5km Shuttle Service to Haram", "3 Nights Madinah Stay", "Full Board Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Le Meridien Tower (Saja Makkah)", rating: 5, distance: "1.5 km shuttle service" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Full Board – Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Air Conditioned Tents", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 60, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Comfort", category: "Standard Hajj Package",
          description: "Standard Hajj package with Esarah hotel in Setten area, VIP A/C tents, direct Saudi Airlines flight. Indian & Continental meals with premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "975000",
          roomPrices: { double: 1170000, triple: 1050000, quad: 1010000, sharing: 975000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 4, distance: "< 4 km from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Air Conditioned Tents", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 60, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: false,
        },
        {
          type: "hajj", name: "Burhan Economy Plus", category: "Economy Hajj Package",
          description: "Economy Hajj package with Esarah hotel, premium gypsum board A/C tents, direct Saudi Airlines flight. Category A Muallim with Indian & Continental meals. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "900000",
          roomPrices: { double: 1035000, triple: 950000, quad: 925000, sharing: 900000 },
          inclusions: ["Saudi Airlines Direct Flight", "Category A Muallim", "Premium Gypsum Board Tents (A/C)", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 3, distance: "< 4 km from Haram" }, madinah: { name: "Nozol Royal Inn / Similar", rating: 3, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Category A Muallim", tent: "Premium Gypsum Board Tents (A/C)", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 80, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: false,
        },
        {
          type: "hajj", name: "Burhan Budget Saver", category: "Budget Hajj Package",
          description: "Most affordable Hajj package with Air India direct flight, premium gypsum board A/C tents, 6-sharing rooms at Esarah hotel. Indian & Continental meals included. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "825000",
          roomPrices: { "6_sharing": 825000 },
          inclusions: ["Air India Direct Flight", "Category A Muallim", "Premium Gypsum Board Tents (A/C)", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 3, distance: "< 4 km from Haram" }, madinah: { name: "Nozol Royal Inn / Similar", rating: 3, distance: "150 meters from Haram" } },
          flight: "Air India - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Category A Muallim", tent: "Premium Gypsum Board Tents (A/C)", roomSharing: "6 Sharing",
          availableSeats: 100, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: false,
        },
        {
          type: "hajj", name: "Burhan Budget Saver Shifting", category: "Most Popular Hajj Package 2027",
          description: "Most popular 40-day Hajj package. 10 days pre-Hajj in Azizia area, 15 days post-Hajj at Grand Masa Hotel (3 Star, 400m from Haram), and 9 days in Madinah at Haya Plaza Hotel (3 Star, 100m from Masjid Nabawi). Category D Moulim – New Mina. Includes AC bus transport, Ziyarat of Makkah, Madinah, Taif & Badar. Comes with complimentary travel kit including bags, umbrella, sunglasses, electric neck fan, sleeping mat, Janamaz, Tasbeeh, Ihram & printed Hajj guide. All packages exclude 5% GST.",
          duration: "40 Days", price: "650000",
          roomPrices: { sharing: 650000 },
          inclusions: ["Category D Moulim – New Mina", "Azizia Area Hotel (5 km from Haram) – 10 Days Pre-Hajj", "Grand Masa Hotel Makkah (3 Star, 400m from Haram) – 15 Days Post-Hajj", "Haya Plaza Hotel Madinah (3 Star, 100m from Masjid Nabawi) – 9 Days", "AC Bus Transport", "Makkah Ziyarat", "Madinah Ziyarat", "Taif Ziyarat", "Badar Ziyarat", "Visa Processing", "Airport Transfers", "Complimentary Travel Kit (24\" & 20\" PP bags, Backpack, Mina/Arafat bag, Passport bag, Shoe bag, Umbrella, Sunglasses, Electric neck fan, Muzdalifah sleeping mat, Janamaz, Tasbeeh, Printed Hajj & Umrah guide, Ihram belt, Ihram)"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani", "Flight tickets"],
          hotelDetails: { makkah: { name: "Grand Masa Hotel (Post-Hajj) / Azizia Area (Pre-Hajj)", rating: 3, distance: "400 meters from Haram (Post-Hajj)" }, madinah: { name: "Haya Plaza Hotel", rating: 3, distance: "100 meters from Masjid Nabawi" } },
          flight: "Not included", transport: "AC Bus", food: "As per hotel",
          muallim: "Category D – New Mina", roomSharing: "Sharing",
          availableSeats: 100, departureDate: new Date("2027-05-05"), returnDate: new Date("2027-06-20"), featured: true,
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

    const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG + "." + process.env.REPL_OWNER + ".repl.co";
    const invoiceUrl = `https://${domain}/invoice/${bookingId}`;

    let invoiceNum = "";
    try {
      const [bk] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (bk) {
        invoiceNum = bk.invoiceNumber || generateInvoiceNumber(bookingId);
        if (!bk.invoiceNumber) {
          await db.update(bookings).set({ invoiceNumber: invoiceNum }).where(eq(bookings.id, bookingId));
        }
      }
    } catch (e) {}

    let message = "";
    switch (type) {
      case "booking_created":
        message = `Assalamu Alaikum,\nYour booking #${bookingId} with AL BURHAN TOURS & TRAVELS has been created successfully.\n\nInvoice No: ${invoiceNum}\nView Invoice: ${invoiceUrl}\n\nOur team will contact you shortly. JazakAllah Khair.`;
        break;
      case "payment_success":
        message = `Assalamu Alaikum,\nPayment received for booking #${bookingId}. Your booking is now confirmed!\n\nUpdated Invoice: ${invoiceUrl}\n\nJazakAllah Khair - AL BURHAN TOURS & TRAVELS`;
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

  app.post("/api/admin/upload-document", upload.single("file"), async (req: any, res) => {
    try {
      const { userId, type } = req.body;
      if (!userId || !type) {
        return res.status(400).json({ success: false, error: "userId and type are required" });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: "File is required" });
      }
      const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "pdf", "doc", "docx"]);
      const ext = (file.originalname || "file").split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.has(ext)) {
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
        fileUrl,
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
        const whatsappResult = await sendWhatsAppBotBee(targetUser.phone, message);
        const emailResult = await sendEmail(targetUser.email, `Your ${docLabel} Document - AL BURHAN TOURS`, emailHtml);

        await db.insert(notifications).values({
          userId: parseInt(userId),
          type: "document_uploaded",
          channel: "all",
          message,
          status: (smsResult || whatsappResult || emailResult) ? "sent" : "pending",
        });
        console.log(`[Notification] Doc upload for user #${userId} - SMS:${smsResult} WhatsApp:${whatsappResult} Email:${emailResult}`);
      }

      res.json({ success: true, document });
    } catch (error: any) {
      console.error("[Admin Upload] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/create-offline-invoice", async (req, res) => {
    try {
      const {
        contactName, contactPhone, contactEmail, address,
        packageId, numberOfPeople, totalAmount, paidAmount,
        travelers, roomType, specialRequests,
        sendSms, sendWhatsapp
      } = req.body;

      if (!contactName || !contactPhone || !packageId || !totalAmount) {
        return res.status(400).json({ success: false, error: "Name, phone, package, and amount are required" });
      }

      let existingUser = await db.select().from(users).where(eq(users.phone, contactPhone));
      let userId: number;

      if (existingUser.length > 0) {
        userId = existingUser[0].id;
      } else {
        const hashedPassword = await bcrypt.hash("offline_" + Date.now(), 10);
        const [newUser] = await db.insert(users).values({
          name: contactName,
          email: contactEmail || contactName.toLowerCase().replace(/\s/g, '') + Date.now() + "@offline.local",
          phone: contactPhone,
          password: hashedPassword,
        }).returning();
        userId = newUser.id;
      }

      const invoiceNum = generateInvoiceNumber(0);

      const [booking] = await db.insert(bookings).values({
        userId,
        packageId: parseInt(packageId as string),
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
        roomType: roomType || null,
      }).returning();

      const actualInvoiceNum = generateInvoiceNumber(booking.id);
      await db.update(bookings).set({ invoiceNumber: actualInvoiceNum }).where(eq(bookings.id, booking.id));

      if (parseFloat(paidAmount || "0") > 0) {
        await db.insert(payments).values({
          bookingId: booking.id,
          amount: paidAmount,
          paymentMethod: "offline",
          transactionId: "OFFLINE_" + Date.now(),
          status: "success",
        });
      }

      const domain = process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
      const invoiceUrl = `https://${domain}/invoice/${booking.id}`;
      const totalAmt = parseFloat(totalAmount);
      const tcsAmount = totalAmt * 0.05;
      const grandTotal = totalAmt + tcsAmount;

      let notificationStatus = "";
      const message = `Assalamu Alaikum ${contactName},\nYour booking with AL BURHAN TOURS & TRAVELS has been created.\n\nInvoice No: ${actualInvoiceNum}\nAmount: Rs ${formatINR(grandTotal)} (incl. GST+TCS)\n\nView Invoice: ${invoiceUrl}\n\nJazakAllah Khair.`;

      if (sendSms) {
        const smsOk = await sendSmsFast2SMS(contactPhone, message);
        notificationStatus += smsOk ? "SMS sent. " : "SMS failed. ";
      }
      if (sendWhatsapp) {
        const waOk = await sendWhatsAppBotBee(contactPhone, message);
        notificationStatus += waOk ? "WhatsApp sent. " : "WhatsApp failed/skipped. ";
      }

      res.json({
        success: true,
        bookingId: booking.id,
        invoiceNumber: actualInvoiceNum,
        grandTotal,
        notificationStatus,
      });
    } catch (error: any) {
      console.error("[Offline Invoice] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/broadcast-notification", async (req, res) => {
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
      const results: Array<{ userId: number; name: string; sms: boolean; whatsapp: boolean; email: boolean }> = [];

      for (const u of allUsers) {
        const smsResult = await sendSmsFast2SMS(u.phone, message);
        const whatsappResult = await sendWhatsAppBotBee(u.phone, message);
        const emailResult = await sendEmail(u.email, emailSubject, emailHtml);

        const anySent = smsResult || whatsappResult || emailResult;
        if (anySent) sentCount++;

        await db.insert(notifications).values({
          userId: u.id,
          type: "broadcast",
          channel: "all",
          message,
          status: anySent ? "sent" : "pending",
        });

        results.push({ userId: u.id, name: u.name, sms: smsResult, whatsapp: whatsappResult, email: emailResult });
        console.log(`[Broadcast] User #${u.id} (${u.name}) - SMS:${smsResult} WhatsApp:${whatsappResult} Email:${emailResult}`);
      }

      res.json({ success: true, total: allUsers.length, sent: sentCount, results });
    } catch (error: any) {
      console.error("[Broadcast] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/notifications/user/:userId", async (req, res) => {
    try {
      const userNotifications = await db.select().from(notifications)
        .where(eq(notifications.userId, parseInt(req.params.userId)))
        .orderBy(desc(notifications.sentAt));
      res.json({ success: true, notifications: userNotifications });
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
