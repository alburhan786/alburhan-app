import express from "express";
import session from "express-session";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { setupDb } from "./backend/db.js";
import authRoutes from "./backend/routes/auth.js";
import fileRoutes from "./backend/routes/files.js";
import pdfRoutes from "./backend/routes/pdf.js";
import erpRoutes from "./backend/routes/erp.js";
import adminRoutes from "./backend/routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3000", 10);
const isDev = process.env.NODE_ENV !== "production";

async function main() {
  console.log("[PDF Enterprise] Starting server...");

  // Ensure storage directories exist
  const storageDir = path.join(__dirname, "storage", "files");
  const backupDir = path.join(__dirname, "storage", "backups");
  const tempDir = path.join(__dirname, "storage", "temp");
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  await setupDb();

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));

  app.use(
    session({
      secret: process.env.PDF_SESSION_SECRET || "pdf-enterprise-secure-secret-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 4 * 60 * 60 * 1000, // 4 hours
      },
    })
  );

  // API routes under /pdf/api/
  app.use("/pdf/api/auth", authRoutes);
  app.use("/pdf/api/files", fileRoutes);
  app.use("/pdf/api/pdf", pdfRoutes);
  app.use("/pdf/api/erp", erpRoutes);
  app.use("/pdf/api/admin", adminRoutes);

  if (isDev) {
    // Use Vite dev server in middleware mode
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, hmr: true },
      appType: "spa",
      base: "/pdf/",
      configFile: path.join(__dirname, "vite.config.ts"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist/public");
    app.use("/pdf", express.static(distPath));
    app.get("/pdf/*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PDF Enterprise] ✅ Server running on port ${PORT}`);
    console.log(`[PDF Enterprise] Mode: ${isDev ? "development" : "production"}`);
    console.log(`[PDF Enterprise] Preview path: /pdf/`);
  });
}

main().catch((err) => {
  console.error("[PDF Enterprise] FATAL:", err);
  process.exit(1);
});
