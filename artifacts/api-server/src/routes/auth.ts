import { Router } from "express";
import { db, usersTable, otpsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import {
  SendOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";
import { generateOtp, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS } from "../lib/notifications.js";

const router = Router();

router.post("/send-otp", async (req, res) => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid mobile number" });
    return;
  }
  const { mobile } = parsed.data;

  let user = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile)).limit(1);
  if (!user[0]) {
    await db.insert(usersTable).values({ mobile, role: "customer" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpsTable).values({ mobile, otp, expiresAt });

  await sendOtpSMS(mobile, otp);

  console.log(`[OTP] Mobile: ${mobile}, OTP: ${otp}`);

  res.json({ message: "OTP sent successfully", requestId: `otp_${Date.now()}` });
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

  (req.session as any).userId = user.id;

  res.json({
    message: "Login successful",
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
