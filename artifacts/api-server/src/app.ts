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

// POST /api/migrate/self-update — downloads a new bundle from a source URL and
// writes it to dist/index.cjs, then triggers a pm2 restart (detached).
// Enables remote VPS deploys without SSH after the first manual deploy.
app.post("/api/migrate/self-update", async (req, res) => {
  const key = (req.query.key || req.body?.key) as string;
  if (!migrationKeyValid(key)) return res.status(403).json({ error: "Forbidden" });

  const DEV_URL = "https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev";
  const sourceUrl = ((req.query.source || req.body?.source) as string) ||
    `${DEV_URL}/api/migrate/server.cjs?key=alburhan-migrate-2026`;

  const binPath = path.join(__dirname, "../dist/index.cjs");
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      return res.status(502).json({ error: `Download failed: HTTP ${response.status}`, url: sourceUrl });
    }
    const buffer = await response.arrayBuffer();
    const bytes = Buffer.from(buffer);
    if (bytes.length < 1_000_000) {
      return res.status(502).json({ error: `Bundle too small (${bytes.length} bytes) — not a valid bundle`, url: sourceUrl });
    }
    fs.writeFileSync(binPath, bytes);
    res.json({ ok: true, bytes: bytes.length, source: sourceUrl, message: "Bundle updated. Restarting pm2 in 1s..." });
    setTimeout(() => {
      const pm2 = spawn("pm2", ["restart", "alburhan-api"], { detached: true, stdio: "ignore" });
      pm2.unref();
    }, 1000);
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message, url: sourceUrl });
  }
});

// GET /api/migrate/server.cjs — serves the built bundle for VPS to download
app.get("/api/migrate/server.cjs", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");
  const binPath = path.join(__dirname, "../dist/index.cjs");
  if (!fs.existsSync(binPath)) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename=index.cjs");
  res.sendFile(binPath);
});

// GET /api/migrate/vps-update.sql — serves the DB migration SQL for VPS
app.get("/api/migrate/vps-update.sql", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");
  // Search multiple paths: works in both dev (src/) and production bundle (dist/)
  const sqlCandidates = [
    path.join(__dirname, "alburhan-vps-update.sql"),
    path.join(__dirname, "../src/alburhan-vps-update.sql"),
    path.resolve(process.cwd(), "artifacts/api-server/src/alburhan-vps-update.sql"),
  ];
  const sqlPath = sqlCandidates.find(p => fs.existsSync(p));
  if (!sqlPath) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=vps-update.sql");
  res.sendFile(sqlPath);
});

// GET /api/migrate/frontend.tar.gz — serves updated frontend assets
app.get("/api/migrate/frontend.tar.gz", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");

  const candidates = [
    path.resolve(process.cwd(), "artifacts/alburhan/dist/public"),
    path.resolve(process.cwd(), "../alburhan/dist/public"),
    path.join(__dirname, "../../alburhan/dist/public"),
    path.join(__dirname, "../../../artifacts/alburhan/dist/public"),
  ];
  const distDir = candidates.find(d => fs.existsSync(d));

  if (!distDir) {
    const tarPath = path.join(__dirname, "alburhan-frontend.tar.gz");
    if (!fs.existsSync(tarPath)) return res.status(404).send("Frontend dist not found");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", "attachment; filename=alburhan-frontend.tar.gz");
    return res.sendFile(tarPath);
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
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");
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

// GET /api/migrate/notif-trace — full notification pipeline trace for a booking
app.get("/api/migrate/notif-trace", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");
  const bookingNumber = req.query.booking as string;
  if (!bookingNumber) return res.status(400).json({ error: "Missing ?booking=BOOKING_NUMBER" });
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
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");

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

// GET /api/migrate/dump.sql — serves DB dump (if file exists)
app.get("/api/migrate/dump.sql", (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");
  const dumpPath = path.join(__dirname, "alburhan-dump.sql");
  if (!fs.existsSync(dumpPath)) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=alburhan-dump.sql");
  res.sendFile(dumpPath);
});

// GET /api/migrate/delete-bookings — soft-delete test bookings
app.get("/api/migrate/delete-bookings", async (req, res) => {
  const key = req.query.key as string;
  if (!migrationKeyValid(key)) return res.status(403).send("Forbidden");
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
