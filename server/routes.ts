import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { db } from "./db";
import { users, packages, bookings, payments, notifications, documents } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";

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
      const orderId = `order_${Date.now()}`;
      res.json({ success: true, orderId, amount, currency: "INR" });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    try {
      const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;
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

  app.post("/api/documents/upload", async (req, res) => {
    try {
      const { userId, bookingId, type, fileName, fileUrl } = req.body;
      const [document] = await db.insert(documents).values({
        userId: parseInt(userId),
        bookingId: bookingId ? parseInt(bookingId) : null,
        type,
        fileName,
        fileUrl,
      }).returning();
      res.json({ success: true, document });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
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
    console.log(`[WhatsApp/BotBee] To ${user.phone}: ${message}`);
    console.log(`[RCS/Lemin] To ${user.phone}: ${message}`);
    console.log(`[SMS/Fast2SMS] To ${user.phone}: ${message}`);
    await db.insert(notifications).values({
      userId,
      bookingId,
      type: "multi_channel",
      channel: "all",
      message,
      status: "sent",
    });
  }

  const httpServer = createServer(app);
  return httpServer;
}
