import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import fs from "fs";
import router from "./routes/index.js";

const app: Express = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host.startsWith('www.')) {
    const newHost = host.slice(4);
    return res.redirect(301, `${req.protocol}://${newHost}${req.originalUrl}`);
  }
  next();
});

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

app.use(session({
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

if (process.env.NODE_ENV === 'production') {
  const staticDir = process.env.STATIC_FILES_DIR ||
    path.resolve(process.cwd(), 'artifacts/alburhan/dist/public');

  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
}

export default app;
