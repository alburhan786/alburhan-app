import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import packagesRouter from "./packages.js";
import bookingsRouter from "./bookings.js";
import paymentsRouter from "./payments.js";
import documentsRouter from "./documents.js";
import notificationsRouter from "./notifications.js";
import broadcastsRouter from "./broadcasts.js";
import adminRouter from "./admin.js";
import inquiryRouter from "./inquiry.js";
import galleryRouter from "./gallery.js";
import groupsRouter from "./groups.js";
import packageMediaRouter from "./package-media.js";
import kycRouter from "./kyc.js";
import storageRouter from "./storage.js";
import requestsRouter from "./requests.js";
import adminPaymentsRouter from "./admin-payments.js";
import feedbackRouter from "./feedback.js";
import staffRouter from "./staff.js";

const router: IRouter = Router();

// Temporary: serve patch script for VPS deployment
router.get("/download-patch", (_req, res) => {
  const candidates = [
    "/home/runner/workspace/patch-staff.py",
    path.resolve(process.cwd(), "../../patch-staff.py"),
    path.resolve(process.cwd(), "patch-staff.py"),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="patch-staff.py"');
    res.sendFile(found);
  } else {
    res.status(404).json({ error: "Patch script not found", tried: candidates });
  }
});

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/packages", packagesRouter);
router.use("/packages", packageMediaRouter);
router.use("/bookings", bookingsRouter);
router.use("/payments", paymentsRouter);
router.use("/documents", documentsRouter);
router.use("/notifications", notificationsRouter);
router.use("/broadcasts", broadcastsRouter);
router.use("/admin", adminRouter);
router.use("/inquiry", inquiryRouter);
router.use("/gallery", galleryRouter);
router.use("/groups", groupsRouter);
router.use("/kyc", kycRouter);
router.use("/requests", requestsRouter);
router.use("/admin/bookings", adminPaymentsRouter);
router.use("/feedback", feedbackRouter);
router.use("/staff", staffRouter);
router.use(storageRouter);

export default router;
