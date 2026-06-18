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
import router from "./routes/index.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { requireDeleteToken } from "./middlewares/requireDeleteToken.js";

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
    ? new PgSession({ pool: sessionPool, createTableIfMissing: true })
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

app.use("/api", (req, res, next) => {
  if (req.method === "DELETE") return requireDeleteToken(req, res, next);
  next();
});

app.use("/api", router);

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

export default app;
