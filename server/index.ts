import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const log = console.log;

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
      on: {
        proxyRes: (proxyRes, req) => {
          const isManifest = (req.url === "/" || req.url === "/manifest") &&
            req.headers["expo-platform"];

          if (isManifest && devDomain) {
            const originalWrite = proxyRes.pipe;
            let body = "";

            proxyRes.headers["transfer-encoding"] = "";

            const originalPipe = proxyRes.pipe;
            const chunks: Buffer[] = [];

            proxyRes.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
          }
        },
      },
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        return next();
      }

      if (req.path === "/admin" || req.path.startsWith("/invoice/")) {
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
        const metroUrl = `http://localhost:8081${req.path}`;
        const headers: Record<string, string> = {};
        const headersToForward = [
          "expo-platform", "expo-dev-client-id", "expo-runtime-version",
          "expo-expect-signature", "expo-protocol-version", "expo-sfv-version",
          "accept", "user-agent",
        ];
        for (const h of headersToForward) {
          const val = req.header(h);
          if (val) headers[h] = val;
        }

        fetch(metroUrl, { headers })
          .then(async (metroRes) => {
            metroRes.headers.forEach((value, key) => {
              if (key.toLowerCase() !== "transfer-encoding" && key.toLowerCase() !== "content-length") {
                res.setHeader(key, value);
              }
            });

            let body = await metroRes.text();

            if (devDomain) {
              try {
                const manifest = JSON.parse(body);

                const hostWithPort = `${devDomain}:443`;

                if (manifest.extra?.expoClient) {
                  manifest.extra.expoClient.hostUri = hostWithPort;
                }
                if (manifest.extra?.expoGo) {
                  manifest.extra.expoGo.debuggerHost = hostWithPort;
                }

                body = JSON.stringify(manifest);
                log(`Manifest rewritten: hostUri=${hostWithPort}`);
              } catch {
                log("Could not parse manifest for URL rewriting");
              }
            }

            res.status(metroRes.status).send(body);
          })
          .catch((err) => {
            log(`Metro manifest proxy error: ${err}`);
            res.status(502).json({ error: "Could not connect to Metro bundler" });
          });
        return;
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

  const metroProxy = configureExpoAndLanding(app);

  const server = await registerRoutes(app);

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

  if (metroProxy) {
    server.on("upgrade", (req, socket, head) => {
      if (!req.url?.startsWith("/api")) {
        metroProxy.upgrade(req, socket, head);
      }
    });
    log("WebSocket proxy to Metro enabled");
  }
})();
