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
import autoNotificationsRouter from "./autoNotifications.js";
import agreementsRouter from "./agreements.js";
import customerJourneyRouter from "./customer-journey.js";
import supportRouter from "./support.js";
import { requireAdmin } from "../lib/auth.js";

const router: IRouter = Router();

// ── Build fingerprint — confirms which bundle is running on VPS (no auth needed) ──
const BUILD_STAMP = "2026-07-14-v20.5";
router.get("/version", (_req, res) => {
  res.json({
    build: BUILD_STAMP,
    pid: process.pid,
    node: process.version,
    cwd: process.cwd(),
    time: new Date().toISOString(),
  });
});

// ── Public env-check: shows which required vars are SET vs MISSING (no values) ──
router.get("/env-check", (_req, res) => {
  const required = [
    "DATABASE_URL", "FAST2SMS_API_KEY", "BOTBEE_API_KEY",
    "BOTBEE_PHONE_NUMBER_ID", "BOTBEE_BUSINESS_ID",
    "RAZORPAY_KEY_ID", "RAZORPAY_SECRET", "SESSION_SECRET",
  ];
  const optional = ["FAST2SMS_SENDER_ID", "SMTP_HOST", "SMTP_USER", "SMTP_FROM", "JWT_SECRET"];
  const check = (keys: string[]) =>
    Object.fromEntries(keys.map(k => [k, process.env[k] ? `✅ set (len=${process.env[k]!.length})` : "❌ MISSING"]));
  const missing = required.filter(k => !process.env[k]);
  res.json({
    allRequiredSet: missing.length === 0,
    missingRequired: missing,
    required: check(required),
    optional: check(optional),
    nodeEnv: process.env.NODE_ENV,
    cwd: process.cwd(),
  });
});

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
// Allow download with either admin session OR x-admin-password header (for VPS CI)
function adminOrPassword(req: any, res: any, next: any) {
  const pw = req.headers["x-admin-password"];
  const expected = process.env.DELETE_ADMIN_PASSWORD;
  if (pw && expected && pw === expected) return next();
  return (requireAdmin as any)(req, res, next);
}
router.get("/deploy-dist", adminOrPassword, serveApiBundle);
router.get("/download-api", adminOrPassword, serveApiBundle);

// VPS self-deploy: download latest bundle from Replit dev server and restart pm2
// POST /api/hot-reload  — requires X-Admin-Password header matching DELETE_ADMIN_PASSWORD
router.post("/hot-reload", async (req: any, res: any) => {
  const pw = req.headers["x-admin-password"] || req.body?.password;
  const expected = process.env.DELETE_ADMIN_PASSWORD;
  if (!expected || pw !== expected) return void res.status(401).json({ error: "Unauthorized" });

  const bundleUrl = req.body?.bundleUrl as string | undefined;
  if (!bundleUrl) return void res.status(400).json({ error: "bundleUrl required" });

  const dest = "/var/www/alburhan/artifacts/api-server/dist/index.cjs";
  const { spawn } = await import("child_process");
  // Kill any zombie process holding the port, then restart PM2.
  // fuser / lsof are tried in order; if both fail we still continue.
  const killZombie = "fuser -k ${PORT:-8080}/tcp 2>/dev/null || lsof -ti:${PORT:-8080} | xargs kill -9 2>/dev/null || true";
  const cmd = [
    `curl -fsSL "${bundleUrl}" -o "${dest}.tmp"`,
    `mv "${dest}.tmp" "${dest}"`,
    killZombie,
    "sleep 2",
    "pm2 restart alburhan-api 2>/dev/null || pm2 start \"" + dest + "\" --name alburhan-api",
    "pm2 save",
  ].join(" && ");

  // Download + replace bundle in background, then exit so PM2 restarts with new file.
  const child = spawn("sh", ["-c", cmd], { detached: true, stdio: "ignore" });
  child.unref();

  res.json({ ok: true, message: "Deploy triggered — process exiting for PM2 restart", dest, bundleUrl, pid: process.pid });
  setTimeout(() => process.exit(0), 3000);
});

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(authRouter);

// ── No-auth diagnostics: lists every registered route and confirms critical ones ──
// Express 5: app.router (not app._router), layer.path is always undefined → must recurse
router.get("/routes", (_req, res) => {
  function collectRoutes(stack: any[], depth = 0): string[] {
    const out: string[] = [];
    if (!Array.isArray(stack) || depth > 8) return out;
    for (const layer of stack) {
      if (layer?.route?.path != null) {
        const methods = Object.keys(layer.route.methods || {})
          .map((m: string) => m.toUpperCase()).join(",");
        out.push(`${methods} ${layer.route.path}`);
      }
      // Express 5: sub-routers live in layer.handle.stack
      if (layer?.handle?.stack) out.push(...collectRoutes(layer.handle.stack, depth + 1));
      // Express 5: some layers nest via layer.router?.stack
      if (layer?.router?.stack)  out.push(...collectRoutes(layer.router.stack,  depth + 1));
    }
    return out;
  }

  // Read directly from this router's own .stack — avoids Express version differences
  // and esbuild CJS bundling which makes res.app.router unreliable.
  const topStack: any[] = (router as any).stack ?? [];
  const routes = collectRoutes(topStack);

  // Critical routes — matched by relative path suffix (prefixes not stored in Express 5)
  const critical = [
    { label: "GET /api/health",            match: (r: string) => /GET.*\/health/.test(r) },
    { label: "GET /api/healthz",           match: (r: string) => /GET.*\/healthz/.test(r) },
    { label: "POST /api/auth/send-otp",    match: (r: string) => /POST.*\/send-otp/.test(r) },
    { label: "POST /api/auth/verify-otp",  match: (r: string) => /POST.*\/verify-otp/.test(r) },
    { label: "GET /api/me",                match: (r: string) => /GET.*\/me/.test(r) },
    { label: "GET /api/routes",            match: (r: string) => /GET.*\/routes/.test(r) },
    { label: "GET /api/packages",          match: (r: string) => /GET.*\/packages/.test(r) },
    { label: "GET /api/bookings",          match: (r: string) => /GET.*\/bookings/.test(r) },
  ];
  const missing = critical.filter(c => !routes.some(c.match)).map(c => c.label);
  const found   = critical.filter(c =>  routes.some(c.match)).map(c => c.label);

  res.json({
    note: "Express 5: path prefixes (/api) not stored on layers; paths shown are relative to mount point",
    totalRoutes: routes.length,
    criticalFound:   found,
    criticalMissing: missing,
    allOk: missing.length === 0,
    routes: routes.sort(),
  });
});
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
router.use("/auto-notifications", autoNotificationsRouter);
router.use("/agreements", agreementsRouter);
router.use("/customer/journey", customerJourneyRouter);
router.use("/support", supportRouter);
router.use("/webhook", webhooksRouter);
router.use(storageRouter);

// ── Migration diagnostics (router-level, no session required, key-protected) ──
// These mirror the app-level routes in app.ts. Being in the router guarantees
// they work on VPS even if the app-level registration order is wrong.
function migrationKeyOk(key: string | undefined): boolean {
  const valid = [process.env.MIGRATION_KEY, "alburhan-migrate-2026"].filter(Boolean);
  return !!key && valid.includes(key);
}

router.get("/migrate/db-check", async (req: any, res: any) => {
  const key = req.query.key as string;
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  try {
    const { pool } = await import("@workspace/db");
    const checks: Record<string, any> = {};
    for (const t of ["users", "bookings", "payment_transactions", "notification_logs", "invoices", "offline_payments"]) {
      try {
        const r = await pool.query(`SELECT COUNT(*) FROM ${t}`);
        checks[t] = `ok (${r.rows[0].count} rows)`;
      } catch (e: any) { checks[t] = `ERROR: ${e.message.split("\n")[0]}`; }
    }
    res.json({ ok: true, build: BUILD_STAMP, pid: process.pid, tables: checks });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
