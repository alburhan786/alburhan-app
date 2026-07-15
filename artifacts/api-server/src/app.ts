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
app.post("/api/migrate/deploy-frontend", async (req, res) => {
  const key = (req.query.key || req.body?.key) as string;
  if (!migrationKeyValid(key)) return void res.status(403).json({ error: "Forbidden" });

  const DEV_URL = "https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev";
  const sourceUrl = ((req.query.source || req.body?.source) as string) ||
    `${DEV_URL}/api/migrate/frontend.tar.gz?key=alburhan-migrate-2026`;

  // Determine extraction target — strip leading "artifacts/alburhan/dist/public" prefix from tar
  const extractTo = path.resolve(__dirname, "../../..");  // /var/www/alburhan (3 levels up from dist/)
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) return void res.status(502).json({ error: `Download failed: HTTP ${response.status}` });
    const buffer = await response.arrayBuffer();
    const bytes = Buffer.from(buffer);
    if (bytes.length < 10_000) return void res.status(502).json({ error: `Tarball too small (${bytes.length} bytes)` });

    // Write tarball to a temp file then extract
    const tmpTar = path.join(os.tmpdir(), `frontend-${Date.now()}.tar.gz`);
    fs.writeFileSync(tmpTar, bytes);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("tar", ["-xzf", tmpTar, "-C", extractTo], { stdio: "pipe" });
      proc.stderr.on("data", (d: Buffer) => console.error("[deploy-frontend tar]", d.toString()));
      proc.on("close", (code: number) => {
        fs.unlinkSync(tmpTar);
        code === 0 ? resolve() : reject(new Error(`tar exited ${code}`));
      });
    });

    res.json({ ok: true, bytes: bytes.length, extractedTo: extractTo, source: sourceUrl });
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
