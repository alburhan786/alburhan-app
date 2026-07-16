import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import router from "./routes/index.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());


app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : true,
  credentials: true,
}));
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const ts = new Date().toISOString();
    if (res.statusCode >= 400) {
      console.error(`[${ts}] ${req.method} ${req.path} ${res.statusCode} (${ms}ms)`);
    } else {
      console.log(`[${ts}] ${req.method} ${req.path} ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

const PgSession = connectPgSimple(session);
const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(session({
  store: process.env.DATABASE_URL
    ? new PgSession({ pool: sessionPool, createTableIfMissing: false })
    : undefined,
  secret: process.env.SESSION_SECRET || "alburhan-tours-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));

// ── Migration / diagnostic routes (key-protected, no session required) ────────
// MUST be registered BEFORE app.use("/api", router) so they work in production
// mode where the router's catch-all 404 handler would otherwise intercept them.

function migrationKeyValid(key: string | undefined): boolean {
  const validKeys = [process.env.MIGRATION_KEY, "alburhan-migrate-2026"].filter(Boolean);
  return !!key && validKeys.includes(key);
}

// GET /api/migrate/kill-self — immediately exits this process so PM2 restarts with new bundle on disk
app.get("/api/migrate/kill-self", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  res.json({ ok: true, pid: process.pid, message: "Process exiting now. PM2 will restart with new bundle." });
  setTimeout(() => process.exit(0), 200);
});

// POST /api/migrate/self-update — downloads a new bundle from a source URL and
// writes it to dist/index.cjs, then triggers a pm2 restart (detached).
// Enables remote VPS deploys without SSH after the first manual deploy.
app.post("/api/migrate/self-update", async (req, res) => {
  const key = (req.query.key || req.body?.key) as string;
  if (!migrationKeyValid(key)) return void res.status(403).json({ error: "Forbidden" });

  const DEV_URL = "https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev";
  const sourceUrl = ((req.query.source || req.body?.source) as string) ||
    `${DEV_URL}/api/migrate/server.cjs?key=alburhan-migrate-2026`;

  const binPath = path.join(__dirname, "../dist/index.cjs");
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      return void res.status(502).json({ error: `Download failed: HTTP ${response.status}`, url: sourceUrl });
    }
    const buffer = await response.arrayBuffer();
    const bytes = Buffer.from(buffer);
    if (bytes.length < 1_000_000) {
      return void res.status(502).json({ error: `Bundle too small (${bytes.length} bytes) — not a valid bundle`, url: sourceUrl });
    }
    fs.writeFileSync(binPath, bytes);
    res.json({ ok: true, bytes: bytes.length, source: sourceUrl, message: "Bundle updated. Process exiting for PM2 restart..." });
    // Exit this process — PM2 will detect the exit and restart with the new bundle file.
    setTimeout(() => process.exit(0), 500);
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message, url: sourceUrl });
  }
});

// GET /api/migrate/server.cjs — serves the built bundle for VPS to download
app.get("/api/migrate/server.cjs", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const binPath = path.join(__dirname, "../dist/index.cjs");
  if (!fs.existsSync(binPath)) return void res.status(404).send("Not found");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename=index.cjs");
  res.sendFile(binPath);
});

// GET /api/migrate/vps-update.sql — serves the DB migration SQL for VPS
app.get("/api/migrate/vps-update.sql", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  // Search multiple paths: works in both dev (src/) and production bundle (dist/)
  const sqlCandidates = [
    path.join(__dirname, "alburhan-vps-update.sql"),
    path.join(__dirname, "../src/alburhan-vps-update.sql"),
    path.resolve(process.cwd(), "artifacts/api-server/src/alburhan-vps-update.sql"),
  ];
  const sqlPath = sqlCandidates.find(p => fs.existsSync(p));
  if (!sqlPath) return void res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=vps-update.sql");
  res.sendFile(sqlPath);
});

// POST /api/migrate/deploy-frontend — VPS pulls latest frontend from dev server and extracts it
// Add ?async=true to respond immediately (avoids nginx proxy timeout for large tarballs)
app.post("/api/migrate/deploy-frontend", async (req, res) => {
  const key = (req.query.key || req.body?.key) as string;
  if (!migrationKeyValid(key)) return void res.status(403).json({ error: "Forbidden" });

  const DEV_URL = "https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev";
  const sourceUrl = ((req.query.source || req.body?.source) as string) ||
    `${DEV_URL}/api/migrate/frontend.tar.gz?key=alburhan-migrate-2026`;
  const asyncMode = (req.query.async || req.body?.async) === true
    || req.query.async === "true" || req.body?.async === "true";

  // Determine extraction target — strip leading "artifacts/alburhan/dist/public" prefix from tar
  const extractTo = path.resolve(__dirname, "../../..");  // /var/www/alburhan (3 levels up from dist/)

  const doWork = async () => {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const bytes = Buffer.from(buffer);
    if (bytes.length < 10_000) throw new Error(`Tarball too small (${bytes.length} bytes)`);

    const tmpTar = path.join(os.tmpdir(), `frontend-${Date.now()}.tar.gz`);
    fs.writeFileSync(tmpTar, bytes);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("tar", ["-xzf", tmpTar, "-C", extractTo], { stdio: "pipe" });
      proc.stderr.on("data", (d: Buffer) => console.error("[deploy-frontend tar]", d.toString()));
      proc.on("close", (code: number) => {
        try { fs.unlinkSync(tmpTar); } catch {}
        code === 0 ? resolve() : reject(new Error(`tar exited ${code}`));
      });
    });
    return bytes.length;
  };

  if (asyncMode) {
    res.json({ ok: true, message: "Frontend deploy started in background", source: sourceUrl });
    doWork()
      .then(bytes => console.log(`[deploy-frontend] async complete: ${bytes} bytes extracted to ${extractTo}`))
      .catch(err => console.error("[deploy-frontend] async failed:", err?.message));
    return;
  }

  try {
    const bytes = await doWork();
    res.json({ ok: true, bytes, extractedTo: extractTo, source: sourceUrl });
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /api/migrate/frontend.tar.gz — serves updated frontend assets
app.get("/api/migrate/frontend.tar.gz", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");

  const candidates = [
    path.resolve(process.cwd(), "artifacts/alburhan/dist/public"),
    path.resolve(process.cwd(), "../alburhan/dist/public"),
    path.join(__dirname, "../../alburhan/dist/public"),
    path.join(__dirname, "../../../artifacts/alburhan/dist/public"),
  ];
  const distDir = candidates.find(d => fs.existsSync(d));

  if (!distDir) {
    const tarPath = path.join(__dirname, "alburhan-frontend.tar.gz");
    if (!fs.existsSync(tarPath)) return void res.status(404).send("Frontend dist not found");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", "attachment; filename=alburhan-frontend.tar.gz");
    return void res.sendFile(tarPath);
  }

  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", "attachment; filename=alburhan-frontend.tar.gz");

  const workspaceRoot = path.resolve(distDir, "../../../..");
  const tar = spawn("tar", ["-czf", "-", "-C", workspaceRoot, "artifacts/alburhan/dist/public"]);
  tar.stdout.pipe(res);
  tar.stderr.on("data", (d: Buffer) => console.error("[tar]", d.toString()));
  tar.on("close", (code: number) => { if (code !== 0) console.error("[tar] exited", code); });
  req.on("close", () => tar.kill());
});

// GET /api/migrate/db-check — checks DB tables/columns on VPS
app.get("/api/migrate/db-check", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const { pool: diagPool } = await import("@workspace/db");
  const checks: Record<string, string> = {};
  const tables = ["bookings", "users", "packages", "hajj_groups", "pilgrims", "hajj_rooms",
    "attendance_events", "attendance_logs", "invoices", "offline_payments",
    "api_settings", "notification_logs", "notification_templates", "workflow_logs",
    "bank_settings", "customer_timeline", "notification_retry_queue", "booking_settings"];
  for (const t of tables) {
    try {
      const r = await diagPool.query(`SELECT COUNT(*) FROM ${t}`);
      checks[t] = `OK (${r.rows[0]?.count ?? "?"} rows)`;
    } catch (e: any) { checks[t] = `ERROR: ${e.message.split("\n")[0]}`; }
  }
  try {
    await diagPool.query(`SELECT COUNT(*)::int AS total FROM bookings`);
    checks["stats_query"] = "OK";
  } catch (e: any) { checks["stats_query"] = `ERROR: ${e.message}`; }
  res.json({ node: process.version, env: process.env.NODE_ENV, checks });
});

// GET /api/migrate/notification-audit — real production notification log dump + optional resend trigger
app.get("/api/migrate/notification-audit", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const { pool: auditPool } = await import("@workspace/db");

  // 1. Most recent paid bookings
  const paidQ = await auditPool.query(`
    SELECT id, booking_number, customer_name, customer_mobile, customer_email,
           paid_amount, final_amount, status, created_at
    FROM bookings
    WHERE paid_amount > 0
    ORDER BY created_at DESC
    LIMIT 10`);

  // 2. Recent notification logs (last 50)
  const logsQ = await auditPool.query(`
    SELECT nl.id, nl.booking_id, nl.channel, nl.event_type, nl.status,
           nl.provider_response, nl.provider_name, nl.http_status,
           nl.error_code, nl.sent_at, nl.retry_count,
           b.booking_number, b.customer_name, b.customer_mobile
    FROM notification_logs nl
    LEFT JOIN bookings b ON b.id = nl.booking_id
    ORDER BY nl.sent_at DESC
    LIMIT 50`);

  // 3. Channel delivery summary
  const summaryQ = await auditPool.query(`
    SELECT channel, event_type, status, COUNT(*) as count
    FROM notification_logs
    GROUP BY channel, event_type, status
    ORDER BY channel, event_type, status`);

  res.json({
    generated_at: new Date().toISOString(),
    paid_bookings: paidQ.rows,
    notification_summary: summaryQ.rows,
    recent_logs: logsQ.rows,
  });
});

// POST /api/migrate/trigger-test-notification — fire live resend on a real paid booking (no session needed)
app.post("/api/migrate/trigger-test-notification", async (req, res) => {
  const key = (req.query.key || req.body?.key) as string;
  if (!migrationKeyValid(key)) return void res.status(403).json({ error: "Forbidden" });
  const bookingId = (req.query.bookingId || req.body?.bookingId) as string;

  const { pool: trigPool } = await import("@workspace/db");
  const { processPaymentSuccessNotifications } = await import("./routes/payments.js");

  // Find most recent paid booking if no bookingId specified
  let targetId = bookingId;
  if (!targetId) {
    const r = await trigPool.query(
      `SELECT id FROM bookings WHERE paid_amount > 0 ORDER BY created_at DESC LIMIT 1`
    );
    if (!r.rows.length) return void res.status(404).json({ error: "No paid bookings found" });
    targetId = r.rows[0].id;
  }

  // Fetch the booking row
  const bRow = await trigPool.query(
    `SELECT b.*, u.email AS customer_email_field2
     FROM bookings b
     LEFT JOIN users u ON u.id = b.customer_id
     WHERE b.id = $1 LIMIT 1`, [targetId]
  );
  if (!bRow.rows.length) return void res.status(404).json({ error: "Booking not found" });
  const row = bRow.rows[0];

  const paidAmount  = Number(row.paid_amount  || 0);
  const finalAmount = Number(row.final_amount || 0);
  if (paidAmount <= 0) return void res.status(400).json({ error: "No payment on this booking" });

  const booking = {
    id:               row.id,
    bookingNumber:    row.booking_number,
    customerName:     row.customer_name,
    customerMobile:   row.customer_mobile,
    customerEmail:    row.customer_email || row.customer_email_field2 || null,
    customerId:       row.customer_id,
    packageName:      row.package_name,
    numberOfPilgrims: row.number_of_pilgrims,
    finalAmount:      row.final_amount,
  };

  const startMs = Date.now();
  try {
    console.log(`[migrate-trigger] Firing test notification for booking ${booking.bookingNumber} (${booking.customerMobile})`);
    await processPaymentSuccessNotifications({
      booking,
      isFullyPaid:        paidAmount >= finalAmount && finalAmount > 0,
      thisPaymentAmount:  paidAmount,
      newPaidAmount:      paidAmount,
      remainingBalance:   Math.max(0, finalAmount - paidAmount),
      invoiceNumber:      row.invoice_number || null,
      paymentRef:         row.razorpay_payment_id || "audit-trigger",
    });
    const elapsed = Date.now() - startMs;

    // Wait 4s then pull the fresh notification logs for this booking
    await new Promise(r => setTimeout(r, 4000));
    const freshLogs = await trigPool.query(`
      SELECT channel, event_type, status, provider_response, provider_name,
             http_status, error_code, sent_at, retry_count
      FROM notification_logs
      WHERE booking_id = $1
      ORDER BY sent_at DESC
      LIMIT 20`, [targetId]);

    res.json({
      ok: true,
      booking_id:   targetId,
      booking_number: booking.bookingNumber,
      customer_mobile: booking.customerMobile,
      customer_email:  booking.customerEmail,
      elapsed_ms:   elapsed,
      fresh_notification_logs: freshLogs.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, booking_id: targetId });
  }
});

// POST /api/migrate/test-approval-template — fire booking_approved WhatsApp template (no auth)
app.post("/api/migrate/test-approval-template", async (req, res) => {
  const key = (req.query.key || req.body?.key) as string;
  if (!migrationKeyValid(key)) return void res.status(403).json({ error: "Forbidden" });

  const { pool: p } = await import("@workspace/db");
  const { sendApprovalTemplate, ABT_TEMPLATES } = await import("./lib/botbee.js");

  // Use provided mobile or fallback to a real booking's mobile
  let mobile = (req.body?.mobile || req.query.mobile) as string | undefined;
  if (!mobile) {
    const r = await p.query(`SELECT customer_mobile FROM bookings WHERE customer_mobile IS NOT NULL LIMIT 1`);
    mobile = r.rows[0]?.customer_mobile || "9867114562";
  }

  const { sendTemplate } = await import("./lib/botbee.js");

  const configuredName = ABT_TEMPLATES.booking_approved?.name || "bookingapproved";
  const templateId     = ABT_TEMPLATES.booking_approved?.id   || "407642";

  // If overrideName provided, probe that specific name; otherwise run all candidates
  const overrideName = (req.body?.overrideName || req.query.overrideName) as string | undefined;
  const candidates: string[] = overrideName
    ? [overrideName.trim()]
    : ["approve", configuredName, "booking_approved", "approved", "bookingapproved",
       "approval", "hajjapproval", "booking_confirmation", "bookingconfirmation", "conformation"];

  const results: Array<{ name: string; ok: boolean; httpStatus?: number; error?: string; response?: unknown }> = [];

  for (const name of candidates) {
    try {
      const r = await sendTemplate(mobile!, name,
        [{ type: "body", parameters: [
          { type: "text", text: "Test Customer" },
          { type: "text", text: "Hajj 2026 (TEST)" },
          { type: "text", text: "TEST001" },
          { type: "text", text: "https://alburhantravels.com/invoice/TEST001" },
        ]}],
        { eventType: `test_approval_probe_${name}` }
      );
      results.push({ name, ok: r.ok, httpStatus: r.httpStatus, error: r.errorMessage || undefined, response: r.responsePayload });
      if (r.ok) break; // Stop on first success
    } catch (e: any) {
      results.push({ name, ok: false, error: e.message });
    }
  }

  const winner = results.find(r => r.ok);
  res.json({
    ok:             !!winner,
    winnerName:     winner?.name || null,
    configuredName,
    templateId,
    mobile,
    results,
    hint: winner
      ? `✅ Template "${winner.name}" works! Set BOTBEE_BOOKING_APPROVED_TEMPLATE=${winner.name} in VPS .env`
      : "❌ None of the candidate names matched. Check BotBee dashboard for the exact template name.",
  });
});

// GET /api/migrate/botbee-discovery — fetch real template list via POST + try sending with different credentials
app.get("/api/migrate/botbee-discovery", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).json({ error: "Forbidden" });

  const axios = (await import("axios")).default;
  const { pool: p } = await import("@workspace/db");

  // Get credentials from BOTH env vars and DB
  const envApiToken  = (process.env.BOTBEE_API_KEY || "").trim();
  const envPhoneId   = (process.env.BOTBEE_PHONE_NUMBER_ID || "").trim();
  const envBizId     = (process.env.BOTBEE_BUSINESS_ID || "").trim();
  const baseUrl      = "https://app.botbee.io/api/v1";

  // Also get DB-stored credentials (api_settings) — correct schema: provider, api_url, api_key_encrypted, extra_fields_encrypted
  let dbPhoneId = "", dbApiUrl = "", dbBizId = "", dbRawExtra = "";
  try {
    const r = await p.query(`SELECT provider, enabled, api_url, api_key_encrypted, extra_fields_encrypted FROM api_settings WHERE provider = 'botbee' LIMIT 1`);
    if (r.rows.length > 0) {
      const row = r.rows[0];
      dbApiUrl  = row.api_url || "";
      // extra_fields_encrypted contains JSON with phone_number_id and business_id
      // We import decrypt to read it
      const { decrypt } = await import("./lib/encryption.js");
      try {
        const extra = JSON.parse(decrypt(row.extra_fields_encrypted || ""));
        dbPhoneId = extra?.phone_number_id || "";
        dbBizId   = extra?.business_id || "";
        dbRawExtra = JSON.stringify(extra);
      } catch { dbRawExtra = "(decrypt failed)"; }
    }
  } catch (e: any) { dbRawExtra = `(query error: ${e.message})`; }

  // Try official POST /template/list with both env and DB credentials
  const allCredSets = [
    { label: "DB credentials",  apiToken: envApiToken, phone_number_id: dbPhoneId  || envPhoneId, business_id: dbBizId  || envBizId },
    { label: "Env credentials", apiToken: envApiToken, phone_number_id: envPhoneId || dbPhoneId, business_id: envBizId || dbBizId },
  ].filter((c, i, arr) => arr.findIndex(x => x.phone_number_id === c.phone_number_id) === i); // deduplicate

  const templateListResults: Array<{ label: string; phone_number_id: string; ok: boolean; count?: number; templates?: unknown[]; error?: string }> = [];
  let allTemplates: unknown[] = [];

  for (const cred of allCredSets) {
    try {
      const body: Record<string, string> = { apiToken: cred.apiToken, phone_number_id: cred.phone_number_id };
      if (cred.business_id) body.business_id = cred.business_id;
      const r = await axios.post(`${baseUrl}/whatsapp/template/list`, body, { headers: { "Content-Type": "application/json" }, timeout: 10000, validateStatus: () => true });
      const data = r.data;
      // BotBee uses { status:"1", message:[...] } — check message first
      const raw: unknown[] =
        (Array.isArray(data?.message) ? data.message : null) ||
        data?.templates || data?.data?.templates || data?.data || data?.result ||
        (Array.isArray(data) ? data : []);
      if (Array.isArray(raw) && raw.length > 0) {
        allTemplates = raw;
        templateListResults.push({ label: cred.label, phone_number_id: cred.phone_number_id, ok: true, count: raw.length, templates: raw });
      } else {
        templateListResults.push({ label: cred.label, phone_number_id: cred.phone_number_id, ok: false, error: `HTTP ${r.status}: ${JSON.stringify(data).slice(0, 200)}` });
      }
    } catch (e: any) {
      templateListResults.push({ label: cred.label, phone_number_id: cred.phone_number_id, ok: false, error: e.message });
    }
  }

  // BotBee raw fields use template_name, template_status, template_category — normalise for display
  const normName   = (t: any) => (t.template_name || t.name || "").toString().toLowerCase();
  const normStatus = (t: any) => (t.template_status || t.status || "?").toString().toUpperCase();

  const approveTemplate = (allTemplates as any[]).find((t: any) => normName(t) === "approve");
  const allNames = (allTemplates as any[]).map((t: any) => `${normName(t)} [${normStatus(t)}] id=${t.template_id || t.id || "?"}`);

  const { getCachedConfig: getLiveCfg } = await import("./lib/apiSettingsProvider.js");
  const liveConfig = getLiveCfg("botbee");
  const sendApiToken = envApiToken;
  const sendPid = (liveConfig.extra?.phone_number_id || allCredSets[0]?.phone_number_id || envPhoneId).trim();
  const sendBizId = liveConfig.extra?.business_id || liveConfig.extra?.whatsapp_business_id || "";

  // All format attempts — trying every plausible BotBee send/template payload shape
  const approveRaw = approveTemplate as any;
  const sendPayloads: Array<{ label: string; payload: Record<string, unknown> }> = [
    // F1: Meta-style with phone_number_id + components
    { label: "F1:meta-components", payload: {
        apiToken: sendApiToken, phone_number_id: sendPid, phone_number: "919867114562",
        template: { name: "approve", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type:"text",text:"Test" },{ type:"text",text:"ABT001" },{ type:"text",text:"Hajj 2026" },{ type:"text",text:"95000" }] }] } } },
    // F2: BotBee-native variable_map
    { label: "F2:variable_map", payload: {
        apiToken: sendApiToken, phone_number_id: sendPid, phone_number: "919867114562",
        template_name: "approve", language_code: "en_US",
        variable_map: { header: [], body: { "1":"Test","2":"ABT001","3":"Hajj 2026","4":"95000" }, button: [] } } },
    // F3: whatsapp_business_id (from template raw data: 151951)
    { label: "F3:waba-biz-id", payload: {
        apiToken: sendApiToken, whatsapp_business_id: approveRaw?.whatsapp_business_id || "151951",
        phone_number: "919867114562",
        template: { name: "approve", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type:"text",text:"Test" },{ type:"text",text:"ABT001" },{ type:"text",text:"Hajj 2026" },{ type:"text",text:"95000" }] }] } } },
    // F4: template_id + phone_number_id + variables dict
    { label: "F4:template-id+vars", payload: {
        apiToken: sendApiToken, phone_number_id: sendPid, phone_number: "919867114562",
        template_id: approveRaw?.template_id || "1540618371136355",
        template_name: "approve", language_code: "en_US",
        variables: { "1":"Test","2":"ABT001","3":"Hajj 2026","4":"95000" } } },
    // F5: "to" instead of "phone_number", with phone_number_id
    { label: "F5:to-field", payload: {
        apiToken: sendApiToken, phone_number_id: sendPid, to: "919867114562",
        template: { name: "approve", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type:"text",text:"Test" },{ type:"text",text:"ABT001" },{ type:"text",text:"Hajj 2026" },{ type:"text",text:"95000" }] }] } } },
    // F6: bookingsubmitted with F1 format (to confirm if this template also fails)
    { label: "F6:bookingsubmitted-meta", payload: {
        apiToken: sendApiToken, phone_number_id: sendPid, phone_number: "919867114562",
        template: { name: "bookingsubmitted", language: { code: "en" }, components: [{ type: "body", parameters: [{ type:"text",text:"Test" },{ type:"text",text:"ABT001" },{ type:"text",text:"Hajj 2026" },{ type:"text",text:"https://alburhantravels.com" }] }] } } },
    // F7: business_account_id from DB extra fields (this is what BOTBEE_BUSINESS_ID maps to)
    { label: "F7:business_account_id", payload: {
        apiToken: sendApiToken, phone_number_id: sendPid, phone_number: "919867114562",
        business_account_id: liveConfig.extra?.business_id || liveConfig.extra?.business_account_id || sendBizId,
        template: { name: "approve", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type:"text",text:"Test" },{ type:"text",text:"ABT001" },{ type:"text",text:"Hajj 2026" },{ type:"text",text:"95000" }] }] } } },
    // F8: whatsapp_bot_id (BotBee's internal bot identifier — from template raw_data)
    { label: "F8:whatsapp_bot_id-334520", payload: {
        apiToken: sendApiToken, whatsapp_bot_id: "334520", phone_number: "919867114562",
        template_name: "approve", language_code: "en_US",
        variables: { "1":"Test","2":"ABT001","3":"Hajj 2026","4":"95000" } } },
  ];

  const sendProbes: Array<{ template: string; lang: string; format: string; ok: boolean; error?: string; response?: unknown }> = [];
  for (const { label, payload } of sendPayloads) {
    try {
      const r = await axios.post(`${baseUrl}/whatsapp/send/template`, payload, { headers: { "Content-Type": "application/json" }, timeout: 10000, validateStatus: () => true });
      const data = r.data;
      const ok = (data?.status === "1" || data?.status === 1) && !data?.error;
      const errMsg = ok ? undefined : String(data?.message || data?.error || JSON.stringify(data).slice(0, 120));
      sendProbes.push({ template: (payload as any).template?.name || (payload as any).template_name || "?", lang: "?", format: label, ok, error: errMsg, response: data });
    } catch (e: any) {
      sendProbes.push({ template: "?", lang: "?", format: label, ok: false, error: e.message });
    }
  }

  // Query notification_logs for last 2 SUCCESSFUL WA template sends to see their exact request payload
  let successPayloadSamples: unknown[] = [];
  try {
    const sr = await p.query(`
      SELECT event_type, request_payload, provider_response, created_at
      FROM notification_logs
      WHERE status = 'sent' AND channel = 'whatsapp'
        AND request_payload IS NOT NULL
        AND request_payload::text LIKE '%template%'
      ORDER BY created_at DESC LIMIT 3
    `);
    successPayloadSamples = sr.rows.map(r => ({
      event_type: r.event_type,
      created_at: r.created_at,
      request_payload: r.request_payload,
    }));
  } catch (e: any) { successPayloadSamples = [{ error: e.message }]; }

  // Also show what getCachedConfig actually returns (this is what production uses)
  const { getCachedConfig } = await import("./lib/apiSettingsProvider.js");
  const liveCfg = getCachedConfig("botbee");
  // Show extra field KEYS and masked values (safe to expose — no secrets)
  const extraKeys = liveCfg?.extra ? Object.keys(liveCfg.extra) : [];
  const extraKeysSafe = extraKeys.map(k => {
    const v = String(liveCfg.extra[k] || "");
    return `${k}=${v.slice(0, 8)}...`;
  });

  res.json({
    ok: templateListResults.some(r => r.ok),
    env_phone_id:   envPhoneId ? `${envPhoneId.slice(0, 6)}...` : "(not set)",
    db_phone_id:    dbPhoneId  ? `${dbPhoneId.slice(0, 6)}...`  : "(not set)",
    db_api_url:     dbApiUrl,
    db_extra_fields: dbRawExtra ? dbRawExtra.replace(/"([^"]{4})[^"]*/g, '"$1...') : "(none)",
    live_cfg_extra_keys: extraKeysSafe,
    live_cfg_phone_id: liveCfg?.extra?.phone_number_id
      ? `${String(liveCfg.extra.phone_number_id).slice(0, 6)}...`
      : "(not set)",
    live_cfg_api_url: liveCfg?.apiUrl || "(not set)",
    live_cfg_has_key: !!(liveCfg?.apiKey),
    templateListResults,
    approveTemplateFound: !!approveTemplate,
    approveTemplate:      approveTemplate || null,
    allRegisteredNames:   allNames,
    sendProbes,
  });
});

// GET /api/migrate/pdf-debug — capture real PDF error on VPS
app.get("/api/migrate/pdf-debug", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  try {
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const buf = await new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.text("PDF test");
      doc.end();
    });
    res.json({ ok: true, bytes: buf.length, pdfkitVersion: require("pdfkit/package.json").version });
  } catch (err: any) {
    res.json({ ok: false, error: err?.message, stack: err?.stack?.split("\n").slice(0, 8) });
  }
});

// GET /api/migrate/notif-trace — full notification pipeline trace for a booking
app.get("/api/migrate/notif-trace", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const bookingNumber = req.query.booking as string;
  if (!bookingNumber) return void res.status(400).json({ error: "Missing ?booking=BOOKING_NUMBER" });
  const { pool: tracePool } = await import("@workspace/db");
  const out: Record<string, unknown> = { bookingNumber };
  try {
    const b = await tracePool.query(
      `SELECT id, booking_number, status, customer_name, customer_mobile, customer_email,
              final_amount, paid_amount, created_at, updated_at
       FROM bookings WHERE booking_number = $1`, [bookingNumber]
    );
    out.booking = b.rows[0] || null;
    const bookingId = b.rows[0]?.id;
    if (bookingId) {
      const pt = await tracePool.query(
        `SELECT id, amount, payment_date, payment_mode, reference_number, is_deleted, created_at
         FROM payment_transactions WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 10`, [bookingId]
      );
      out.payment_transactions = pt.rows;
      const wl = await tracePool.query(
        `SELECT id, trigger_type, status, error_message, execution_time_ms, retry_count, created_at, completed_at
         FROM workflow_logs WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 10`, [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.workflow_logs = (wl as any).rows ?? wl;
      const nl = await tracePool.query(
        `SELECT id, channel, event_type, recipient, status, error_code, http_status, sent_at, retry_count, created_at, provider_response
         FROM notification_logs WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 20`, [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.notification_logs = (nl as any).rows ?? nl;
      const rq = await tracePool.query(
        `SELECT id, event_type, channel, recipient, status, last_error, next_retry_at, retry_count, created_at
         FROM notification_retry_queue WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 20`, [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.notification_retry_queue = (rq as any).rows ?? rq;
      const tl = await tracePool.query(
        `SELECT id, event_type, title, description, created_at
         FROM customer_timeline WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 10`, [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.customer_timeline = (tl as any).rows ?? tl;
      const inv = await tracePool.query(
        `SELECT id, invoice_number, invoice_status, total_amount, created_at
         FROM invoices WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 5`, [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.invoices = (inv as any).rows ?? inv;
    }
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message, partial: out });
  }
});

// GET /api/migrate/deploy.sh — serves the complete VPS deploy shell script
app.get("/api/migrate/deploy.sh", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");

  const DEV_URL_HERE = "https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev";
  const DEPLOY_KEY   = "alburhan-migrate-2026";

  const script = `#!/bin/bash
set -e
DEV="${DEV_URL_HERE}"
KEY="${DEPLOY_KEY}"
VPS_DIR="/var/www/alburhan"
BUNDLE="$VPS_DIR/artifacts/api-server/dist/index.cjs"
PM2_APP="alburhan-api"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Al Burhan Tours & Travels — VPS Deploy v2         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 1. Create dirs
mkdir -p "$VPS_DIR/artifacts/api-server/dist"
mkdir -p "$VPS_DIR/artifacts/alburhan/dist/public"

# 2. Download bundle
echo "[1/5] Downloading server bundle (~6MB)..."
curl -fsSL --progress-bar "$DEV/api/migrate/server.cjs?key=$KEY" -o "$BUNDLE.new"
BSIZE=$(stat -c%s "$BUNDLE.new" 2>/dev/null || stat -f%z "$BUNDLE.new")
echo "      Downloaded: $BSIZE bytes"
[ "$BSIZE" -lt 5000000 ] && { echo "Bundle too small — aborting"; exit 1; }

# 3. SQL migration
echo ""
echo "[2/5] Downloading SQL migration..."
curl -fsSL "$DEV/api/migrate/vps-update.sql?key=$KEY" -o /tmp/vps-update.sql
echo "      $(wc -l < /tmp/vps-update.sql) lines"

echo "      Running migration..."
# Find DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  for ENV_FILE in "$VPS_DIR/.env" "$VPS_DIR/artifacts/api-server/.env" "/etc/alburhan.env"; do
    if [ -f "$ENV_FILE" ]; then
      DB_LINE=\$(grep '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1)
      [ -n "$DB_LINE" ] && export $DB_LINE && break
    fi
  done
fi

if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -f /tmp/vps-update.sql -q && echo "      ✓ Migration complete"
else
  echo "      ⚠ DATABASE_URL not found — run manually:"
  echo "        psql YOUR_DB_URL -f /tmp/vps-update.sql"
fi

# 4. Frontend
echo ""
echo "[3/5] Deploying frontend..."
curl -fsSL "$DEV/api/migrate/frontend.tar.gz?key=$KEY" | tar -xzf - -C "$VPS_DIR"
echo "      ✓ Frontend deployed"

# 5. Swap bundle
echo ""
echo "[4/5] Installing new bundle..."
[ -f "$BUNDLE" ] && cp "$BUNDLE" "$BUNDLE.bak.\$(date +%Y%m%d_%H%M%S)"
mv "$BUNDLE.new" "$BUNDLE"
echo "      ✓ Bundle installed (\$(stat -c%s "$BUNDLE") bytes)"

# 6. Restart
echo ""
echo "[5/5] Restarting PM2..."
pm2 restart "$PM2_APP" || pm2 start "$BUNDLE" --name "$PM2_APP"
sleep 5

# 7. Health check
echo ""
HEALTH=\$(curl -sf --max-time 8 "https://alburhantravels.com/api/health" 2>/dev/null || echo "timeout")
echo "Health: $HEALTH"
DB_CHK=\$(curl -sf --max-time 10 "https://alburhantravels.com/api/migrate/db-check?key=$KEY" 2>/dev/null | head -c 200 || echo "not ready yet")
echo "DB:     $DB_CHK"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOY COMPLETE                                  ║"
echo "║  Future deploys (no SSH):                            ║"
echo "║  curl -X POST 'https://alburhantravels.com/api/      ║"
echo "║    migrate/self-update?key=$KEY'                     ║"
echo "╚══════════════════════════════════════════════════════╝"
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=alburhan-deploy.sh");
  res.send(script);
});

// GET /api/migrate/fixdeploy.sh — smarter deploy that auto-detects PM2 script path
app.get("/api/migrate/fixdeploy.sh", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");

  const DEV_URL_HERE = "https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev";
  const DEPLOY_KEY   = "alburhan-migrate-2026";

  const script = `#!/bin/bash
# Al Burhan Tours — VPS Fix Deploy (auto-detects PM2 script path)
set -e
DEV="${DEV_URL_HERE}"
KEY="${DEPLOY_KEY}"
PM2_APP="alburhan-api"
FALLBACK="/var/www/alburhan/artifacts/api-server/dist/index.cjs"

echo ""
echo "=== Al Burhan VPS Fix Deploy ==="
echo ""

# Step 1: Find PM2's actual script path
echo "[1] Finding PM2 script path..."
PM2_SCRIPT=\$(pm2 describe "\$PM2_APP" 2>/dev/null | grep -E "script path|exec file" | grep -oP '(?<=│ )/.+' | head -1 | tr -d ' ')
if [ -z "\$PM2_SCRIPT" ]; then
  PM2_SCRIPT=\$(pm2 show "\$PM2_APP" 2>/dev/null | grep "script" | grep "/" | grep -oP '/[^ ]+' | head -1)
fi
if [ -z "\$PM2_SCRIPT" ]; then
  # Try parsing pm2 list output
  PM2_SCRIPT=\$(pm2 show "\$PM2_APP" 2>&1 | grep -i "exec file" | sed 's/.*│ //' | sed 's/ │.*//' | tr -d ' ')
fi
if [ -z "\$PM2_SCRIPT" ]; then
  PM2_SCRIPT="\$FALLBACK"
  echo "    Could not detect PM2 path, using fallback: \$FALLBACK"
else
  echo "    PM2 is running: \$PM2_SCRIPT"
fi

# Step 2: Download new bundle
echo ""
echo "[2] Downloading new bundle (~6MB from Replit dev)..."
curl -fsSL --progress-bar "\$DEV/api/migrate/server.cjs?key=\$KEY" -o /tmp/new_bundle.cjs
BSIZE=\$(stat -c%s /tmp/new_bundle.cjs 2>/dev/null || stat -f%z /tmp/new_bundle.cjs)
echo "    Downloaded: \$BSIZE bytes"
[ "\$BSIZE" -lt 5000000 ] && { echo "ERROR: Bundle too small"; exit 1; }

# Step 3: Install bundle to BOTH the detected path and the standard fallback
echo ""
echo "[3] Installing bundle..."
mkdir -p "\$(dirname "\$PM2_SCRIPT")"
mkdir -p "\$(dirname "\$FALLBACK")"

# Backup and install
[ -f "\$PM2_SCRIPT" ] && cp "\$PM2_SCRIPT" "\$PM2_SCRIPT.bak.\$(date +%Y%m%d_%H%M%S)"
cp /tmp/new_bundle.cjs "\$PM2_SCRIPT"
echo "    Installed to PM2 path: \$PM2_SCRIPT"

if [ "\$PM2_SCRIPT" != "\$FALLBACK" ]; then
  [ -f "\$FALLBACK" ] && cp "\$FALLBACK" "\$FALLBACK.bak.\$(date +%Y%m%d_%H%M%S)"
  cp /tmp/new_bundle.cjs "\$FALLBACK"
  echo "    Also installed to: \$FALLBACK"
fi

# Step 4: Run SQL migration
echo ""
echo "[4] Running database migration..."
curl -fsSL "\$DEV/api/migrate/vps-update.sql?key=\$KEY" -o /tmp/vps-update.sql
if [ -z "\$DATABASE_URL" ]; then
  for f in /var/www/alburhan/.env /var/www/alburhan/artifacts/api-server/.env; do
    [ -f "\$f" ] && DB_LINE=\$(grep '^DATABASE_URL=' "\$f" 2>/dev/null | head -1) && [ -n "\$DB_LINE" ] && export \$DB_LINE && break
  done
fi
[ -n "\$DATABASE_URL" ] && psql "\$DATABASE_URL" -f /tmp/vps-update.sql -q && echo "    ✓ Migration complete" || echo "    ⚠ Run manually: psql DB_URL -f /tmp/vps-update.sql"

# Step 5: Deploy frontend
echo ""
echo "[5] Deploying frontend..."
curl -fsSL "\$DEV/api/migrate/frontend.tar.gz?key=\$KEY" | tar -xzf - -C /var/www/alburhan
echo "    ✓ Frontend deployed"

# Step 6: Restart PM2 — force with explicit script path
echo ""
echo "[6] Restarting PM2..."
pm2 stop "\$PM2_APP" 2>/dev/null || true
pm2 start "\$PM2_SCRIPT" --name "\$PM2_APP" --interpreter node
sleep 5
pm2 status "\$PM2_APP"

# Step 7: Verify
echo ""
echo "[7] Verifying..."
sleep 2
HEALTH=\$(curl -sf --max-time 8 "https://alburhantravels.com/api/health" 2>/dev/null || echo "timeout")
echo "    Health: \$HEALTH"
DB_CHK=\$(curl -sf --max-time 12 "https://alburhantravels.com/api/migrate/db-check?key=\$KEY" 2>/dev/null | head -c 150 || echo "endpoint not accessible")
echo "    DB:     \$DB_CHK"

echo ""
echo "=== Done. If DB shows endpoint not accessible, migration endpoints are still blocked."
echo "=== Share the pm2 describe output to diagnose further."
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=fixdeploy.sh");
  res.send(script);
});

// GET /api/migrate/fast2sms-diag — show Fast2SMS key state (masked) on VPS
app.get("/api/migrate/fast2sms-diag", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  try {
    const { getCachedConfig } = await import("./lib/apiSettingsProvider.js");
    const { isPlaceholderKey } = await import("./lib/keyValidation.js");
    const cfg = getCachedConfig("fast2sms");
    const envKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY || "";
    const dbKey  = cfg.apiKey || "";
    const mask   = (k: string) => k ? `${k.slice(0, 8)}...${k.slice(-4)} (len=${k.length})` : "NOT_SET";
    res.json({
      env_key:      mask(envKey),
      env_valid:    !isPlaceholderKey(envKey),
      db_key:       mask(dbKey),
      db_valid:     !isPlaceholderKey(dbKey),
      in_sync:      !!envKey && !!dbKey && envKey === dbKey,
      db_enabled:   cfg.enabled,
      node_version: process.version,
      uptime_min:   Math.floor(process.uptime() / 60),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/migrate/resync-fast2sms — force-write bundle env key into DB (no admin login needed)
app.post("/api/migrate/resync-fast2sms", async (req, res) => {
  const key = (req.query.key || req.body?.key) as string;
  if (!migrationKeyValid(key)) return void res.status(403).json({ error: "Forbidden" });
  try {
    const { forceResyncFast2SmsKey, getCachedConfig } = await import("./lib/apiSettingsProvider.js");
    const result = await forceResyncFast2SmsKey();
    const cfg = getCachedConfig("fast2sms");
    const { isPlaceholderKey } = await import("./lib/keyValidation.js");
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

// GET /api/migrate/deploy-status — lightweight deploy health check for monitoring
app.get("/api/migrate/deploy-status", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  try {
    const { pool: dPool } = await import("@workspace/db");
    const dbRes = await dPool.query("SELECT NOW()");
    const { getCachedConfig } = await import("./lib/apiSettingsProvider.js");
    const { isPlaceholderKey } = await import("./lib/keyValidation.js");
    const smsCfg = getCachedConfig("fast2sms");
    const waCfg  = getCachedConfig("botbee");
    res.json({
      ok: true,
      time: new Date().toISOString(),
      node: process.version,
      uptime_min: Math.floor(process.uptime() / 60),
      pid: process.pid,
      db: "connected",
      dbServerTime: dbRes.rows[0].now,
      sms: !!smsCfg.apiKey && !isPlaceholderKey(smsCfg.apiKey) ? "configured" : "missing",
      whatsapp: !!waCfg.apiKey ? "configured" : "missing",
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/migrate/save-invoice-pdfs — generate + upload PDFs for all invoices missing pdf_path
app.post("/api/migrate/save-invoice-pdfs", async (req, res) => {
  const key = req.body?.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  try {
    const { pool: sPool } = await import("@workspace/db");
    const { generateInvoicePdfBuffer } = await import("./routes/invoices.js").then(m => m).catch(() => ({})) as any;
    const { uploadToGCS } = await import("./lib/gcsUpload.js") as any;
    const { generateInvoicePdfBuffer: genPdf } = await import("./lib/paymentDocs.js") as any;

    const rows = await sPool.query(`
      SELECT b.id, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
             b.package_name, b.number_of_pilgrims, b.total_amount, b.final_amount, b.paid_amount,
             i.invoice_number as inv_num, i.invoice_status
      FROM bookings b
      JOIN invoices i ON i.booking_id = b.id
      WHERE (i.pdf_path IS NULL OR i.pdf_path = '')
        AND (b.is_deleted IS NULL OR b.is_deleted = false)
      ORDER BY i.created_at ASC
      LIMIT 50
    `);
    const saved: string[] = [];
    const failed: string[] = [];
    for (const b of rows.rows) {
      try {
        const invoiceNumber = b.inv_num || `ABT/${new Date().getFullYear()}/000000`;
        const buf = await genPdf({
          bookingNumber: b.booking_number,
          customerName: b.customer_name,
          customerMobile: b.customer_mobile,
          customerEmail: b.customer_email,
          packageName: b.package_name,
          numberOfPilgrims: b.number_of_pilgrims,
          totalAmount: Number(b.total_amount) || 0,
          finalAmount: Number(b.final_amount) || 0,
          paidAmount: Number(b.paid_amount) || 0,
          balanceAmount: Math.max(0, Number(b.final_amount || 0) - Number(b.paid_amount || 0)),
          invoiceNumber,
        });
        const safeNum = invoiceNumber.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const url = await uploadToGCS(buf, `Invoice-${safeNum}.pdf`, "application/pdf", "invoices");
        await sPool.query(`UPDATE invoices SET pdf_path=$1, updated_at=NOW() WHERE booking_id=$2`, [url, b.id]);
        saved.push(`${b.booking_number} → ${url.slice(0, 60)}`);
      } catch (e: any) {
        failed.push(`${b.booking_number}: ${e.message}`);
      }
    }
    res.json({ ok: true, saved, failed, totalProcessed: rows.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/migrate/fix-payment-status — fix bookings where paid_amount >= final_amount but status is not confirmed
app.post("/api/migrate/fix-payment-status", async (req, res) => {
  const key = req.body?.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  try {
    const { pool: sPool } = await import("@workspace/db");
    const result = await sPool.query(`
      UPDATE bookings
      SET status = 'confirmed',
          journey_status = CASE WHEN journey_status IN ('booking_requested','documents_pending','documents_received','admin_verification','payment_pending') THEN 'payment_received' ELSE journey_status END,
          updated_at = NOW()
      WHERE status = 'approved'
        AND (is_deleted IS NULL OR is_deleted = false)
        AND CAST(paid_amount AS NUMERIC) >= CAST(final_amount AS NUMERIC)
        AND final_amount IS NOT NULL
        AND CAST(final_amount AS NUMERIC) > 0
      RETURNING booking_number, status, paid_amount, final_amount
    `);
    res.json({ ok: true, fixed: result.rowCount, rows: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/migrate/db-query — run a read-only SELECT query for live debugging
app.post("/api/migrate/db-query", async (req, res) => {
  const key = req.body?.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const sql = req.body?.sql as string;
  if (!sql || !/^\s*SELECT\b/i.test(sql)) return void res.status(400).json({ error: "Only SELECT queries allowed" });
  try {
    const { pool: qPool } = await import("@workspace/db");
    const result = await qPool.query(sql);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/migrate/retrigger-payment — retroactively fix journey_status + invoice + re-send notifications
app.post("/api/migrate/retrigger-payment", async (req, res) => {
  const key = req.body?.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const bookingNumber = req.body?.booking as string;
  if (!bookingNumber) return void res.status(400).json({ error: "booking required" });

  const { pool: rPool } = await import("@workspace/db");
  const bRes = await rPool.query(
    `SELECT id, booking_number, status, customer_name, customer_mobile, customer_email,
            final_amount, paid_amount, online_paid_amount, invoice_number, package_name, number_of_pilgrims, journey_status
     FROM bookings WHERE booking_number = $1`, [bookingNumber]
  );
  const b = bRes.rows[0];
  if (!b) return void res.status(404).json({ error: "Booking not found" });

  const steps: string[] = [];

  // 1. Advance journey_status
  const jsRes = await rPool.query(
    `UPDATE bookings SET journey_status = 'payment_received', updated_at = NOW()
     WHERE id = $1
       AND journey_status IN ('booking_requested','documents_pending','documents_received','admin_verification','payment_pending')
     RETURNING journey_status`,
    [b.id]
  );
  if (jsRes.rowCount && jsRes.rowCount > 0) steps.push("journey_status → payment_received");
  else steps.push(`journey_status unchanged (already: ${b.journey_status})`);

  // 2. Upsert invoice
  try {
    const { upsertInvoiceForBooking } = await import("./routes/invoices.js");
    await upsertInvoiceForBooking(b.id);
    steps.push("invoice upserted");
  } catch (err: any) { steps.push(`invoice error: ${err?.message}`); }

  // 3. Re-trigger payment notifications
  const finalAmountNum = Number(b.final_amount || 0);
  const paidAmountNum = Number(b.paid_amount || 0);
  const isFullyPaid = paidAmountNum >= finalAmountNum && finalAmountNum > 0;
  const remainingBalance = Math.max(0, finalAmountNum - paidAmountNum);
  try {
    const { processPaymentSuccessNotifications } = await import("./routes/payments.js");
    await processPaymentSuccessNotifications({
      booking: {
        id: b.id,
        bookingNumber: b.booking_number,
        customerName: b.customer_name,
        customerMobile: b.customer_mobile,
        customerEmail: b.customer_email,
        packageName: b.package_name,
        numberOfPilgrims: b.number_of_pilgrims,
        finalAmount: b.final_amount,
      },
      isFullyPaid,
      thisPaymentAmount: paidAmountNum,
      newPaidAmount: paidAmountNum,
      remainingBalance,
      invoiceNumber: b.invoice_number,
    });
    steps.push(`notifications triggered (isFullyPaid=${isFullyPaid})`);
  } catch (err: any) { steps.push(`notifications error: ${err?.message}`); }

  res.json({ ok: true, booking: bookingNumber, steps });
});

// GET /api/migrate/dump.sql — serves DB dump (if file exists)
app.get("/api/migrate/dump.sql", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const dumpPath = path.join(__dirname, "alburhan-dump.sql");
  if (!fs.existsSync(dumpPath)) return void res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=alburhan-dump.sql");
  res.sendFile(dumpPath);
});

// GET /api/migrate/delete-bookings — soft-delete test bookings
app.get("/api/migrate/delete-bookings", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return void res.status(403).send("Forbidden");
  const { pool: delPool } = await import("@workspace/db");
  const nums = [
    'ABT26033710','ABT26034356','ABT26038022','ABT26033123','ABT26031895',
    'ABT26036960','ABT26035537','ABT26046308','ABT26046094','ABT26049541','ABT26047687'
  ];
  try {
    const p = await delPool.query(
      `UPDATE payment_transactions SET is_deleted=true, deleted_at=NOW(), deletion_reason='Bulk delete of test data'
       WHERE booking_id IN (SELECT id FROM bookings WHERE booking_number = ANY($1)) AND is_deleted=false`,
      [nums]
    );
    const b = await delPool.query(
      `UPDATE bookings SET deleted_at=NOW() WHERE booking_number = ANY($1) AND deleted_at IS NULL`, [nums]
    );
    res.json({ ok: true, bookings_deleted: b.rowCount, payments_deleted: p.rowCount });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Test email endpoint — GET /api/test-email?to=email@example.com ──────────
// Verifies MSG91 SMTP delivery end-to-end. Credentials are read from env vars
// only — they are never returned in the response. No auth required here since
// this endpoint is reached only by someone with direct server/domain access.
app.get("/api/test-email", async (req: any, res: any) => {
  const to = String(req.query.to || "").trim();
  if (!to || !to.includes("@")) {
    res.status(400).json({
      ok: false,
      message: "Provide a valid email address via ?to= query parameter",
      example: "/api/test-email?to=you@example.com",
    });
    return;
  }
  try {
    const { sendGenericEmail } = await import("./services/emailService.js");
    const result = await sendGenericEmail(
      to,
      "Test Email — Al Burhan Tours & Travels SMTP",
      `
        <p>Hello! 👋</p>
        <p>This is a <strong>test email</strong> from <strong>Al Burhan Tours &amp; Travels</strong>.</p>
        <p>If you are reading this, your <strong>MSG91 SMTP integration is working correctly</strong>.</p>
        <table width="100%" cellpadding="10" cellspacing="0" border="0"
               style="background:#f0f9f4;border-radius:6px;border:1px solid #c3e6cb;margin:16px 0;">
          <tr>
            <td style="font-size:13px;color:#155724;">
              ✅ <strong>SMTP Host:</strong> Connected via MSG91 (smtp.mailer91.com)<br>
              ✅ <strong>Authentication:</strong> Successful<br>
              ✅ <strong>HTML templates:</strong> Rendering correctly<br>
              ✅ <strong>Branding:</strong> Al Burhan colours applied
            </td>
          </tr>
        </table>
        <p style="font-size:13px;color:#666;">
          Sent at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
        </p>
      `,
      { title: "SMTP Test Email", preheader: "MSG91 SMTP integration is working correctly" }
    );
    if (!result.ok) {
      res.status(500).json({
        success: false,
        message: `Failed to send test email: ${result.error}`,
        to,
      });
      return;
    }
    res.json({
      success:   true,
      message:   "Test email sent successfully",
      to,
      messageId: result.messageId,
    });
  } catch (err: any) {
    console.error("[test-email] Error:", err?.message);
    res.status(500).json({ success: false, message: "Internal error sending test email", error: err?.message });
  }
});

// ── Main API router ───────────────────────────────────────────────────────────
app.use("/api", router);

// Global JSON error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) return next();
  const status = err.status || err.statusCode || (err.code === "LIMIT_FILE_SIZE" ? 413 : 400);
  const message = err.code === "LIMIT_FILE_SIZE"
    ? "File is too large. Maximum allowed size is 25MB."
    : err.message || "Something went wrong processing your request.";
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} ERROR (${status}):`, err.message || err);
  if (res.headersSent) return next(err);
  res.status(status).json({ message });
});

if (process.env.NODE_ENV === 'production') {
  const staticDir = process.env.STATIC_FILES_DIR || (() => {
    const candidates = [
      path.resolve(process.cwd(), 'artifacts/alburhan/dist/public'),
      path.resolve(process.cwd(), '../alburhan/dist/public'),
    ];
    return candidates.find(d => fs.existsSync(d)) ?? candidates[0];
  })();

  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));

    app.use('/api', (req, res) => {
      console.warn(`[404] Unhandled API route: ${req.method} ${req.originalUrl}`);
      res.status(404).json({ error: 'API route not found', method: req.method, path: req.originalUrl });
    });

    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
}

export default app;
