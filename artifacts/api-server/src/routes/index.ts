import { Router, type IRouter } from "express";
import webhooksRouter from "./webhooks.js";
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
import verifyRouter from "./verify.js";
import scanRouter from "./scan.js";
import deleteAuthRouter from "./delete-auth.js";
import attendanceRouter from "./attendance.js";
import expensesRouter from "./expenses.js";
import flightsRouter from "./flights.js";
import hotelsRouter from "./hotels.js";
import busesRouter from "./buses.js";
import medicalRouter from "./medical.js";
import visaRouter from "./visa.js";
import aiRouter from "./ai.js";
import systemHealthRouter from "./system-health.js";
import accountingRouter from "./accounting.js";
import vendorsRouter from "./vendors.js";
import gstRouter from "./gst.js";
import payrollRouter from "./payroll.js";
import assetsRouter from "./assets.js";
import auditRouter from "./audit.js";
import adminUsersRouter from "./users-admin.js";
import adminNotificationsRouter from "./admin-notifications.js";
import settingsRouter from "./settings.js";
import invoicesRouter from "./invoices.js";
import notificationCenterRouter from "./notification-center.js";
import workflowsRouter from "./workflows.js";
import ziyaratRouter from "./ziyarat.js";
import luggageRouter from "./luggage.js";
import allocationsRouter from "./allocations.js";
import loyaltyRouter from "./loyalty.js";
import offlinePaymentsRouter from "./offline-payments.js";
import apiSettingsRouter from "./api-settings.js";
import whatsappRouter from "./whatsapp.js";
import communicationRouter from "./communication.js";
import { requireAdmin } from "../lib/auth.js";

const router: IRouter = Router();

// ── Env diagnostic (admin-only) — values are masked but still restricted ────
router.get("/diag", requireAdmin as any, (_req, res) => {
  const fast2smsKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
  const mask = (v: string | undefined, label: string) =>
    v ? `${v.slice(0, 6)}...${v.slice(-4)} (len=${v.length})` : `❌ ${label} NOT SET`;

  // Which .env files exist on disk?
  const envCandidates = [
    "/var/www/alburhan/.env",
    "/var/www/alburhan/api-server/.env",
    "/var/www/alburhan/artifacts/api-server/.env",
    process.cwd() + "/.env",
  ];
  const envFilesFound = envCandidates.map(p => ({ path: p, exists: fs.existsSync(p) }));

  // If a .env file exists, read its keys (not values) so we can see what's in it
  const foundEnvFile = envFilesFound.find(e => e.exists);
  let envFileKeys: string[] = [];
  if (foundEnvFile) {
    try {
      const content = fs.readFileSync(foundEnvFile.path, "utf8");
      envFileKeys = content
        .split("\n")
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("#") && l.includes("="))
        .map(l => l.split("=")[0].trim());
    } catch { /* ignore */ }
  }

  res.json({
    server: "Al Burhan Tours API",
    time: new Date().toISOString(),
    node: process.version,
    cwd: process.cwd(),
    pid: process.pid,
    env: {
      NODE_ENV: process.env.NODE_ENV || "NOT SET",
      FAST2SMS_API_KEY: mask(process.env.FAST2SMS_API_KEY, "FAST2SMS_API_KEY"),
      FAST2SMS_XXL_API_KEY: mask(process.env.FAST2SMS_XXL_API_KEY, "FAST2SMS_XXL_API_KEY"),
      DATABASE_URL: process.env.DATABASE_URL ? `set (len=${process.env.DATABASE_URL.length})` : "❌ NOT SET",
      SESSION_SECRET: process.env.SESSION_SECRET ? `set (len=${process.env.SESSION_SECRET.length})` : "❌ NOT SET",
      BOTBEE_API_KEY: process.env.BOTBEE_API_KEY ? "set" : "not set",
      BOTBEE_PHONE_NUMBER_ID: process.env.BOTBEE_PHONE_NUMBER_ID ? "set" : "not set",
    },
    fast2smsReady: !!fast2smsKey && fast2smsKey !== "your_key_here",
    envFilesOnDisk: envFilesFound,
    envFileKeys: foundEnvFile
      ? { path: foundEnvFile.path, keys: envFileKeys, hasFast2smsKey: envFileKeys.some(k => k.includes("FAST2SMS")) }
      : null,
    allFast2smsEnvKeys: Object.keys(process.env).filter(k => k.includes("FAST2SMS")),
  });
});

// Temporary: serve pre-built frontend dist for VPS deployment (admin-only)
router.get("/download-dist", requireAdmin as any, (_req, res) => {
  const candidates = [
    "/home/runner/workspace/artifacts/alburhan/dist/public/frontend-dist.tar.gz",
    "/home/runner/workspace/frontend-dist.tar.gz",
    path.resolve(process.cwd(), "../../artifacts/alburhan/dist/public/frontend-dist.tar.gz"),
    path.resolve(process.cwd(), "../../frontend-dist.tar.gz"),
    path.resolve(process.cwd(), "frontend-dist.tar.gz"),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", 'attachment; filename="frontend-dist.tar.gz"');
    res.sendFile(found);
  } else {
    res.status(404).json({ error: "Dist archive not found", tried: candidates });
  }
});

// Serve compiled API server bundle for VPS deployment
// Accessible at both /api/deploy-dist and /api/download-api
function serveApiBundle(_req: any, res: any) {
  const candidates = [
    "/home/runner/workspace/artifacts/api-server/dist/index.cjs",
    path.resolve(process.cwd(), "dist/index.cjs"),
    path.resolve(process.cwd(), "../../artifacts/api-server/dist/index.cjs"),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="index.cjs"');
    res.sendFile(found);
  } else {
    res.status(404).json({ error: "API bundle not found — run build first", tried: candidates });
  }
}
router.get("/deploy-dist", requireAdmin as any, serveApiBundle);
router.get("/download-api", requireAdmin as any, serveApiBundle);

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(authRouter);
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
router.use("/verify", verifyRouter);
router.use("/scan", scanRouter);
router.use("/delete-auth", deleteAuthRouter);
router.use("/groups", attendanceRouter);
router.use("/expenses", expensesRouter);
router.use("/flights", flightsRouter);
router.use("/hotels", hotelsRouter);
router.use("/buses", busesRouter);
router.use("/medical", medicalRouter);
router.use("/visa", visaRouter);
router.use("/ai", aiRouter);
router.use("/admin", systemHealthRouter);
router.use("/accounting", accountingRouter);
router.use("/vendors", vendorsRouter);
router.use("/gst", gstRouter);
router.use("/payroll", payrollRouter);
router.use("/assets", assetsRouter);
router.use("/audit-logs", auditRouter);
router.use("/admin-users", adminUsersRouter);
router.use("/admin-notifications", adminNotificationsRouter);
router.use("/settings", settingsRouter);
router.use("/admin/settings", settingsRouter);
router.use("/invoices", invoicesRouter);
router.use("/notification-center", notificationCenterRouter);
router.use("/workflows", workflowsRouter);
router.use("/ziyarat", ziyaratRouter);
router.use("/luggage", luggageRouter);
router.use("/allocations", allocationsRouter);
router.use("/loyalty", loyaltyRouter);
router.use("/offline-payments", offlinePaymentsRouter);
router.use("/api-settings", apiSettingsRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/communication", communicationRouter);
router.use("/webhook", webhooksRouter);
router.use(storageRouter);

export default router;
