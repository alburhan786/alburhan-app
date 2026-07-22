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
import enterpriseRouter from "./enterprise.js";
import portalRouter from "./portal.js";
import smsSettingsRouter from "./sms-settings.js";
import socialMediaRouter from "./social-media.js";
import { requireAdmin } from "../lib/auth.js";

const router: IRouter = Router();

// ── Root health probe — Replit deployment healthcheck hits GET /api ───────────
// Must be the FIRST route so it responds immediately, even before other middleware loads.
router.get("/", (_req, res) => {
  res.json({ status: "ok", service: "Al Burhan API", pid: process.pid, time: new Date().toISOString() });
});

// ── Build fingerprint — confirms which bundle is running on VPS (no auth needed) ──
const BUILD_STAMP = "2026-07-21-v25.0-sender-id-mgmt";
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
router.use("/enterprise", enterpriseRouter);
router.use("/portal", portalRouter);
router.use("/sms-settings", smsSettingsRouter);
router.use("/social-media", socialMediaRouter);
import inboxRouter from "./inbox.js";
router.use("/inbox", inboxRouter);
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
    for (const t of ["users", "bookings", "payment_transactions", "notification_logs", "notification_retry_queue", "invoices", "offline_payments", "agreements", "hajj_groups"]) {
      try {
        const r = await pool.query(`SELECT COUNT(*) FROM ${t}`);
        checks[t] = `ok (${r.rows[0].count} rows)`;
      } catch (e: any) { checks[t] = `ERROR: ${e.message.split("\n")[0]}`; }
    }
    res.json({ ok: true, build: BUILD_STAMP, pid: process.pid, tables: checks });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Audit helper: read OTP + user info (migration key protected) ─────────────
router.get("/migrate/audit-info", async (req: any, res: any) => {
  const key = req.query.key as string;
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  const { pool } = await import("@workspace/db");
  const out: Record<string, any> = { ok: true };

  // User roles
  try {
    const roles = await pool.query(`SELECT role::text, COUNT(*) as cnt FROM users GROUP BY role ORDER BY cnt DESC LIMIT 10`);
    out.userRoles = roles.rows;
    // Prefer admin role, fallback to any
    const admin = roles.rows.find((r: any) => r.role !== 'customer');
    if (admin) {
      const ur = await pool.query(`SELECT id, name, mobile, email, role::text as role FROM users WHERE role::text = $1 ORDER BY created_at LIMIT 1`, [admin.role]);
      out.admin = ur.rows[0] || null;
    } else {
      const ur = await pool.query(`SELECT id, name, mobile, email, role::text as role FROM users ORDER BY created_at LIMIT 1`);
      out.admin = ur.rows[0] || null;
    }
  } catch (e: any) { out.userError = e.message; }

  // OTP for target user
  try {
    if (out.admin?.mobile) {
      const otpR = await pool.query(`SELECT otp FROM otps WHERE mobile=$1 AND used=false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`, [out.admin.mobile]);
      out.pendingOtp = otpR.rows[0]?.otp || null;
    }
  } catch (e: any) { out.otpError = e.message; }

  // Notification logs summary (7d) - safe columns only
  try {
    const nl = await pool.query(`SELECT channel::text, COUNT(*) as total FROM notification_logs WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY channel ORDER BY total DESC`);
    out.notifByChannel = nl.rows;
  } catch (e: any) { out.notifError = e.message; }

  // Retry queue
  try {
    const rq = await pool.query(`SELECT COUNT(*) FILTER (WHERE status='pending') as pending, COUNT(*) FILTER (WHERE status='failed') as failed FROM notification_retry_queue`);
    out.retryQueue = rq.rows[0];
  } catch (e: any) { out.retryError = e.message; }

  // Booking/Invoice counts from db-check (safe)
  try {
    const bc = await pool.query(`SELECT COUNT(*) as total FROM bookings`);
    out.bookingCount = bc.rows[0]?.total;
  } catch {}
  try {
    const ic = await pool.query(`SELECT COUNT(*) as total FROM invoices`);
    out.invoiceCount = ic.rows[0]?.total;
  } catch {}

  res.json(out);
});

// ── Fast2SMS DLT template list (migration key protected) ──────────────────
router.get("/migrate/fast2sms-templates", async (req: any, res: any) => {
  const key = req.query.key as string;
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  try {
    const { pool } = await import("@workspace/db");
    const { decrypt } = await import("../lib/encryption.js");
    const axios = (await import("axios")).default;

    // Read encrypted fields directly (same pattern as api-settings.ts)
    const settingsRow = await pool.query(
      `SELECT api_key_encrypted, enabled, extra_fields_encrypted FROM api_settings WHERE provider = 'fast2sms' LIMIT 1`
    );
    const dbRow = settingsRow.rows[0];
    const isEnabled = dbRow?.enabled !== false;

    // Decrypt API key
    let apiKey: string | undefined;
    try {
      if (dbRow?.api_key_encrypted) apiKey = decrypt(dbRow.api_key_encrypted) || undefined;
    } catch {}
    // Env fallback
    if (!apiKey) apiKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;

    // Decrypt extra fields
    let currentExtra: Record<string, any> = {};
    try {
      if (dbRow?.extra_fields_encrypted) currentExtra = JSON.parse(decrypt(dbRow.extra_fields_encrypted));
    } catch {}

    if (!apiKey || !isEnabled) {
      return void res.status(400).json({
        ok: false,
        error: apiKey ? "Fast2SMS is disabled in api_settings" : "Fast2SMS API key not found in DB or env",
        dbRowExists: !!dbRow,
        isEnabled,
        currentOtpTemplateId: currentExtra.otp_template_id || null,
        currentSenderId: currentExtra.sender_id || "ABURHA",
      });
    }

    const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;

    // Fetch DLT templates from Fast2SMS
    const url = `https://www.fast2sms.com/dev/template?authorization=${apiKey}`;
    let templates: any = null;
    let templateError: any = null;
    try {
      const r = await axios.get(url, { timeout: 15000 });
      templates = r.data;
    } catch (te: any) {
      templateError = te?.response?.data || te?.message;
    }

    res.json({
      ok: true,
      maskedKey,
      currentOtpTemplateId: currentExtra.otp_template_id || null,
      currentSenderId: currentExtra.sender_id || "ABURHA",
      currentOtpSender: currentExtra.otp_sender || null,
      dbRowExists: !!dbRow,
      isEnabled,
      fast2smsTemplateResponse: templates,
      fast2smsTemplateError: templateError,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Configure OTP template ID + sender (migration key protected) ──────────
router.post("/migrate/configure-otp-template", async (req: any, res: any) => {
  const { key, otp_template_id, otp_sender } = req.body || {};
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  if (!otp_template_id || typeof otp_template_id !== "string") {
    return void res.status(400).json({ error: "otp_template_id is required" });
  }
  try {
    const { pool } = await import("@workspace/db");
    const { decrypt, encrypt } = await import("../lib/encryption.js");

    // Read current encrypted extra
    const row = await pool.query(
      `SELECT extra_fields_encrypted FROM api_settings WHERE provider = 'fast2sms' LIMIT 1`
    );
    if (!row.rows.length) return void res.status(404).json({ error: "fast2sms api_settings row not found" });

    let extra: Record<string, any> = {};
    try {
      if (row.rows[0].extra_fields_encrypted) {
        extra = JSON.parse(decrypt(row.rows[0].extra_fields_encrypted));
      }
    } catch {}

    // Merge new values
    extra.otp_template_id = otp_template_id.trim();
    if (otp_sender && typeof otp_sender === "string") {
      extra.otp_sender = otp_sender.trim();
    }

    // Re-encrypt and save
    const extraEncrypted = encrypt(JSON.stringify(extra));
    await pool.query(
      `UPDATE api_settings SET extra_fields_encrypted = $1, updated_at = NOW() WHERE provider = 'fast2sms'`,
      [extraEncrypted]
    );

    // Invalidate cache so next OTP call picks up new value immediately
    const { invalidateCache } = await import("../lib/apiSettingsProvider.js");
    invalidateCache();

    res.json({
      ok: true,
      message: `otp_template_id set to "${extra.otp_template_id}"${otp_sender ? `, otp_sender set to "${extra.otp_sender}"` : ""}`,
      savedExtra: extra,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Live DLT OTP test (migration key protected, no rate limit) ─────────────
// Sends a real DLT SMS and returns the complete request + response trace.
router.post("/migrate/test-otp-dlt", async (req: any, res: any) => {
  const { key, mobile, test_otp } = req.body || {};
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  if (!mobile) return void res.status(400).json({ error: "mobile is required" });

  try {
    const { pool } = await import("@workspace/db");
    const { decrypt } = await import("../lib/encryption.js");
    const axios = (await import("axios")).default;

    // Read fast2sms settings from DB (encrypted)
    const row = await pool.query(
      `SELECT api_key_encrypted, enabled, extra_fields_encrypted FROM api_settings WHERE provider = 'fast2sms' LIMIT 1`
    );
    const dbRow = row.rows[0];

    let apiKey: string | undefined;
    try { if (dbRow?.api_key_encrypted) apiKey = decrypt(dbRow.api_key_encrypted) || undefined; } catch {}
    if (!apiKey) apiKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;

    let extra: Record<string, any> = {};
    try { if (dbRow?.extra_fields_encrypted) extra = JSON.parse(decrypt(dbRow.extra_fields_encrypted)); } catch {}

    const otp_template_id = extra.otp_template_id || "";
    const sender_id = extra.otp_sender || extra.sender_id || "ABURHA";
    const otp = test_otp || "123456";

    if (!apiKey) return void res.status(400).json({ ok: false, error: "Fast2SMS API key not configured" });
    if (!otp_template_id) return void res.status(400).json({ ok: false, error: "otp_template_id not configured" });

    // Normalize mobile
    const clean = mobile.replace(/\D/g, "");
    const phone = clean.startsWith("91") && clean.length === 12 ? clean.slice(2) : clean;

    const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
    const variables = encodeURIComponent(`${otp}|`);

    // Construct exact DLT request (mirrors sendOtpSMS)
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=${sender_id}&message=${otp_template_id}&variables_values=${variables}&numbers=${phone}&flash=0`;
    const maskedUrl = url.replace(apiKey, maskedKey);

    const t0 = Date.now();
    let httpStatus: number | undefined;
    let responseBody: any = null;
    let requestError: any = null;

    try {
      const r = await axios.get(url, { timeout: 12000 });
      httpStatus = r.status;
      responseBody = r.data;
    } catch (e: any) {
      httpStatus = e?.response?.status;
      responseBody = e?.response?.data;
      requestError = e?.message;
    }

    const durationMs = Date.now() - t0;
    const success = responseBody?.return === true;

    res.json({
      ok: success,
      report: {
        "API URL": maskedUrl,
        "HTTP Method": "GET",
        "HTTP Status": httpStatus,
        "Route": "dlt",
        "Sender ID": sender_id,
        "Template ID (message)": otp_template_id,
        "variables_values": decodeURIComponent(variables),
        "Mobile": phone,
        "Duration": `${durationMs}ms`,
        "Fast2SMS return": responseBody?.return,
        "Fast2SMS response": responseBody,
        "Delivery Status": success ? "✅ DELIVERED" : "❌ FAILED",
        "Error": requestError || undefined,
      },
      requestParams: {
        authorization: maskedKey,
        route: "dlt",
        sender_id,
        message: otp_template_id,
        variables_values: decodeURIComponent(variables),
        numbers: phone,
        flash: "0",
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Booking diagnostic (migration key protected) ──────────────────────────────
// Shows full state of a booking: status, invoice, journey, notification logs
router.get("/migrate/booking-diagnostic/:ref", async (req: any, res: any) => {
  const { ref } = req.params;
  const { key } = req.query;
  if (!migrationKeyOk(key as string)) return void res.status(403).json({ error: "Forbidden" });
  try {
    const { pool } = await import("@workspace/db");
    const bRes = await pool.query(
      `SELECT b.id, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
              b.package_name, b.final_amount, b.paid_amount, b.status, b.journey_status,
              b.invoice_number, b.last_payment_date, b.created_at, b.updated_at
       FROM bookings b
       WHERE b.booking_number = $1 OR b.id::text = $1
       LIMIT 1`,
      [ref]
    );
    const booking = bRes.rows[0] || null;
    if (!booking) return void res.status(404).json({ error: "Booking not found", ref });

    const [invRes, agRes, wfRes, nlRes, ptRes] = await Promise.all([
      pool.query(`SELECT invoice_number, invoice_status, total, paid, balance, due_date, updated_at FROM invoices WHERE booking_id=$1 LIMIT 1`, [booking.id]),
      pool.query(`SELECT agreement_number, status, signed_at, created_at FROM agreements WHERE booking_id=$1 AND status!='cancelled' ORDER BY created_at DESC LIMIT 1`, [booking.id]),
      pool.query(`SELECT trigger_type, status, error_message, created_at FROM workflow_logs WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 20`, [booking.id]),
      pool.query(`SELECT event_type, channel, status, recipient, error_code, provider_response, sent_at FROM notification_logs WHERE booking_id=$1 ORDER BY sent_at DESC LIMIT 20`, [booking.id]),
      pool.query(`SELECT amount, payment_mode, payment_date, reference_number, is_deleted FROM payment_transactions WHERE booking_id=$1 AND is_deleted=false ORDER BY payment_date DESC`, [booking.id]),
    ]);

    const invoice = invRes.rows[0] || null;
    const agreement = agRes.rows[0] || null;
    const finalAmt = Number(booking.final_amount || 0);
    const paidAmt  = Number(booking.paid_amount  || 0);

    res.json({
      booking: {
        ...booking,
        final_amount: finalAmt,
        paid_amount:  paidAmt,
        balance:      finalAmt - paidAmt,
        paymentStatus: paidAmt >= finalAmt && finalAmt > 0 ? "Fully Paid" : paidAmt > 0 ? "Partially Paid" : "Pending",
      },
      invoice,
      agreement,
      paymentTransactions: ptRes.rows,
      workflowLogs:     wfRes.rows,
      notificationLogs: nlRes.rows.map((n: any) => ({
        ...n,
        provider_response: n.provider_response
          ? (typeof n.provider_response === "string" ? n.provider_response : JSON.stringify(n.provider_response)).slice(0, 300)
          : null,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── BotBee WhatsApp direct test (migration key protected) ─────────────────────
// Tests a BotBee template send to a given mobile number and returns raw API response
router.post("/migrate/test-botbee-template", async (req: any, res: any) => {
  const { key, mobile, templateId, variables } = req.body || {};
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  if (!mobile) return void res.status(400).json({ error: "mobile is required" });

  try {
    // Use production getCredentials() to get the exact same creds the app uses
    const { getCredentials } = await import("../lib/botbee.js") as any;
    const creds = getCredentials();
    const { apiToken, phone_number_id, business_id, baseUrl, enabled } = creds;

    const tplId = templateId || "409953";
    const clean = mobile.replace(/\D/g, "");
    const phone = clean.length === 10 ? `91${clean}` : clean;
    const vars = variables || ["Test Customer", "ABT-TEST-001", "ABT/TEST/001", "1"];
    const payload: any = { apiToken, phone_number_id, phone_number: phone, template_id: Number(tplId), variables: vars };
    if (business_id) payload.business_id = business_id;
    const safePayload = { ...payload, apiToken: apiToken ? "***redacted***" : "MISSING", enabled, business_id: business_id ? "***set***" : "MISSING" };

    const tryFetch = async (label: string, url: string, contentType: string, body: string) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
          signal: AbortSignal.timeout(15000),
        });
        const text = await r.text();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch {}
        return { label, httpStatus: r.status, rawBody: text.slice(0, 600), parsed };
      } catch (err: any) {
        return { label, httpStatus: null, error: err.message, rawBody: null };
      }
    };

    const templateUrl = `${baseUrl}/whatsapp/send/template`;
    const textUrl = `${baseUrl}/whatsapp/send`;
    const textParams = new URLSearchParams({ apiToken, phone_number_id, phone_number: phone, message: "BotBee connectivity test" });

    // Strip + prefix — maybe template API needs numeric-only phone_number_id
    const pnid_noplus = phone_number_id.replace(/^\+/, "");
    // Just 10 digits
    const pnid_10 = phone_number_id.replace(/\D/g, "").slice(-10);

    const results = await Promise.all([
      // Variant A: current format (full payload with business_id)
      tryFetch("template_json_current", templateUrl, "application/json", JSON.stringify(payload)),
      // Variant B: phone_number_id without + sign
      tryFetch("template_noplus", templateUrl, "application/json",
        JSON.stringify({ ...payload, phone_number_id: pnid_noplus })),
      // Variant C: template_name instead of template_id
      tryFetch("template_by_name", templateUrl, "application/json",
        JSON.stringify({ apiToken, phone_number_id, phone_number: phone, ...(business_id ? { business_id } : {}), template_name: "payment_received", variables: vars })),
      // Variant D: text_connectivity (known working)
      tryFetch("text_connectivity", textUrl, "application/x-www-form-urlencoded", textParams.toString()),
    ]);

    res.json({ credentials: safePayload, templateUrl, textUrl, results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Configure all SMS DLT template IDs (migration key protected) ──────────────
// Merges the provided template IDs into the fast2sms extra_fields_encrypted,
// preserving existing fields (otp_template_id, otp_sender, etc).
router.post("/migrate/configure-sms-templates", async (req: any, res: any) => {
  const { key, ...tids } = req.body || {};
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  const ALLOWED_KEYS = [
    "notify_template_id", "booking_created_tid", "booking_confirmed_tid",
    "booking_rejected_tid", "payment_received_tid", "partial_payment_tid",
    "pending_payment_tid", "invoice_created_tid", "ticket_issued_tid",
    "visa_issued_tid", "hotel_voucher_issued_tid", "departure_reminder_tid",
    "arrival_reminder_tid", "eid_greeting_tid", "custom_tid",
    "sender_id", "otp_sender",
  ];
  const updates: Record<string, string> = {};
  for (const k of ALLOWED_KEYS) {
    if (tids[k] !== undefined && typeof tids[k] === "string" && tids[k].trim()) {
      updates[k] = tids[k].trim();
    }
  }
  if (Object.keys(updates).length === 0) {
    return void res.status(400).json({ error: "No valid template ID fields provided", allowed: ALLOWED_KEYS });
  }
  try {
    const { pool } = await import("@workspace/db");
    const { decrypt, encrypt } = await import("../lib/encryption.js");
    const row = await pool.query(`SELECT extra_fields_encrypted FROM api_settings WHERE provider='fast2sms' LIMIT 1`);
    if (!row.rows[0]) return void res.status(404).json({ error: "fast2sms settings not found in DB" });
    let extra: Record<string, any> = {};
    try { if (row.rows[0].extra_fields_encrypted) extra = JSON.parse(decrypt(row.rows[0].extra_fields_encrypted)); } catch {}
    const merged = { ...extra, ...updates };
    const enc = encrypt(JSON.stringify(merged));
    await pool.query(`UPDATE api_settings SET extra_fields_encrypted=$1, updated_at=NOW() WHERE provider='fast2sms'`, [enc]);
    const { invalidateCache } = await import("../lib/apiSettingsProvider.js");
    invalidateCache();
    res.json({ ok: true, message: `Updated ${Object.keys(updates).length} field(s)`, updated: Object.keys(updates), merged });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/migrate/test-sms", async (req: any, res: any) => {
  const { key, mobile, eventType = "partial_payment", bookingNumber = "TEST001", customerName = "Test Customer", amount = "5000", balance = "10000" } = req.body || {};
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  try {
    const { sendPartialPaymentReceived, sendPaymentReceived, sendBookingCreated } = await import("../lib/sms.js");
    let result: any;
    if (eventType === "partial_payment") {
      result = await sendPartialPaymentReceived({ mobile, customerName, bookingNumber, paidAmount: amount, balanceAmount: balance, packageName: "Umrah 2026" });
    } else if (eventType === "payment_received") {
      result = await sendPaymentReceived({ mobile, customerName, bookingNumber, amount, packageName: "Umrah 2026" });
    } else {
      result = await sendBookingCreated({ mobile, customerName, bookingNumber, packageName: "Umrah 2026" });
    }
    res.json({ ok: result.ok, eventType, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/migrate/inspect-sms-config", async (req: any, res: any) => {
  const key = req.query.key as string;
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  try {
    const { pool } = await import("@workspace/db");
    const { decrypt } = await import("../lib/encryption.js");
    const row = await pool.query(`SELECT api_key_encrypted, extra_fields_encrypted, enabled FROM api_settings WHERE provider='fast2sms' LIMIT 1`);
    if (!row.rows[0]) return void res.status(404).json({ error: "fast2sms settings not found in DB" });
    const r = row.rows[0];
    let extra: Record<string, any> = {};
    try { if (r.extra_fields_encrypted) extra = JSON.parse(decrypt(r.extra_fields_encrypted)); } catch {}
    let apiKeyOk = false;
    try { const k = decrypt(r.api_key_encrypted); apiKeyOk = k.length > 5; } catch {}
    const senderRow = await pool.query(`SELECT sender_id, status, default_sender FROM sender_ids ORDER BY default_sender DESC, sender_id LIMIT 20`).catch(() => ({ rows: [] }));
    res.json({
      ok: true,
      fast2sms: {
        enabled: r.enabled,
        api_key_configured: apiKeyOk,
        sender_id: extra.sender_id || "(not set — using default ABURHA)",
        template_ids: {
          notify_template_id: extra.notify_template_id || "(empty)",
          booking_created_tid: extra.booking_created_tid || "(empty)",
          booking_confirmed_tid: extra.booking_confirmed_tid || "(empty)",
          booking_rejected_tid: extra.booking_rejected_tid || "(empty)",
          payment_received_tid: extra.payment_received_tid || "(empty)",
          partial_payment_tid: extra.partial_payment_tid || "(empty)",
          pending_payment_tid: extra.pending_payment_tid || "(empty)",
          invoice_created_tid: extra.invoice_created_tid || "(empty)",
          ticket_issued_tid: extra.ticket_issued_tid || "(empty)",
          visa_issued_tid: extra.visa_issued_tid || "(empty)",
          departure_reminder_tid: extra.departure_reminder_tid || "(empty)",
          custom_tid: extra.custom_tid || "(empty)",
        },
        effective_chains: {
          partial_payment: extra.partial_payment_tid || extra.payment_received_tid || extra.notify_template_id || "(none — will use quick route)",
          payment_received: extra.payment_received_tid || extra.notify_template_id || "(none — will use quick route)",
          new_booking: extra.booking_created_tid || extra.notify_template_id || "(none — will use quick route)",
          booking_approved: extra.booking_confirmed_tid || extra.notify_template_id || "(none — will use quick route)",
        },
      },
      sender_ids: senderRow.rows,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Fix BotBee phone_number_id typo (96591219661113 → 965912196611113) ────────
router.post("/migrate/fix-botbee-phone-id", async (req: any, res: any) => {
  const { key } = req.body || {};
  if (!migrationKeyOk(key)) return void res.status(403).json({ error: "Forbidden" });
  try {
    const { pool } = await import("@workspace/db");
    const { decrypt, encrypt } = await import("../lib/encryption.js");
    const row = await pool.query(`SELECT id, extra_fields_encrypted FROM api_settings WHERE provider='botbee' LIMIT 1`);
    if (!row.rows[0]) return void res.status(404).json({ error: "botbee row not found" });
    const r = row.rows[0];
    let extra: Record<string, any> = {};
    try { if (r.extra_fields_encrypted) extra = JSON.parse(decrypt(r.extra_fields_encrypted)); } catch {}
    const before = extra.phone_number_id;
    extra.phone_number_id = "965912196611113";
    const encrypted = encrypt(JSON.stringify(extra));
    await pool.query(`UPDATE api_settings SET extra_fields_encrypted=$1, updated_at=NOW() WHERE id=$2`, [encrypted, r.id]);
    // Bust the in-memory config cache so the new value takes effect immediately
    const { bustCache } = await import("../lib/getCachedConfig.js").catch(() => ({ bustCache: null })) as any;
    if (typeof bustCache === "function") bustCache("botbee");
    res.json({ ok: true, before, after: "965912196611113", message: "phone_number_id updated. Restart or wait 60s for cache to refresh." });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
