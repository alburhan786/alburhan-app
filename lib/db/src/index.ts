import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import fs from "fs";

// ── Self-contained .env reader ─────────────────────────────────────────────
// lib/db may be evaluated before index.ts's dotenv calls (CJS init order),
// so we read the VPS .env directly here to ensure DATABASE_URL is available
// before Pool is created. We use a minimal .env parser (no dotenv import)
// to avoid bundling issues.
(function loadEnvIfMissing() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.length > 20) return; // already set
  const candidates = [
    "/var/www/alburhan/.env",
    "/var/www/alburhan/api-server/.env",
    process.cwd() + "/.env",
  ];
  for (const p of candidates) {
    try {
      const text = fs.readFileSync(p, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx < 1) continue;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && val) {
          process.env[key] = val; // always override — same as dotenv { override: true }
        }
      }
      console.log("[db] .env loaded from:", p, "— DATABASE_URL len:", (process.env.DATABASE_URL || "").length);
      break;
    } catch {}
  }
})();

const { Pool } = pg;

console.log("[db] Creating pool, host:", (() => {
  try { return new URL(process.env.DATABASE_URL || "").hostname; } catch { return "(none)"; }
})());

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db   = drizzle(pool, { schema });

export * from "./schema";
