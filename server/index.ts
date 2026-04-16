import express from "express";
import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { registerChatRoutes } from "./replit_integrations/chat";
import { warmupDb, db, pool } from "./db";
import * as fs from "fs";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

declare module "express-session" {
  interface SessionData {
    adminLoggedIn?: boolean;
    userId?: number;
  }
}

const app = express();
const log = console.log;

async function ensureDemoUser(): Promise<void> {
  const DEMO_EMAIL = "test@alburhantravels.com";
  const DEMO_PHONE = "9000000000";
  const DEMO_NAME = "Test User";
  const DEMO_PASSWORD = "123456";

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing) {
    console.log(`[Demo] Demo user ready: id=${existing.id} email=${DEMO_EMAIL}`);
    return;
  }
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [created] = await db.insert(users).values({
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    phone: DEMO_PHONE,
    password: hashedPassword,
  }).onConflictDoNothing().returning({ id: users.id });
  if (created) {
    console.log(`[Demo] Demo user created: id=${created.id} email=${DEMO_EMAIL} phone=${DEMO_PHONE}`);
    console.log(`[Demo] Demo user ready: id=${created.id} email=${DEMO_EMAIL}`);
  } else {
    const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL));
    console.log(`[Demo] Demo user ready: id=${found?.id ?? "?"} email=${DEMO_EMAIL}`);
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path.startsWith("/node_modules/") ||
        req.path.endsWith(".bundle") ||
        req.path.endsWith(".map") ||
        req.path.startsWith("/.expo/") ||
        req.path.startsWith("/assets/") ||
        req.query.platform) {
      return next();
    }
    next();
  });

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return next();
    }
    express.json({
      verify: (req2, _res, buf) => {
        (req2 as any).rawBody = buf;
      },
    })(req, res, next);
  });

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return next();
    }
    express.urlencoded({ extended: false })(req, res, next);
  });
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  const devDomain = process.env.REPLIT_DEV_DOMAIN || "";
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    const metroProxy = createProxyMiddleware({
      target: "http://localhost:8081",
      changeOrigin: true,
      ws: true,
      logger: undefined,
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        return next();
      }

      if (
        req.path === "/admin" ||
        req.path.startsWith("/admin/") ||
        req.path.startsWith("/invoice/") ||
        req.path.startsWith("/i/") ||
        req.path === "/privacy-policy" ||
        req.path === "/terms-and-conditions" ||
        req.path === "/refund-policy" ||
        req.path === "/delete-account"
      ) {
        return next();
      }

      const platform = req.header("expo-platform");

      if (req.path === "/" && !platform) {
        return serveLandingPage({
          req,
          res,
          landingPageTemplate,
          appName,
        });
      }

      if ((req.path === "/" || req.path === "/manifest") && platform) {
        return metroProxy(req, res, next);
      }

      const shouldProxy =
        req.path.startsWith("/node_modules/") ||
        req.path.startsWith("/.expo/") ||
        req.path.startsWith("/logs") ||
        req.path.startsWith("/inspector") ||
        req.path.startsWith("/symbolicate") ||
        req.path.startsWith("/reload") ||
        req.path.startsWith("/status") ||
        req.path.startsWith("/hot") ||
        req.path.startsWith("/message") ||
        req.path.startsWith("/debugger-proxy") ||
        req.path.endsWith(".bundle") ||
        req.path.endsWith(".map") ||
        req.query.platform;

      if (shouldProxy) {
        return metroProxy(req, res, next);
      }

      next();
    });

    app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
    app.use(express.static(path.resolve(process.cwd(), "static-build")));

    return metroProxy;
  } else {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        return next();
      }

      const platform = req.header("expo-platform");
      if ((req.path === "/" || req.path === "/manifest") && platform && (platform === "ios" || platform === "android")) {
        const manifestPath = path.resolve(process.cwd(), "static-build", platform, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
          return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
        }
        res.setHeader("expo-protocol-version", "1");
        res.setHeader("expo-sfv-version", "0");
        res.setHeader("content-type", "application/json");
        const manifest = fs.readFileSync(manifestPath, "utf-8");
        return res.send(manifest);
      }

      if (req.path === "/") {
        return serveLandingPage({ req, res, landingPageTemplate, appName });
      }

      next();
    });

    app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
    app.use(express.static(path.resolve(process.cwd(), "static-build")));

    return null;
  }
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  app.set("trust proxy", 1);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is not set. Please add it to your secrets.");
  }

  const PgSession = connectPgSimple(session);

  app.use(session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }));

  app.use("/admin", express.urlencoded({ extended: false }));

  const metroProxy = configureExpoAndLanding(app);

  registerChatRoutes(app);
  const server = await registerRoutes(app);

  const { initFirebaseEager } = await import("./services/firebase");
  initFirebaseEager();

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );

  warmupDb().catch((err) => {
    console.warn("[DB] Warmup failed:", err?.message);
  });

  ensureDemoUser().catch((err) => {
    console.warn("[Demo] ensureDemoUser failed:", err?.message);
  });

  if (metroProxy) {
    server.on("upgrade", (req, socket, head) => {
      if (!req.url?.startsWith("/api")) {
        metroProxy.upgrade(req, socket, head);
      }
    });
    log("WebSocket proxy to Metro enabled");
  }
})();
