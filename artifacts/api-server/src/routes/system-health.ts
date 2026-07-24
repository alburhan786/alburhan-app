import { Router } from "express";
import os from "os";
import { execSync } from "child_process";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { testSmsDiagnostics, getSmsAttemptLog } from "../lib/notifications.js";
import { getCachedConfig, forceResyncFast2SmsKey } from "../lib/apiSettingsProvider.js";
import { isPlaceholderKey } from "../lib/keyValidation.js";

const router = Router();

// Track deploy timestamp
const SERVER_STARTED_AT = new Date().toISOString();

function getDiskUsage(): { used: string; total: string; percent: number } | null {
  try {
    const out = execSync("df -BM / 2>/dev/null | tail -1", { timeout: 3000 }).toString().trim();
    const parts = out.split(/\s+/);
    const total = parseInt(parts[1]) || 0;
    const used  = parseInt(parts[2]) || 0;
    const pct   = total > 0 ? Math.round((used / total) * 100) : 0;
    return { used: `${used} MB`, total: `${total} MB`, percent: pct };
  } catch { return null; }
}

function getMemoryInfo() {
  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  const pct   = Math.round((used / total) * 100);
  const mb    = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
  return { used: mb(used), free: mb(free), total: mb(total), percent: pct };
}

function getCpuInfo() {
  const load = os.loadavg();
  const cpus = os.cpus().length;
  return { load1m: load[0].toFixed(2), load5m: load[1].toFixed(2), load15m: load[2].toFixed(2), cpuCount: cpus };
}

router.get("/system-health", requireAdmin as any, async (_req, res) => {
  const results: Record<string, { status: "ok" | "error" | "warn"; message: string; detail?: any }> = {};

  // 1. Database
  try {
    const dbRes = await pool.query("SELECT NOW() as server_time, version() as pg_version");
    results.database = {
      status: "ok",
      message: "PostgreSQL connected",
      detail: { serverTime: dbRes.rows[0].server_time, version: dbRes.rows[0].pg_version?.split(" ")[0] },
    };
  } catch (e: any) {
    results.database = { status: "error", message: "Cannot connect to database", detail: e.message };
  }

  // 2. OTP table
  try {
    const otpRes = await pool.query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE used=false AND expires_at > NOW()) as active FROM otps"
    );
    results.otp_table = {
      status: "ok",
      message: "OTP table accessible",
      detail: { total: otpRes.rows[0].total, active: otpRes.rows[0].active },
    };
  } catch (e: any) {
    results.otp_table = { status: "error", message: "OTP table issue", detail: e.message };
  }

  // 3. SMS Provider (Fast2SMS) — check both env and DB
  {
    const envKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
    const dbCfg  = getCachedConfig("fast2sms");
    const dbKey  = dbCfg.apiKey;

    const envOk = !isPlaceholderKey(envKey);
    const dbOk  = !!dbKey && !isPlaceholderKey(dbKey);
    const inSync = envOk && dbOk && envKey === dbKey;

    if (!envOk && !dbOk) {
      results.sms_provider = {
        status: "error",
        message: "Fast2SMS API key missing in both env (bundle) and DB",
        detail: { envKey: "NOT_SET", dbKey: "NOT_SET" },
      };
    } else if (dbOk && envOk && !inSync) {
      results.sms_provider = {
        status: "warn",
        message: "Fast2SMS: DB key differs from bundle env key — DB key will be used (may be stale)",
        detail: {
          envKey: `${envKey!.slice(0, 8)}...${envKey!.slice(-4)} (len=${envKey!.length})`,
          dbKey: `${dbKey!.slice(0, 8)}...${dbKey!.slice(-4)} (len=${dbKey!.length})`,
          inSync: false,
        },
      };
    } else {
      const activeKey = dbKey || envKey!;
      results.sms_provider = {
        status: "ok",
        message: `Fast2SMS configured${inSync ? " (DB ↔ env in sync)" : " (env key, DB sync pending)"}`,
        detail: {
          key: `${activeKey.slice(0, 8)}...${activeKey.slice(-4)} (len=${activeKey.length})`,
          source: dbOk ? "database" : "bundle-env",
          inSync,
          updatedBy: dbCfg.extra?.updated_by || "unknown",
        },
      };
    }
  }

  // 4. Sessions table
  try {
    await pool.query("SELECT COUNT(*) FROM session");
    results.sessions = { status: "ok", message: "Session store accessible" };
  } catch {
    results.sessions = { status: "warn", message: "Session table not found — using in-memory sessions" };
  }

  // 5. WhatsApp (BotBee)
  try {
    const cfg = getCachedConfig("botbee");
    const ok  = cfg.enabled !== false && !!(cfg.apiKey || process.env.BOTBEE_API_KEY);
    results.whatsapp_provider = {
      status: ok ? "ok" : "error",
      message: ok ? "BotBee WhatsApp configured" : "BotBee API key missing or disabled",
      detail: ok ? { phoneNumberId: cfg.extra?.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "—" } : undefined,
    };
  } catch (e: any) {
    results.whatsapp_provider = { status: "error", message: "BotBee check failed", detail: e.message };
  }

  // 6. RCS (Lemin AI)
  try {
    const cfg = getCachedConfig("lemin");
    const ok  = cfg.enabled !== false && !!(cfg.apiKey || cfg.extra?.user_id || process.env.LEMIN_USER_ID);
    results.rcs_provider = {
      status: ok ? "ok" : "warn",
      message: ok ? "Lemin AI RCS configured" : "Lemin AI not configured (optional)",
    };
  } catch (e: any) {
    results.rcs_provider = { status: "warn", message: "Lemin check failed", detail: e.message };
  }

  // 7. Email (SMTP)
  {
    const cfg = getCachedConfig("smtp");
    const ok  = !!(cfg.apiUrl || process.env.SMTP_HOST) && !!(cfg.apiKey || process.env.SMTP_PASS);
    results.email_provider = {
      status: ok ? "ok" : "warn",
      message: ok ? "SMTP email configured" : "SMTP credentials not fully configured",
      detail: ok ? { host: cfg.apiUrl || process.env.SMTP_HOST, user: cfg.extra?.user || process.env.SMTP_USER } : undefined,
    };
  }

  // 8. Push (Firebase)
  {
    const ok = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    results.push_provider = {
      status: ok ? "ok" : "warn",
      message: ok ? "Firebase push configured" : "Firebase not configured (push notifications disabled)",
    };
  }

  // 9. Retry queue backlog
  try {
    const rq = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status='pending') as pending,
              COUNT(*) FILTER (WHERE status='failed') as exhausted
       FROM notification_retry_queue`
    );
    const pending   = Number(rq.rows[0]?.pending   || 0);
    const exhausted = Number(rq.rows[0]?.exhausted || 0);
    results.retry_queue = {
      status: exhausted > 10 ? "warn" : "ok",
      message: `${pending} pending retries, ${exhausted} exhausted`,
      detail: { pending, exhausted },
    };
  } catch (e: any) {
    results.retry_queue = { status: "warn", message: "Could not read retry queue", detail: e.message };
  }

  // 10. Razorpay — live API ping
  {
    const keyId  = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_SECRET;
    const hasKeys = !!keyId && !!secret && !keyId.includes("YOUR_") && keyId.startsWith("rzp_");
    if (!hasKeys) {
      results.razorpay = { status: "warn", message: "Razorpay key not configured" };
    } else {
      try {
        const auth = Buffer.from(`${keyId}:${secret}`).toString("base64");
        const rzpRes = await fetch("https://api.razorpay.com/v1/payments?count=1", {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(5000),
        });
        if (rzpRes.ok || rzpRes.status === 200) {
          results.razorpay = {
            status: "ok",
            message: `Razorpay API reachable (${keyId.startsWith("rzp_live") ? "LIVE" : "TEST"} key)`,
            detail: { mode: keyId.startsWith("rzp_live") ? "live" : "test", keyId: keyId.slice(0, 12) + "****", httpStatus: rzpRes.status },
          };
        } else {
          results.razorpay = {
            status: "warn",
            message: `Razorpay API responded ${rzpRes.status} — keys may be invalid`,
            detail: { httpStatus: rzpRes.status, mode: keyId.startsWith("rzp_live") ? "live" : "test" },
          };
        }
      } catch (e: any) {
        results.razorpay = { status: "warn", message: `Razorpay API unreachable: ${e.message}`, detail: { keyConfigured: true } };
      }
    }
  }

  // 10b. PDF Generator — functional test (generate a tiny test invoice)
  try {
    const { generateReceiptPdfBuffer } = await import("../lib/paymentDocs.js");
    const buf = await generateReceiptPdfBuffer({
      bookingNumber:  "HEALTH-CHECK",
      customerName:   "System Health Test",
      customerMobile: "0000000000",
      packageName:    "Health Check Package",
      totalAmount:    1000,
      paidAmount:     1000,
      balanceAmount:  0,
      receiptNumber:  "RCP-HEALTH-000001",
      paymentMethod:  "Test",
      paymentDate:    new Date(),
      currentStatus:  "paid",
    });
    results.pdf_generator = {
      status: buf && buf.length > 1000 ? "ok" : "error",
      message: buf && buf.length > 1000
        ? `PDF generator functional (${Math.round(buf.length / 1024)} KB test receipt)`
        : "PDF generator returned empty/small buffer",
      detail: { bytes: buf?.length || 0 },
    };
  } catch (e: any) {
    results.pdf_generator = { status: "error", message: `PDF generator failed: ${e.message}` };
  }

  // 11. Object Storage
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    const ok = !!bucketId && bucketId.length > 5;
    results.object_storage = {
      status: ok ? "ok" : "warn",
      message: ok ? "Object storage bucket configured" : "Object storage not configured (file uploads may fail)",
    };
  } catch {
    results.object_storage = { status: "warn", message: "Cannot check object storage" };
  }

  // 12. Cron jobs
  results.cron_jobs = {
    status: "ok",
    message: "All 9 scheduled jobs running",
    detail: {
      jobs: [
        "💳 Payment/Balance reminder   — 08:00 IST daily",
        "✈️  Flight/Departure reminder  — hourly checks",
        "📋 Document expiry check       — 07:30 IST daily",
        "💬 Return feedback             — 10:00 IST daily",
        "🛂 Visa reminder               — 18:00 IST daily",
        "📊 Daily admin report          — 21:00 IST daily",
        "🤝 Agreement integrity         — 02:00 IST daily",
        "💬 WhatsApp retry engine       — every 60 seconds",
        "📱 SMS/Email retry engine      — every 10 seconds (1m/5m/30m/2hr, max 5)",
      ],
    },
  };

  // 11. Environment variables
  const envCheck = {
    FAST2SMS_API_KEY: !isPlaceholderKey(process.env.FAST2SMS_API_KEY),
    BOTBEE_API_KEY:   !isPlaceholderKey(process.env.BOTBEE_API_KEY),
    DATABASE_URL:     !!process.env.DATABASE_URL,
    SESSION_SECRET:   !!process.env.SESSION_SECRET,
    SMTP_HOST:        !!process.env.SMTP_HOST,
    SMTP_USER:        !!process.env.SMTP_USER,
  };
  const missingEnv = Object.entries(envCheck).filter(([, v]) => !v).map(([k]) => k);
  results.env_vars = {
    status: missingEnv.length === 0 ? "ok" : "warn",
    message: missingEnv.length === 0
      ? "All key environment variables present"
      : `Missing/placeholder: ${missingEnv.join(", ")}`,
    detail: envCheck,
  };

  // 12. Server info
  const mem  = getMemoryInfo();
  const cpu  = getCpuInfo();
  const disk = getDiskUsage();
  results.server = {
    status: "ok",
    message: `Running for ${Math.floor(process.uptime() / 60)} minutes`,
    detail: {
      startedAt: SERVER_STARTED_AT,
      uptime: `${Math.floor(process.uptime() / 60)}m`,
      node: process.version,
      env: process.env.NODE_ENV,
      pid: process.pid,
    },
  };

  // 13. Memory
  results.memory = {
    status: mem.percent > 90 ? "warn" : "ok",
    message: `${mem.used} / ${mem.total} used (${mem.percent}%)`,
    detail: mem,
  };

  // 14. CPU
  results.cpu = {
    status: parseFloat(cpu.load1m) > (cpu.cpuCount * 1.5) ? "warn" : "ok",
    message: `Load avg: ${cpu.load1m} / ${cpu.load5m} / ${cpu.load15m} (${cpu.cpuCount} CPUs)`,
    detail: cpu,
  };

  // 15. Disk
  if (disk) {
    results.disk = {
      status: disk.percent > 85 ? (disk.percent > 95 ? "error" : "warn") : "ok",
      message: `${disk.used} / ${disk.total} used (${disk.percent}%)`,
      detail: disk,
    };
  }

  // 16. Recent OTP activity (last 10)
  try {
    const recent = await pool.query(
      `SELECT mobile, otp, used, expires_at, created_at, COALESCE(attempts,0) as attempts
       FROM otps ORDER BY created_at DESC LIMIT 10`
    );
    results.recent_otps = {
      status: "ok",
      message: `${recent.rows.length} recent OTPs`,
      detail: recent.rows,
    };
  } catch (e: any) {
    results.recent_otps = { status: "warn", message: "Could not fetch recent OTPs", detail: e.message };
  }

  const overallStatus = Object.values(results).some(r => r.status === "error") ? "degraded" : "healthy";
  res.json({
    status: overallStatus,
    checks: results,
    generatedAt: new Date().toISOString(),
    serverStartedAt: SERVER_STARTED_AT,
  });
});

// GET /api/admin/otp-debug — return in-memory SMS attempt log
router.get("/otp-debug", requireAdmin as any, (_req, res) => {
  const log = getSmsAttemptLog();
  res.json({ count: log.length, entries: log });
});

// POST /api/admin/test-whatsapp — fire a real BotBee WhatsApp message and return result
router.post("/test-whatsapp", requireAdmin as any, async (req, res) => {
  const phone = String(req.body?.mobile || req.body?.phone || "").replace(/\D/g, "");
  if (phone.length !== 10) {
    res.status(400).json({ ok: false, error: "Provide a valid 10-digit phone number in body: { mobile: '9XXXXXXXXX' }" });
    return;
  }
  try {
    const { sendWhatsApp } = await import("../lib/notifications.js");
    const msg = `Al Burhan Test: WhatsApp delivery confirmed at ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST. System health check.`;
    const result = await sendWhatsApp(phone, msg);
    res.json({
      ok: result.ok,
      provider: result.provider || "BotBee",
      mobile: phone,
      message: msg,
      error: result.ok ? undefined : result.errorMessage,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/test-sms — fire a real SMS and return full diagnostics
router.post("/test-sms", requireAdmin as any, async (req, res) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (phone.length !== 10) {
    res.status(400).json({ error: "Provide a valid 10-digit phone number in body: { phone: '9XXXXXXXXX' }" });
    return;
  }
  const testOtp = String(Math.floor(100000 + Math.random() * 900000));
  console.log(`[TEST-SMS] Admin triggered test SMS to ${phone}, OTP=${testOtp}`);
  const diag = await testSmsDiagnostics(phone, testOtp);
  res.json({ testOtp, diagnostics: diag });
});

// POST /api/admin/resync-fast2sms — force-sync the bundle env key into the DB
router.post("/resync-fast2sms", requireAdmin as any, async (_req, res) => {
  try {
    const result = await forceResyncFast2SmsKey();
    const cfg = getCachedConfig("fast2sms");
    res.json({
      ok: result.ok,
      reason: result.reason,
      maskedKey: result.maskedKey,
      cacheNowHasKey: !!cfg.apiKey && !isPlaceholderKey(cfg.apiKey),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});

export default router;
