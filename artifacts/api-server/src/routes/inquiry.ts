// @ts-nocheck
import { Router } from "express";
import { db, inquiriesTable } from "@workspace/db";
import { SubmitInquiryBody } from "@workspace/api-zod";
import { sendWhatsApp } from "../lib/notifications.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";

const router = Router();

router.post("/", async (req, res) => {
  const parsed = SubmitInquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const data = parsed.data;

  await db.insert(inquiriesTable).values({
    name: data.name,
    mobile: data.mobile,
    email: data.email ?? null,
    message: data.message,
    packageInterest: data.packageInterest ?? null,
  });

  const adminMsg = `New inquiry from ${data.name} (${data.mobile}): ${data.message}`;
  const adminMobile = process.env.ADMIN_MOBILE ?? "";
  if (adminMobile) {
    sendWhatsApp(adminMobile, adminMsg).catch(console.error);
  }

  // Log through Communication Engine for audit trail + analytics
  triggerWorkflow("lead_submitted", {
    customerName: data.name,
    customerMobile: data.mobile,
    customerEmail: data.email || undefined,
    packageName: data.packageInterest || "General Inquiry",
  }).catch(() => {});

  res.json({ message: "Thank you for your inquiry! We will contact you shortly." });
});

export default router;
