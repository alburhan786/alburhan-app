import { Router } from "express";
import { SendNotificationBody } from "@workspace/api-zod";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendSMS, sendWhatsApp, sendEmail } from "../lib/notifications.js";

const router = Router();

router.post("/send", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const parsed = SendNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { mobile, email, message, channels, subject } = parsed.data;

  const results: Record<string, boolean> = {};

  if (!mobile && !email) {
    res.status(400).json({ message: "Either mobile or email is required" });
    return;
  }

  await Promise.allSettled([
    channels.includes("sms") && mobile
      ? sendSMS(mobile, message).then(r => { results.sms = r; })
      : Promise.resolve(),
    channels.includes("whatsapp") && mobile
      ? sendWhatsApp(mobile, message).then(r => { results.whatsapp = r; })
      : Promise.resolve(),
    channels.includes("email") && email
      ? sendEmail(email, subject ?? "Message from Al Burhan Tours & Travels", message).then(r => { results.email = r; })
      : Promise.resolve(),
  ]);

  res.json({ message: `Notifications sent via: ${channels.join(", ")}` });
});

export default router;
