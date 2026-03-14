import { Router } from "express";
import { db, usersTable, otpsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import {
  SendOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";
import { generateOtp, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS, sendWhatsApp } from "../lib/notifications.js";

const router = Router();

router.post("/send-otp", async (req, res) => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid mobile number" });
    return;
  }
  const { mobile } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile)).limit(1);
  const isNewUser = !existing[0];

  if (isNewUser) {
    await db.insert(usersTable).values({ mobile, role: "customer" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpsTable).values({ mobile, otp, expiresAt });

  await sendOtpSMS(mobile, otp);

  sendWhatsApp(
    mobile,
    `Your Al Burhan Tours & Travels OTP is: *${otp}*\n\nValid for 10 minutes. Do not share with anyone.\n\nAl Burhan Tours & Travels\n+91 9893225590`
  ).catch(console.error);

  console.log(`[OTP] Mobile: ${mobile}, OTP: ${otp}, NewUser: ${isNewUser}`);

  res.json({
    message: "OTP sent successfully",
    requestId: `otp_${Date.now()}`,
    isNewUser,
  });
});

router.post("/verify-otp", async (req, res) => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { mobile, otp } = parsed.data;

  const now = new Date();
  const otpRecords = await db
    .select()
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.mobile, mobile),
        eq(otpsTable.otp, otp),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!otpRecords[0]) {
    res.status(401).json({ message: "Invalid or expired OTP" });
    return;
  }

  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otpRecords[0].id));

  const users = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  const isNewUser = !user.name;

  (req.session as any).userId = user.id;

  if (isNewUser) {
    sendWhatsApp(
      mobile,
      `Assalamu Alaikum! Welcome to Al Burhan Tours & Travels.\n\nWe are delighted to have you with us. With 35+ years of experience, we are here to guide you on your sacred journey.\n\nFor assistance, call us:\n+91 9893225590\n+91 9893989786\n\nJazak Allah Khair!`
    ).catch(console.error);
  } else {
    sendWhatsApp(
      mobile,
      `Assalamu Alaikum ${user.name || ""},\n\nWelcome back to Al Burhan Tours & Travels! You have logged in successfully.\n\nFor assistance: +91 9893225590\n\nJazak Allah Khair!`
    ).catch(console.error);
  }

  res.json({
    message: isNewUser ? "Registration successful" : "Login successful",
    isNewUser,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

router.patch("/profile", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { name, email } = req.body;

  if (!name && !email) {
    res.status(400).json({ message: "At least name or email is required" });
    return;
  }

  const updates: Partial<{ name: string; email: string; updatedAt: Date }> = { updatedAt: new Date() };
  if (name) updates.name = String(name).trim();
  if (email) updates.email = String(email).trim();

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  res.json({
    id: updated.id,
    name: updated.name,
    mobile: updated.mobile,
    email: updated.email,
    role: updated.role,
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
  });
});

export default router;
