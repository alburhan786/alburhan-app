import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import path from "path";
import fs from "fs";
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
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  },
}));

app.use("/api", router);

// Global JSON error handler — ensures multer (file upload) errors and any other
// uncaught route errors return a friendly JSON message instead of an HTML/stack trace.
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

    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API route not found' });
    });

    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
}

// TEMPORARY: serve updated server binary for VPS
app.get("/api/migrate/server.cjs", (req, res) => {
  const key = req.query.key as string;
  if (!key || key !== "alburhan-migrate-2026") return res.status(403).send("Forbidden");
  const binPath = path.join(__dirname, "../dist/index.cjs");
  if (!fs.existsSync(binPath)) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Content-Disposition", "attachment; filename=index.cjs");
  res.sendFile(binPath);
});

// TEMPORARY: serve VPS DB update SQL
app.get("/api/migrate/vps-update.sql", (req, res) => {
  const key = req.query.key as string;
  if (!key || key !== "alburhan-migrate-2026") return res.status(403).send("Forbidden");
  const sqlPath = path.join(__dirname, "alburhan-vps-update.sql");
  if (!fs.existsSync(sqlPath)) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=vps-update.sql");
  res.sendFile(sqlPath);
});

// TEMPORARY: serve updated frontend assets for VPS — dynamically tarred from live dist
app.get("/api/migrate/frontend.tar.gz", (req, res) => {
  const key = req.query.key as string;
  if (!key || key !== "alburhan-migrate-2026") return res.status(403).send("Forbidden");

  // Find the dist/public folder (works both on Replit dev and VPS)
  const candidates = [
    path.resolve(process.cwd(), "artifacts/alburhan/dist/public"),
    path.resolve(process.cwd(), "../alburhan/dist/public"),
    path.join(__dirname, "../../alburhan/dist/public"),
    path.join(__dirname, "../../../artifacts/alburhan/dist/public"),
  ];
  const distDir = candidates.find(d => fs.existsSync(d));

  if (!distDir) {
    // fallback: try the pre-built static file
    const tarPath = path.join(__dirname, "alburhan-frontend.tar.gz");
    if (!fs.existsSync(tarPath)) return res.status(404).send("Frontend dist not found");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", "attachment; filename=alburhan-frontend.tar.gz");
    return res.sendFile(tarPath);
  }

  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", "attachment; filename=alburhan-frontend.tar.gz");

  // tar -czf - with path artifacts/alburhan/dist/public so it extracts to the right place on VPS
  // The VPS has the full monorepo at /var/www/alburhan/ so it reads from artifacts/alburhan/dist/public
  const workspaceRoot = path.resolve(distDir, "../../../..");  // dist/public → dist → alburhan → artifacts → workspace
  const tar = spawn("tar", ["-czf", "-", "-C", workspaceRoot, "artifacts/alburhan/dist/public"]);
  tar.stdout.pipe(res);
  tar.stderr.on("data", (d: Buffer) => console.error("[tar]", d.toString()));
  tar.on("close", (code: number) => { if (code !== 0) console.error("[tar] exited", code); });
  req.on("close", () => tar.kill());
});

// DIAGNOSTIC: test DB tables/columns on VPS (key-protected, no login needed)
app.get("/api/migrate/db-check", async (req, res) => {
  const key = req.query.key as string;
  if (!key || key !== "alburhan-migrate-2026") return res.status(403).send("Forbidden");
  const { db: diagDb } = await import("@workspace/db");
  const { sql: diagSql } = await import("drizzle-orm");
  const checks: Record<string, string> = {};
  const tables = ["bookings", "users", "packages", "hajj_groups", "pilgrims", "hajj_rooms", "attendance_events", "attendance_logs"];
  for (const t of tables) {
    try {
      const r = await diagDb.execute(diagSql.raw(`SELECT COUNT(*) FROM ${t}`)) as any;
      checks[t] = `OK (${r[0]?.count ?? r?.rows?.[0]?.count ?? "?"} rows)`;
    } catch (e: any) { checks[t] = `ERROR: ${e.message}`; }
  }
  // Test stats query specifically
  try {
    await diagDb.execute(diagSql.raw(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status::text='pending')::int AS pending, COALESCE(SUM(CASE WHEN status::text='confirmed' THEN final_amount::numeric ELSE 0 END),0)::float AS revenue FROM bookings`));
    checks["stats_query"] = "OK";
  } catch (e: any) { checks["stats_query"] = `ERROR: ${e.message}`; }
  res.json(checks);
});

// TEMPORARY: serve DB dump for VPS migration
app.get("/api/migrate/dump.sql", (req, res) => {
  const key = req.query.key as string;
  if (!key || key !== "alburhan-migrate-2026") {
    return res.status(403).send("Forbidden");
  }
  const dumpPath = path.join(__dirname, "alburhan-dump.sql");
  if (!fs.existsSync(dumpPath)) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=alburhan-dump.sql");
  res.sendFile(dumpPath);
});

// DIAGNOSTIC: full notification pipeline trace for a single booking (key-protected, read-only)
app.get("/api/migrate/notif-trace", async (req, res) => {
  const key = req.query.key as string;
  const validKeys = [process.env.MIGRATION_KEY, "alburhan-migrate-2026"].filter(Boolean);
  if (!key || !validKeys.includes(key)) return res.status(403).send("Forbidden");
  const bookingNumber = req.query.booking as string;
  if (!bookingNumber) return res.status(400).json({ error: "Missing ?booking=BOOKING_NUMBER" });
  const { pool } = await import("@workspace/db");
  const out: Record<string, unknown> = { bookingNumber };
  try {
    const b = await pool.query(
      `SELECT id, booking_number, status, customer_name, customer_mobile, customer_email,
              final_amount, paid_amount, created_at, updated_at
       FROM bookings WHERE booking_number = $1`,
      [bookingNumber]
    );
    out.booking = b.rows[0] || null;
    const bookingId = b.rows[0]?.id;

    if (bookingId) {
      const pt = await pool.query(
        `SELECT id, amount, payment_date, payment_mode, reference_number, is_deleted, created_at
         FROM payment_transactions WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [bookingId]
      );
      out.payment_transactions = pt.rows;

      const wl = await pool.query(
        `SELECT id, trigger_type, status, error_message, execution_time_ms, retry_count, created_at, completed_at
         FROM workflow_logs WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [bookingId]
      );
      out.workflow_logs = wl.rows;

      const nl = await pool.query(
        `SELECT id, channel, event_type, recipient, status, error_code, http_status, sent_at, retry_count, created_at, provider_response
         FROM notification_logs WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.notification_logs = (nl as any).rows ?? nl;

      const rq = await pool.query(
        `SELECT id, event_type, channel, recipient, status, last_error, next_retry_at, retry_count, created_at
         FROM notification_retry_queue WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.notification_retry_queue = (rq as any).rows ?? rq;

      const tl = await pool.query(
        `SELECT id, event_type, title, description, created_at
         FROM customer_timeline WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [bookingId]
      ).catch((e: any) => ({ rows: [], error: e.message }));
      out.customer_timeline = (tl as any).rows ?? tl;
    }
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message, partial: out });
  }
});

// TEMPORARY: soft-delete test bookings + all their payment records
app.get("/api/migrate/delete-bookings", async (req, res) => {
  const key = req.query.key as string;
  if (!key || key !== "alburhan-migrate-2026") return res.status(403).send("Forbidden");
  const { pool } = await import("@workspace/db");
  const nums = [
    'ABT26033710','ABT26034356','ABT26038022','ABT26033123','ABT26031895',
    'ABT26036960','ABT26035537','ABT26046308','ABT26046094','ABT26049541','ABT26047687'
  ];
  try {
    // Delete all payment transactions for these bookings
    const p = await pool.query(
      `UPDATE payment_transactions SET is_deleted=true, deleted_at=NOW(), deletion_reason='Bulk delete of test data'
       WHERE booking_id IN (SELECT id FROM bookings WHERE booking_number = ANY($1))
         AND is_deleted=false`,
      [nums]
    );
    // Soft-delete the bookings themselves
    const b = await pool.query(
      `UPDATE bookings SET deleted_at=NOW() WHERE booking_number = ANY($1) AND deleted_at IS NULL`,
      [nums]
    );
    res.json({ ok: true, bookings_deleted: b.rowCount, payments_deleted: p.rowCount });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default app;
