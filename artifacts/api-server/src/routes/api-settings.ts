import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { encrypt, decrypt, maskKey } from "../lib/encryption.js";
import { invalidateCache } from "../lib/apiSettingsProvider.js";
import { auditLog } from "../lib/audit.js";
import { isPlaceholderKey } from "../lib/keyValidation.js";
import axios from "axios";
import nodemailer from "nodemailer";

const router = Router();

// Super Admin only guard
function requireSuperAdmin(req: any, res: any, next: any) {
  const role = req.user?.adminRole;
  if (role !== "super_admin" && role !== "admin") {
    return void res.status(403).json({ message: "Admin access required" });
  }
  next();
}

const PROVIDERS = ["botbee", "fast2sms", "lemin", "smtp", "firebase", "razorpay"] as const;
type Provider = typeof PROVIDERS[number];

/**
 * Hardcoded test variables for each approved Lemin template ID.
 * Keys are the EXACT strings Lemin expects (confirmed by live API probe Aug 2026).
 * This map is authoritative — do NOT rely on rcs_template_mappings.variables_required
 * for test sends because old DB rows may have incorrect key names.
 */
const LEMIN_TEMPLATE_TEST_VARS: Record<string, Record<string, string>> = {
  // 3651 booking_submitted   — plain "name"
  "3651": { "name": "Test User" },
  // 3652 booking_confirmed/approved — plain "name"
  "3652": { "name": "Test User" },
  // 3655 pending_payment_reminder — plain "name"
  "3655": { "name": "Test User" },
  // 3656 payment_received — plain-English-with-spaces keys (unique to this template)
  "3656": { "booking id": "TEST-001", "invoice no": "INV-TEST-001", "{{amount}}": "50,000", "{{customer_name}}": "Test User" },
  // 3657 invoice_ready — double-brace keys
  "3657": { "{{customer_name}}": "Test User", "{{invoice_number}}": "INV-TEST-001", "{{booking_id}}": "TEST-001", "{{amount}}": "50,000" },
  // 3659 flight_ticket — double-brace keys + composite departure key
  "3659": { "{{customer_name}}": "Test User", "{{booking_id}}": "TEST-001", "{{ticket_number}}": "AI-501", "{{flight_number}}": "AI-501", "{{departure_date}} at {{departure_time}}": "01 Jan 2027 at 10:00" },
  // 3660 visa_ready — double-brace keys
  "3660": { "{{booking_id}}": "TEST-001", "{{visa_number}}": "V-TEST-2027-001", "{{package_name}}": "Hajj 2027", "{{customer_name}}": "Test User" },
  // 3661 agreement_ready — hash-bang keys with literal emoji/punctuation prefixes
  "3661": { "#!name!#": "Test User", ": #!agreement!#": "ABT-AGR-TEST-001", "\uD83D\uDD17 #!download!#": "https://alburhantravels.com/sign-agreement/test", "#!bookingid!#": "TEST-001" },
  // 3663 login_otp — plain "otp"
  "3663": { "otp": "123456" },
};

/**
 * Returns test variables for a template. Checks the hardcoded map first (by template ID),
 * then falls back to building from variable-key names if the ID is unknown.
 * Guaranteed to return a non-empty object for all approved templates.
 */
function buildTestVariables(templateId: string, fallbackKeys: string[] = []): Record<string, string> {
  // Primary: hardcoded map — authoritative, no DB dependency
  if (LEMIN_TEMPLATE_TEST_VARS[templateId]) {
    return { ...LEMIN_TEMPLATE_TEST_VARS[templateId] };
  }
  // Secondary: build from key names (for unknown templates added after this map was written)
  const KEY_DEFAULTS: Record<string, string> = {
    "name": "Test User",
    "otp": "123456",
    "booking id": "TEST-001",
    "invoice no": "INV-TEST-001",
    "{{customer_name}}": "Test User",
    "{{booking_id}}": "TEST-001",
    "{{invoice_number}}": "INV-TEST-001",
    "{{amount}}": "50,000",
    "{{visa_number}}": "V-TEST-2027-001",
    "{{package_name}}": "Hajj 2027",
    "{{ticket_number}}": "AI-501",
    "{{flight_number}}": "AI-501",
    "{{departure_date}} at {{departure_time}}": "01 Jan 2027 at 10:00",
    "#!name!#": "Test User",
    ": #!agreement!#": "ABT-AGR-TEST-001",
    "\uD83D\uDD17 #!download!#": "https://alburhantravels.com/sign-agreement/test",
    "#!bookingid!#": "TEST-001",
  };
  if (fallbackKeys.length === 0) return { "name": "Test User" }; // absolute last resort
  const out: Record<string, string> = {};
  for (const k of fallbackKeys) {
    // Only include key if it has a known mapping — skip placeholder [key] values that Lemin will reject
    if (KEY_DEFAULTS[k] !== undefined) out[k] = KEY_DEFAULTS[k];
  }
  return Object.keys(out).length > 0 ? out : { "name": "Test User" };
}

// GET /api/api-settings — all providers with masked keys
router.get("/", requireAdmin as any, requireSuperAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM api_settings ORDER BY provider`);
    const rows = result.rows.map(row => ({
      id: row.id,
      provider: row.provider,
      enabled: row.enabled,
      api_url: row.api_url,
      api_key_masked: row.api_key_encrypted ? maskKey(decrypt(row.api_key_encrypted)) : null,
      extra_fields: (() => {
        if (!row.extra_fields_encrypted) return {};
        try {
          const raw = JSON.parse(decrypt(row.extra_fields_encrypted));
          // Mask sensitive extra fields
          const masked: Record<string, string> = {};
          for (const [k, v] of Object.entries(raw)) {
            const sensitive = ["key_secret", "password", "pass", "secret"].some(s => k.includes(s));
            masked[k] = sensitive ? maskKey(String(v)) : String(v ?? "");
          }
          return masked;
        } catch { return {}; }
      })(),
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      status: row.status || "unknown",
      last_tested: row.last_tested || null,
    }));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/api-settings/:provider — single provider (for edit form, also masked)
router.get("/:provider", requireAdmin as any, requireSuperAdmin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM api_settings WHERE provider=$1`, [req.params.provider]);
    if (!r.rows[0]) return void res.status(404).json({ message: "Not found" });
    const row = r.rows[0];
    const decrypted = row.extra_fields_encrypted ? (() => {
      try { return JSON.parse(decrypt(row.extra_fields_encrypted)); } catch { return {}; }
    })() : {};
    // Mask sensitive extra fields for display
    const displayExtra: Record<string, string> = {};
    for (const [k, v] of Object.entries(decrypted)) {
      const sensitive = ["key_secret", "password", "pass", "secret"].some(s => k.includes(s));
      displayExtra[k] = sensitive ? maskKey(String(v ?? "")) : String(v ?? "");
    }
    res.json({
      provider: row.provider,
      enabled: row.enabled,
      api_url: row.api_url,
      api_key_masked: row.api_key_encrypted ? maskKey(decrypt(row.api_key_encrypted)) : null,
      extra_fields: displayExtra,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/api-settings/:provider — save credentials (Super Admin only)
router.put("/:provider", requireAdmin as any, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const provider = req.params.provider as Provider;
  if (!PROVIDERS.includes(provider)) return void res.status(400).json({ message: "Invalid provider" });

  try {
    const { enabled, api_url, api_key, extra_fields } = req.body;

    // Fetch existing record to preserve encrypted values if not changed
    const existing = await pool.query(`SELECT * FROM api_settings WHERE provider=$1`, [provider]);
    const existingRow = existing.rows[0];

    // Encrypt API key — if new value provided and not masked placeholder, use it; else keep existing
    let apiKeyEncrypted = existingRow?.api_key_encrypted ?? null;
    if (api_key !== undefined && api_key !== null && !api_key.startsWith("****")) {
      apiKeyEncrypted = api_key ? encrypt(api_key) : null;
    }

    // Handle extra fields — only update fields that aren't masked placeholders
    let extraEncrypted = existingRow?.extra_fields_encrypted ?? null;
    if (extra_fields && Object.keys(extra_fields).length > 0) {
      let existingExtra: Record<string, string> = {};
      if (existingRow?.extra_fields_encrypted) {
        try { existingExtra = JSON.parse(decrypt(existingRow.extra_fields_encrypted)); } catch {}
      }
      const merged = { ...existingExtra };
      for (const [k, v] of Object.entries(extra_fields as Record<string, string>)) {
        if (v !== undefined && v !== null && !String(v).startsWith("****")) {
          merged[k] = String(v);
        }
      }
      extraEncrypted = encrypt(JSON.stringify(merged));
    }

    await pool.query(`
      INSERT INTO api_settings (provider, enabled, api_url, api_key_encrypted, extra_fields_encrypted, updated_at, updated_by)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      ON CONFLICT (provider) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        api_url = EXCLUDED.api_url,
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        extra_fields_encrypted = EXCLUDED.extra_fields_encrypted,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    `, [provider, enabled ?? true, api_url || null, apiKeyEncrypted, extraEncrypted, (req.user as any)?.name || (req.user as any)?.mobile || "admin"]);

    // Audit log
    auditLog({
      req,
      action: "updated",
      entityTable: "api_settings",
      entityId: provider,
      newValue: { provider, enabled, api_url, has_api_key: !!apiKeyEncrypted },
    }).catch(() => {});

    // Invalidate cache so next notification uses new settings
    invalidateCache();

    // Also flush FCM credential cache so updated service account takes effect immediately
    if (provider === "firebase") {
      const { invalidateFCMCredCache } = await import("../lib/fcm.js");
      invalidateFCMCredCache();
    }

    // ── Auto-verify Fast2SMS immediately after save: wallet check + real test SMS ──
    let autoTest: Record<string, any> | undefined;
    if (provider === "fast2sms") {
      const savedKey = apiKeyEncrypted ? decrypt(apiKeyEncrypted) : "";
      if (!savedKey || isPlaceholderKey(savedKey)) {
        autoTest = { ok: false, message: "Fast2SMS API Key is not configured." };
      } else {
        const walletResp = await axios
          .get(`https://www.fast2sms.com/dev/wallet?authorization=${savedKey}`, { timeout: 8000 })
          .catch((e) => e.response || { data: { error: e.message }, status: 0 });
        const walletOk = walletResp.data?.return === true;
        const isAuthError = walletResp.status === 412 || /invalid authentication/i.test(JSON.stringify(walletResp.data?.message || ""));
        autoTest = {
          ok: walletOk,
          walletBalance: walletOk ? walletResp.data?.wallet : undefined,
          message: walletOk
            ? `Connected — Wallet balance: ₹${walletResp.data?.wallet ?? "?"}`
            : (isAuthError ? "Invalid Fast2SMS Authorization Key." : "Fast2SMS connection failed"),
        };

        await pool.query(
          `UPDATE api_settings SET status=$1, last_tested=NOW() WHERE provider='fast2sms'`,
          [walletOk ? "connected" : "failed"]
        ).catch(() => {});

        // Auto send a real test SMS to confirm end-to-end delivery, only if key is valid
        if (walletOk) {
          const adminMobile = (req.user as any)?.mobile;
          if (adminMobile && /^[6-9]\d{9}$/.test(adminMobile)) {
            const { sendOtpSMS } = await import("../lib/notifications.js");
            const testOtp = String(Math.floor(100000 + Math.random() * 900000));
            const smsResult = await sendOtpSMS(adminMobile, testOtp);
            autoTest.testSmsSent = smsResult.sent;
            autoTest.testSmsResponse = smsResult.providerResponse;
            autoTest.testSmsError = smsResult.error;
            await pool.query(
              `UPDATE api_settings SET last_sms_status=$1, last_sms_at=NOW() WHERE provider='fast2sms'`,
              [smsResult.sent ? "sent" : `failed: ${smsResult.error || "unknown"}`]
            ).catch(() => {});
          } else {
            autoTest.testSmsSent = false;
            autoTest.testSmsError = "No verified admin mobile on this session to send a live test to";
          }
        }
      }
    }

    res.json({ ok: true, message: `${provider} settings saved`, autoTest });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/api-settings/fast2sms/status — live status snapshot for the admin "Show Current Status" view
router.get("/fast2sms/status", requireAdmin as any, requireSuperAdmin, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM api_settings WHERE provider='fast2sms'`);
    const row = r.rows[0];
    const apiKey = row?.api_key_encrypted ? decrypt(row.api_key_encrypted) : "";
    const apiKeyLoaded = !!apiKey && !isPlaceholderKey(apiKey);
    let extra: Record<string, string> = {};
    if (row?.extra_fields_encrypted) {
      try { extra = JSON.parse(decrypt(row.extra_fields_encrypted)); } catch {}
    }

    let walletBalance: string | number | null = null;
    let walletError: string | undefined;
    if (apiKeyLoaded) {
      const walletResp = await axios
        .get(`https://www.fast2sms.com/dev/wallet?authorization=${apiKey}`, { timeout: 8000 })
        .catch((e) => e.response || { data: { error: e.message }, status: 0 });
      if (walletResp.data?.return === true) {
        walletBalance = walletResp.data?.wallet ?? null;
      } else {
        const isAuthError = walletResp.status === 412 || /invalid authentication/i.test(JSON.stringify(walletResp.data?.message || ""));
        walletError = isAuthError ? "Invalid Fast2SMS Authorization Key." : "Could not fetch wallet balance";
      }
    }

    res.json({
      apiKeyLoaded,
      apiKeyMasked: apiKeyLoaded ? maskKey(apiKey) : null,
      senderId: extra.sender_id || "ALBURH",
      otpTemplateId: extra.otp_template_id || "164844",
      walletBalance,
      walletError,
      lastTestTime: row?.last_tested || null,
      lastTestStatus: row?.status || "unknown",
      lastSmsStatus: row?.last_sms_status || null,
      lastSmsAt: row?.last_sms_at || null,
      otpSendingEnabled: apiKeyLoaded && row?.status === "connected",
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/api-settings/:provider/test — test connection (saves result to DB)
router.post("/:provider/test", requireAdmin as any, requireSuperAdmin, async (req, res) => {
  const provider = req.params.provider;
  try {
    const r = await pool.query(`SELECT * FROM api_settings WHERE provider=$1`, [provider]);
    const row = r.rows[0];
    const apiKey = row?.api_key_encrypted ? decrypt(row.api_key_encrypted) : "";
    const apiUrl = row?.api_url || "";
    let extra: Record<string, string> = {};
    if (row?.extra_fields_encrypted) {
      try { extra = JSON.parse(decrypt(row.extra_fields_encrypted)); } catch {}
    }

    let result: { ok: boolean; message?: string; httpStatus?: number; response?: any } = { ok: false, message: "Unknown provider" };

    switch (provider) {
      case "botbee": {
        if (!apiKey) { result = { ok: false, message: "API key not set" }; break; }
        // Normalize phone_number_id: BotBee expects digits only (no + prefix)
        const rawPhoneId = extra.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "";
        const phoneNumberId = rawPhoneId.replace(/^\+/, "").replace(/\s/g, "");
        const baseUrl = apiUrl || "https://app.botbee.io/api/v1/whatsapp";
        const params = new URLSearchParams({ apiToken: apiKey, phone_number_id: phoneNumberId });
        const resp = await axios.get(`${baseUrl}/status?${params}`, { timeout: 8000 }).catch(e => e.response || { data: { error: e.message }, status: 0 });
        // BotBee /status: ok if 2xx OR if response contains a known "active" field
        const botbeeOk = (resp.status >= 200 && resp.status < 300) ||
          resp.data?.status === "active" || resp.data?.active === true;
        const botbeeMsg = botbeeOk
          ? `Connected (phone_id: ${phoneNumberId})`
          : `Failed — HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 200)}`;
        result = { ok: botbeeOk, message: botbeeMsg, httpStatus: resp.status, response: resp.data };
        break;
      }
      case "fast2sms": {
        if (!apiKey || isPlaceholderKey(apiKey)) { result = { ok: false, message: "Fast2SMS API Key is not configured." }; break; }
        const resp = await axios.get(`https://www.fast2sms.com/dev/wallet?authorization=${apiKey}`, { timeout: 8000 }).catch(e => e.response || { data: { error: e.message }, status: 0 });
        const ok = resp.data?.return === true;
        const isAuthError = resp.status === 412 || /invalid authentication/i.test(JSON.stringify(resp.data?.message || ""));
        result = {
          ok,
          message: ok
            ? `Wallet balance: ₹${resp.data?.wallet || "?"}`
            : (isAuthError ? "Invalid Fast2SMS Authorization Key." : "Invalid API key"),
          httpStatus: resp.status,
          response: resp.data,
        };
        break;
      }
      case "lemin": {
        // Env vars take precedence over DB-stored values — never expose key in response
        const leminKey     = process.env.LEMIN_API_KEY  || apiKey || extra.user_id || "";
        const leminBaseUrl = process.env.LEMIN_BASE_URL || apiUrl  || "https://rcs.leminai.com";
        const dialCode     = process.env.LEMIN_DIAL_CODE || extra.dial_code || "+91";
        // Read approved template from DB; fall back to booking_submitted (3651) — never 1473
        let templateId = extra.template_id || "";
        if (!templateId) {
          try {
            const tmplRow = await pool.query(
              `SELECT template_id FROM rcs_template_mappings WHERE erp_event='booking_submitted' AND enabled=true AND template_id IS NOT NULL LIMIT 1`
            );
            templateId = tmplRow.rows[0]?.template_id || "3651";
          } catch { templateId = "3651"; }
        }
        if (!leminKey) { result = { ok: false, message: "User ID (Developer API Key) not set — save settings first" }; break; }
        // Real API call with test variables so Lemin doesn't reject with "Failed to process single payload"
        const leminEndpoint = `${leminBaseUrl.replace(/\/$/, "")}/api/send/template`;
        // Fetch variables_required for this template; fall back to ["name"] (template 3651 default)
        let probeVarKeys: string[] = ["name"];
        try {
          const pvRow = await pool.query(
            `SELECT variables_required FROM rcs_template_mappings WHERE template_id=$1 AND enabled=true LIMIT 1`,
            [templateId]
          );
          if (pvRow.rows[0]?.variables_required?.length) probeVarKeys = pvRow.rows[0].variables_required;
        } catch { /* use default */ }
        const probePayload = {
          type: "single", dial_code: dialCode, template: templateId,
          phone: "9893989786", variables: buildTestVariables(probeVarKeys), user_id: leminKey,
        };
        try {
          const resp = await axios.post(leminEndpoint, probePayload, { headers: { "Content-Type": "application/json" }, timeout: 12000 });
          const body = resp.data || {};
          const errTxt = String(body.message || body.error || "").toLowerCase();
          const ok = resp.status >= 200 && resp.status < 300 && body.success !== false && body.status !== false
            && !errTxt.includes("invalid user") && !errTxt.includes("template not found");
          result = {
            ok,
            message: ok
              ? `RCS connected — agent: ${rcsAgent}, dial: ${dialCode}, template: ${templateId}`
              : `Lemin error: ${body.message || body.error || `HTTP ${resp.status}`}`,
          };
        } catch (e: any) {
          const er = e?.response; const body = er?.data || {};
          const invalidKey = String(body.message || body.error || "").toLowerCase().includes("invalid user");
          result = {
            ok: false,
            message: invalidKey
              ? "Invalid LEMIN_API_KEY — check secret value"
              : `Lemin API error: ${body.message || body.error || e.message}`,
          };
        }
        break;
      }
      case "smtp": {
        const smtpHost = apiUrl || extra.host || process.env.SMTP_HOST || "smtp.gmail.com";
        const smtpUser = extra.user || process.env.SMTP_USER || "";
        const smtpPass = apiKey || process.env.SMTP_PASS || "";
        if (!smtpUser || !smtpPass) { result = { ok: false, message: "SMTP user/password not configured" }; break; }
        const transport = nodemailer.createTransport({
          host: smtpHost, port: Number(extra.port || 587),
          secure: Number(extra.port || 587) === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });
        const verified = await transport.verify().then(() => true).catch((e: any) => String(e.message));
        result = { ok: verified === true, message: verified === true ? "SMTP connected" : String(verified) };
        break;
      }
      case "firebase": {
        // Real credential validation: exchange a Google OAuth2 access token
        try {
          const { testFCMConnection } = await import("../lib/fcm.js");
          const r = await testFCMConnection();
          result = {
            ok: r.ok,
            message: r.ok
              ? r.message
              : [r.error, r.hint ? `Hint: ${r.hint}` : ""].filter(Boolean).join(" — "),
          };
        } catch (e: any) {
          result = { ok: false, message: e.message };
        }
        break;
      }
      case "razorpay": {
        if (!apiKey) { result = { ok: false, message: "Razorpay Key ID not set" }; break; }
        const keySecret = extra.key_secret || process.env.RAZORPAY_SECRET || "";
        if (!keySecret) { result = { ok: false, message: "Razorpay Key Secret not set" }; break; }
        const resp = await axios.get("https://api.razorpay.com/v1/payments?count=1", {
          auth: { username: apiKey, password: keySecret }, timeout: 8000,
        }).catch(e => e.response || { data: { error: e.message }, status: 0 });
        result = { ok: resp.status === 200, httpStatus: resp.status, message: resp.status === 200 ? "Razorpay connected" : "Invalid credentials" };
        break;
      }
    }

    // Persist test result so dashboard can show last known status
    await pool.query(
      `UPDATE api_settings SET status=$1, last_tested=NOW() WHERE provider=$2`,
      [result.ok ? "connected" : "failed", provider]
    ).catch(() => {});

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/api-settings/:provider/send-test — send actual test message, log to notification_logs
router.post("/:provider/send-test", requireAdmin as any, requireSuperAdmin, async (req, res) => {
  const provider = req.params.provider;
  const { mobile, email } = req.body;

  try {
    const r = await pool.query(`SELECT * FROM api_settings WHERE provider=$1`, [provider]);
    const row = r.rows[0];
    const apiKey = row?.api_key_encrypted ? decrypt(row.api_key_encrypted) : "";
    const apiUrl = row?.api_url || "";
    let extra: Record<string, string> = {};
    if (row?.extra_fields_encrypted) {
      try { extra = JSON.parse(decrypt(row.extra_fields_encrypted)); } catch {}
    }

    interface TestResult {
      ok: boolean;
      provider: string;
      endpoint: string;
      httpStatus?: number;
      requestPayload?: unknown;
      responsePayload?: unknown;
      errorCode?: string;
      errorMessage?: string;
      message?: string;
      messageId?: string;
    }

    let result: TestResult = { ok: false, provider, endpoint: "" };
    let channel = "whatsapp";
    let recipient = mobile || email || "test";

    switch (provider) {
      case "botbee": {
        if (!mobile) return void res.json({ ok: false, message: "Provide a mobile number" });
        if (!apiKey) return void res.json({ ok: false, message: "API key not configured" });
        channel = "whatsapp";
        recipient = mobile;
        const phone = mobile.replace(/\D/g, "");
        const phoneWithCC = phone.length === 10 ? `91${phone}` : phone;
        const phoneNumberId = (extra.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "").replace(/^\+/, "").replace(/\s/g, "");
        const baseUrl = apiUrl || "https://app.botbee.io/api/v1/whatsapp";
        const endpoint = `${baseUrl}/send`;
        const testMsg = "✅ WhatsApp Integration Successful.\nAl Burhan Tours & Travels Notification System is Connected.";
        const reqPayload = { phone_number_id: phoneNumberId, phone_number: phoneWithCC, message: testMsg };
        const params = new URLSearchParams({ apiToken: apiKey, phone_number_id: phoneNumberId, phone_number: phoneWithCC, message: testMsg });
        let httpStatus = 0; let respData: any = {};
        try {
          const resp = await axios.post(endpoint, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 });
          httpStatus = resp.status; respData = resp.data;
          const ok = !(respData?.status === "0" || respData?.status === 0);
          const messageId = respData?.message_id || respData?.messageId || respData?.id || respData?.data?.id || undefined;
          result = { ok, provider: "BotBee", endpoint, httpStatus, requestPayload: reqPayload, responsePayload: respData, messageId, errorMessage: ok ? undefined : (respData?.message || "Message delivery failed") };
        } catch (e: any) {
          const er = e?.response; httpStatus = er?.status || 0; respData = er?.data || { error: e.message };
          result = { ok: false, provider: "BotBee", endpoint, httpStatus, requestPayload: reqPayload, responsePayload: respData, errorCode: String(respData?.code || ""), errorMessage: respData?.message || respData?.error || e.message };
        }
        break;
      }
      case "fast2sms": {
        if (!mobile) return void res.json({ ok: false, message: "Provide a mobile number" });
        if (!apiKey) return void res.json({ ok: false, message: "API key not configured" });
        channel = "sms";
        recipient = mobile;
        const phone = mobile.replace(/\D/g, "").slice(-10);
        const testMsg = "Al Burhan Tours & Travels SMS integration is working successfully.";
        const senderId = extra.sender_id || "ALBURH";
        const templateId = extra.notify_template_id || "211277";
        const endpoint = `https://www.fast2sms.com/dev/bulkV2`;
        // DLT only — Quick/Promotional routes are blocked per India DLT compliance policy
        const dltUrl = `${endpoint}?authorization=${apiKey}&route=dlt&sender_id=${senderId}&message=${templateId}&variables_values=${encodeURIComponent("Al Burhan|Test|Success|")}&numbers=${phone}&flash=0`;
        const reqPayload = { route: "dlt", sender_id: senderId, template_id: templateId, numbers: phone };
        let httpStatus = 0; let respData: any = {};
        try {
          const resp = await axios.get(dltUrl, { timeout: 10000 });
          httpStatus = resp.status; respData = resp.data;
          const ok = respData?.return === true;
          result = { ok, provider: "Fast2SMS", endpoint, httpStatus, requestPayload: reqPayload, responsePayload: respData, messageId: respData?.request_id, errorMessage: ok ? undefined : (Array.isArray(respData?.message) ? respData.message.join("; ") : respData?.message || "SMS delivery failed") };
        } catch (e: any) {
          const er = e?.response; httpStatus = er?.status || 0; respData = er?.data || { error: e.message };
          result = { ok: false, provider: "Fast2SMS", endpoint, httpStatus, requestPayload: reqPayload, responsePayload: respData, errorCode: String(respData?.status_code || respData?.code || ""), errorMessage: Array.isArray(respData?.message) ? respData.message.join("; ") : (respData?.message || e.message) };
        }
        break;
      }
      case "smtp": {
        const toEmail = email || req.body.to;
        if (!toEmail) return void res.json({ ok: false, message: "Provide an email address" });
        channel = "email";
        recipient = toEmail;
        const smtpHost = apiUrl || extra.host || process.env.SMTP_HOST || "smtp.gmail.com";
        const smtpUser = extra.user || process.env.SMTP_USER || "";
        const smtpPass = apiKey || process.env.SMTP_PASS || "";
        if (!smtpUser || !smtpPass) return void res.json({ ok: false, message: "SMTP not fully configured" });
        const endpoint = `smtp://${smtpHost}`;
        const reqPayload = { from: smtpUser, to: toEmail, subject: "✅ Al Burhan ERP — SMTP Test" };
        try {
          const transport = nodemailer.createTransport({ host: smtpHost, port: Number(extra.port || 587), secure: Number(extra.port || 587) === 465, auth: { user: smtpUser, pass: smtpPass } });
          await transport.sendMail({ from: `Al Burhan Tours & Travels <${smtpUser}>`, to: toEmail, subject: "✅ Al Burhan ERP — SMTP Test", text: "This is a test email from Al Burhan ERP Test API. Your SMTP is configured correctly." });
          result = { ok: true, provider: "SMTP", endpoint, requestPayload: reqPayload, responsePayload: { delivered: true }, message: `Test email sent to ${toEmail}` };
        } catch (e: any) {
          result = { ok: false, provider: "SMTP", endpoint, requestPayload: reqPayload, responsePayload: { error: e.message }, errorCode: e.code || "", errorMessage: e.message };
        }
        break;
      }
      case "firebase": {
        // Uses FCM v1 API — no legacy Server Key needed
        const deviceToken = req.body.device_token;
        if (!deviceToken) return void res.json({ ok: false, message: "Provide a device FCM token (copy it from Push Center → This Browser)" });
        channel = "push";
        recipient = `${deviceToken.slice(0, 24)}…`;
        const endpoint = "https://fcm.googleapis.com/v1/projects/{project}/messages:send";
        try {
          const { sendFCMToToken } = await import("../lib/fcm.js");
          const r = await sendFCMToToken(deviceToken, {
            title: "🔔 Al Burhan ERP Test",
            body:  "✅ Firebase Cloud Messaging v1 — credentials are working!",
            url:   "/admin/notifications",
          });
          result = {
            ok:              r.ok,
            provider:        "Firebase FCM v1",
            endpoint,
            responsePayload: { messageId: r.messageId, error: r.error, invalidToken: r.invalidToken },
            message:         r.ok ? `Push delivered — messageId: ${r.messageId}` : undefined,
            errorMessage:    r.error,
          };
        } catch (e: any) {
          result = { ok: false, provider: "Firebase FCM v1", endpoint, errorMessage: e.message };
        }
        break;
      }
      case "lemin": {
        if (!mobile) return void res.json({ ok: false, message: "Provide a mobile number to test RCS delivery" });

        // Env vars take precedence over DB; user_id / API key is NEVER returned to caller or logged
        const leminKey     = process.env.LEMIN_API_KEY  || apiKey || extra.user_id || "";
        const leminBaseUrl = process.env.LEMIN_BASE_URL || apiUrl  || "https://rcs.leminai.com";
        const dialCode     = process.env.LEMIN_DIAL_CODE || extra.dial_code || "+91";

        // Resolve template ID: explicit setting → DB booking_submitted row → hardcoded 3651
        let templateId = extra.template_id || "";
        if (!templateId) {
          try {
            const tmplRow2 = await pool.query(
              `SELECT template_id FROM rcs_template_mappings WHERE erp_event='booking_submitted' AND enabled=true AND template_id IS NOT NULL LIMIT 1`
            );
            templateId = tmplRow2.rows[0]?.template_id || "3651";
          } catch { templateId = "3651"; }
        }

        // ── Pre-send field validation ─────────────────────────────────────────
        const preValidMissing: string[] = [];
        if (!dialCode)   preValidMissing.push("dial_code");
        if (!mobile)     preValidMissing.push("phone");
        if (!templateId) preValidMissing.push("template");
        if (!leminKey)   preValidMissing.push("user_id (LEMIN_API_KEY secret — save settings first)");
        if (preValidMissing.length) {
          return void res.json({ ok: false, message: `Missing required fields: ${preValidMissing.join(", ")}` });
        }

        // Normalise phone → exactly 10 digits
        let rawClean = mobile.replace(/[\s\-\+]/g, "");
        if (rawClean.startsWith("0")) rawClean = rawClean.slice(1);
        if (rawClean.startsWith("91") && rawClean.length === 12) rawClean = rawClean.slice(2);
        const phone = rawClean.slice(-10);
        if (phone.length !== 10) {
          return void res.json({ ok: false, message: `Invalid mobile number — expected 10 digits after normalisation, got "${mobile}"` });
        }

        // ── Build test variables ──────────────────────────────────────────────────
        // PRIMARY: hardcoded map by template_id — authoritative, zero DB dependency.
        // FALLBACK: DB variables_required (may have old/wrong key names from v31.0 seed;
        //           only used when templateId is not in LEMIN_TEMPLATE_TEST_VARS).
        let dbVarsRequired: string[] = [];
        try {
          const vrRow = await pool.query(
            `SELECT variables_required FROM rcs_template_mappings WHERE template_id=$1 AND enabled=true LIMIT 1`,
            [templateId]
          );
          dbVarsRequired = vrRow.rows[0]?.variables_required || [];
        } catch { /* use hardcoded map */ }
        const testVariables = buildTestVariables(templateId, dbVarsRequired);

        // Hard abort — variables MUST be a non-empty object.
        // Lemin returns "Failed to process single payload" for any request with variables: {} or missing variables.
        if (Object.keys(testVariables).length === 0) {
          return void res.json({
            ok: false,
            message: `Cannot send: no test variables could be determined for template "${templateId}". Add it to LEMIN_TEMPLATE_TEST_VARS in api-settings.ts.`,
            debug: { templateId, dbVarsRequired, testVariables },
          });
        }

        channel   = "rcs";
        recipient = mobile;
        const endpoint = `${leminBaseUrl.replace(/\/$/, "")}/api/send/template`;

        // safePayload — all fields EXCEPT user_id (safe to log and return to frontend)
        const safePayload: Record<string, unknown> = {
          type:      "single",
          dial_code: dialCode,
          template:  templateId,
          phone,
          variables: testVariables,
        };
        // debugPayload — all 6 required Lemin fields, user_id partially masked, shown in UI
        const maskedKey = leminKey
          ? `${leminKey.slice(0, 4)}${"*".repeat(Math.max(0, leminKey.length - 8))}${leminKey.slice(-4)}`
          : "(not set — LEMIN_API_KEY secret missing)";
        const debugPayload = { ...safePayload, user_id: maskedKey };

        // Pre-send spec validation — every non-variable field must be non-empty
        const specMissing = (["type","dial_code","template","phone"] as const)
          .filter(f => { const v = safePayload[f]; return v === undefined || v === null || v === ""; });
        if (!leminKey) specMissing.push("user_id" as any);
        if (specMissing.length) {
          return void res.json({
            ok: false,
            message: `Pre-send validation failed — empty required fields: ${specMissing.join(", ")}`,
            debugPayload,
          });
        }

        const reqPayload = { ...safePayload, user_id: leminKey };
        let httpStatus = 0; let respData: any = {};
        try {
          // Log COMPLETE payload (user_id masked) so it appears in VPS PM2 logs
          console.log(`[lemin send-test] PAYLOAD: ${JSON.stringify(debugPayload)}`);
          const resp = await axios.post(endpoint, reqPayload, { headers: { "Content-Type": "application/json" }, timeout: 12000 });
          httpStatus = resp.status; respData = resp.data;
          console.log(`[lemin send-test] response HTTP=${httpStatus} body=${JSON.stringify(respData)}`);

          const errTxt     = String(respData?.message || respData?.error || "").toLowerCase();
          const authFailed = errTxt.includes("invalid user") || errTxt.includes("invalid_user")
            || errTxt.includes("unauthorized") || httpStatus === 401 || httpStatus === 403;
          const tplFailed  = errTxt.includes("template not found") || errTxt.includes("template_not_found");
          const bodyFailed = respData?.success === false || respData?.status === false;
          const ok = httpStatus >= 200 && httpStatus < 300 && !authFailed && !tplFailed && !bodyFailed;

          const messageId = respData?.data?.id || respData?.data?.message_id
            || respData?.message_id || respData?.id || respData?.msg_id || undefined;

          // Always return the exact Lemin error string — never wrap in a generic message
          let errorMessage: string | undefined;
          if (!ok) {
            const rawErr = respData?.message || respData?.error || `HTTP ${httpStatus}`;
            if (authFailed)  errorMessage = `Authentication failed — check LEMIN_API_KEY: ${rawErr}`;
            else if (tplFailed) errorMessage = `Template ${templateId} not found in this Lemin account — verify rcs_template_mappings has the correct ID`;
            else             errorMessage = rawErr;
          }

          result = {
            ok, provider: "Lemin AI", endpoint, httpStatus, messageId,
            debugPayload,
            requestPayload:  safePayload,
            responsePayload: respData,
            errorMessage,
          };
          if (ok) {
            await pool.query(`UPDATE api_settings SET status='connected', last_tested=NOW() WHERE provider='lemin'`).catch(() => {});
          }
        } catch (e: any) {
          const er = e?.response; httpStatus = er?.status || 0; respData = er?.data || { error: e.message };
          console.error(`[lemin send-test] ERROR HTTP=${httpStatus} body=${JSON.stringify(respData)}`);
          const rawErr = respData?.message || respData?.error || e.message;
          const errTxt = String(rawErr || "").toLowerCase();
          const authFailed = errTxt.includes("invalid user") || errTxt.includes("invalid_user")
            || errTxt.includes("unauthorized") || httpStatus === 401 || httpStatus === 403;
          result = {
            ok: false, provider: "Lemin AI", endpoint, httpStatus,
            debugPayload,
            requestPayload: safePayload,
            responsePayload: respData,
            errorCode: String(respData?.code || ""),
            errorMessage: authFailed
              ? `Authentication failed — check LEMIN_API_KEY: ${rawErr}`
              : rawErr,
          };
        }
        break;
      }
      default:
        return void res.json({ ok: false, message: "No test message available for this provider" });
    }

    // Log every test to notification_logs
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status,
        provider_response, provider_name, api_endpoint, http_status, request_payload, error_code,
        sent_at, retry_count)
       VALUES (gen_random_uuid(),'test_send',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),0)`,
      [
        channel, recipient,
        `Test API send via ${result.provider}`,
        result.ok ? "sent" : "failed",
        JSON.stringify(result),
        result.provider,
        result.endpoint,
        result.httpStatus || null,
        result.requestPayload ? JSON.stringify(result.requestPayload) : null,
        result.errorCode || null,
      ]
    ).catch(e => console.error("[send-test] log failed:", e.message));

    res.json({ ...result, logged: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/api-settings/lemin/set-webhook — register webhook URL with Lemin AI
// Spec: POST https://rcs.leminai.com/api/webhook/set
//       Body: { url, agent, active, user_id }
router.post("/lemin/set-webhook", requireAdmin as any, requireSuperAdmin, async (req, res) => {
  try {
    const row = await pool.query(`SELECT api_key_encrypted, api_url, extra_fields_encrypted FROM api_settings WHERE provider='lemin' LIMIT 1`);
    const r = row.rows[0];
    if (!r) return void res.json({ ok: false, message: "Lemin AI not configured — save settings first" });
    const decryptedKey = r.api_key_encrypted ? decrypt(r.api_key_encrypted) : "";
    let extraFields: Record<string, string> = {};
    if (r.extra_fields_encrypted) {
      try { extraFields = JSON.parse(decrypt(r.extra_fields_encrypted)); } catch {}
    }
    // Prefer env var (VPS), fall back to DB-stored value
    const userId = process.env.LEMIN_API_KEY || decryptedKey || extraFields.user_id || "";
    if (!userId) return void res.json({ ok: false, message: "User ID (Developer API Key) not set — save settings first" });
    // Webhook URL: singular /api/webhook path kept for backward compat; plural /api/webhooks/lemin-rcs is the canonical target
    const webhookUrl = req.body?.url || "https://alburhantravels.com/api/webhooks/lemin-rcs";
    // user_id sent to Lemin only — NEVER returned in response or logged
    const safePayload  = { url: webhookUrl, agent: "jio", active: true };
    const leminPayload = { ...safePayload, user_id: userId };
    let httpStatus = 0; let respData: any = {};
    try {
      const resp = await axios.post("https://rcs.leminai.com/api/webhook/set", leminPayload, {
        headers: { "Content-Type": "application/json" }, timeout: 10000,
      });
      httpStatus = resp.status; respData = resp.data;
    } catch (e: any) {
      httpStatus = e?.response?.status || 0;
      respData   = e?.response?.data   || { error: e.message };
    }
    const ok = httpStatus >= 200 && httpStatus < 300;
    console.log(`[Lemin] Webhook set result: status=${httpStatus} ok=${ok}`, respData);
    res.json({ ok, httpStatus, webhookUrl, requestPayload: safePayload, responsePayload: respData });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /api/api-settings/lemin/message-status?message_id=XXX — poll delivery status from Lemin
router.get("/lemin/message-status", requireAdmin as any, requireSuperAdmin, async (req, res) => {
  const messageId = String(req.query.message_id || "").trim();
  if (!messageId) return void res.status(400).json({ ok: false, message: "message_id query parameter required" });
  try {
    const { refreshMessageStatus } = await import("../lib/rcs.js");
    const result = await refreshMessageStatus(messageId);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/api-settings/send-test-all — fires WhatsApp + SMS + RCS + Email simultaneously
router.post("/send-test-all", requireAdmin as any, requireSuperAdmin, async (req, res) => {
  const { mobile, email } = req.body as { mobile?: string; email?: string };
  if (!mobile) return void res.status(400).json({ ok: false, message: "Provide a mobile number" });

  const phone = mobile.replace(/\D/g, "").slice(-10);
  const testCtx = {
    customerName: "Test User",
    customerMobile: phone,
    customerEmail: email || undefined,
    bookingNumber: "TEST-001",
  };

  // Fire all 4 channels simultaneously and collect results
  const channels = ["whatsapp", "sms", "rcs", "email"] as const;
  const results = await Promise.allSettled(
    channels.map(async (ch) => {
      try {
        if (ch === "whatsapp") {
          const { sendTemplate } = await import("../lib/botbee.js");
          // Use booking_approved template (409950) — 5 vars: Name, BookingID, Package, Amount, InvoiceUrl
          const r = await sendTemplate(
            phone,
            "409950",
            {
              eventType: "test_all",
              variables: { Name: "Test User", BookingID: "TEST-001", Package: "Al Burhan Test Package", Amount: "1000", InvoiceUrl: "https://alburhantravels.com" },
            }
          );
          return { channel: ch, ok: r.ok, provider: "BotBee", httpStatus: r.httpStatus, responsePayload: r.responsePayload, errorMessage: r.ok ? undefined : r.errorMessage };
        }
        if (ch === "sms") {
          const { sendCustomSMS } = await import("../lib/sms.js");
          const r = await sendCustomSMS({ mobile: phone, message: "Al Burhan Tours & Travels SMS integration is working successfully." });
          return { channel: ch, ok: r.ok, provider: "Fast2SMS", httpStatus: (r as any).httpStatus, responsePayload: (r as any).responsePayload, errorMessage: r.ok ? undefined : (r as any).errorMessage };
        }
        if (ch === "rcs") {
          const { sendRCS } = await import("../lib/notifications.js");
          const r = await sendRCS(phone, "Test User", "Al Burhan Tours & Travels RCS integration is working successfully. Test Booking: #TEST-001");
          return { channel: ch, ok: r.ok, provider: "LeminAI", httpStatus: r.httpStatus, responsePayload: r.responsePayload, errorMessage: r.ok ? undefined : r.errorMessage };
        }
        if (ch === "email") {
          if (!email) return { channel: ch, ok: false, provider: "SMTP", errorMessage: "No email address provided" };
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { channel: ch, ok: false, provider: "SMTP", errorMessage: `Invalid email address: "${email}". Provide a valid email in the request body.` };
          const { sendEmail } = await import("../lib/notifications.js");
          const r = await sendEmail(email, "Test Notification – Al Burhan Tours & Travels", "<p>Assalamu Alaikum,</p><p>Al Burhan Tours & Travels <b>email notification</b> is working correctly.</p><p>Test Booking: <b>#TEST-001</b></p><p>Jazak Allah Khair!</p>");
          return { channel: ch, ok: r.ok, provider: "SMTP", httpStatus: r.httpStatus, responsePayload: r.responsePayload, errorMessage: r.ok ? undefined : r.errorMessage };
        }
        return { channel: ch, ok: false, provider: ch, errorMessage: "Unknown channel" };
      } catch (e: any) {
        return { channel: ch, ok: false, provider: ch, errorMessage: e.message };
      }
    })
  );

  const channelResults = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value ?? { channel: channels[i], ok: false, provider: channels[i], errorMessage: "No result" };
    return { channel: channels[i], ok: false, provider: channels[i], errorMessage: r.reason?.message || "Unexpected error" };
  });

  // Log each to notification_logs
  await Promise.allSettled(channelResults.map(r =>
    pool.query(
      `INSERT INTO notification_logs (id, event_type, channel, recipient, message, status, provider_name, sent_at, retry_count)
       VALUES (gen_random_uuid(),'test_all',$1,$2,$3,$4,$5,NOW(),0)`,
      [r!.channel, phone, `Test All — ${r!.provider}`, r!.ok ? "sent" : "failed", r!.provider]
    ).catch(() => {})
  ));

  res.json({ ok: channelResults.some(r => r?.ok), channels: channelResults, testCtx });
});

export default router;
