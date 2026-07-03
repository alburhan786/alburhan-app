import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

router.get("/system-health", requireAdmin as any, async (_req, res) => {
  const results: Record<string, { status: "ok" | "error" | "warn"; message: string; detail?: any }> = {};

  // 1. Database
  try {
    const dbRes = await pool.query("SELECT NOW() as server_time, version() as pg_version");
    results.database = { status: "ok", message: "Connected", detail: { serverTime: dbRes.rows[0].server_time, version: dbRes.rows[0].pg_version?.split(" ")[0] } };
  } catch (e: any) {
    results.database = { status: "error", message: "Cannot connect to database", detail: e.message };
  }

  // 2. OTP table
  try {
    const otpRes = await pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE used=false AND expires_at > NOW()) as active FROM otps");
    results.otp_table = { status: "ok", message: "OTP table accessible", detail: { total: otpRes.rows[0].total, active: otpRes.rows[0].active } };
  } catch (e: any) {
    results.otp_table = { status: "error", message: "OTP table issue", detail: e.message };
  }

  // 3. SMS Provider (Fast2SMS)
  const fast2smsKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
  const isPlaceholder = !fast2smsKey || fast2smsKey === "your_key_here" || fast2smsKey === "your-fast2sms-key-here";
  if (isPlaceholder) {
    results.sms_provider = { status: "error", message: "FAST2SMS_API_KEY not set or is placeholder", detail: { key: fast2smsKey ? `${fast2smsKey.slice(0, 6)}... (placeholder!)` : "NOT SET" } };
  } else {
    results.sms_provider = { status: "ok", message: "Fast2SMS API key configured", detail: { key: `${fast2smsKey.slice(0, 6)}...${fast2smsKey.slice(-4)}`, length: fast2smsKey.length } };
  }

  // 4. Sessions table
  try {
    await pool.query("SELECT COUNT(*) FROM session");
    results.sessions = { status: "ok", message: "Session table accessible" };
  } catch {
    results.sessions = { status: "warn", message: "Session table not found" };
  }

  // 5. Environment variables summary
  const envCheck = {
    FAST2SMS_API_KEY: !!process.env.FAST2SMS_API_KEY,
    FAST2SMS_XXL_API_KEY: !!process.env.FAST2SMS_XXL_API_KEY,
    BOTBEE_API_KEY: !!process.env.BOTBEE_API_KEY,
    DATABASE_URL: !!process.env.DATABASE_URL,
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY || !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  };
  const missingEnv = Object.entries(envCheck).filter(([, v]) => !v).map(([k]) => k);
  results.env_vars = {
    status: missingEnv.length === 0 ? "ok" : "warn",
    message: missingEnv.length === 0 ? "All key env vars present" : `Missing: ${missingEnv.join(", ")}`,
    detail: envCheck,
  };

  // 6. Server time
  results.server = {
    status: "ok",
    message: "Server running",
    detail: {
      time: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime() / 60)} minutes`,
      node: process.version,
      env: process.env.NODE_ENV,
    },
  };

  // 7. Recent OTP activity (last 10)
  try {
    const recent = await pool.query(
      `SELECT mobile, LEFT(otp,2)||'****' as otp_masked, used, expires_at, created_at, COALESCE(attempts,0) as attempts FROM otps ORDER BY created_at DESC LIMIT 10`
    );
    results.recent_otps = { status: "ok", message: `${recent.rows.length} recent OTPs`, detail: recent.rows };
  } catch (e: any) {
    results.recent_otps = { status: "warn", message: "Could not fetch recent OTPs", detail: e.message };
  }

  const overallStatus = Object.values(results).some(r => r.status === "error") ? "degraded" : "healthy";

  res.json({ status: overallStatus, checks: results, generatedAt: new Date().toISOString() });
});

export default router;
