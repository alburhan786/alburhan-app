import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const dbUrl = process.env.APP_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: dbUrl,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 60000,
  max: 10,
});

pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

export const db = drizzle(pool, { schema });

function isEndpointDisabledError(err: any): boolean {
  return (
    err?.message?.includes("endpoint has been disabled") ||
    err?.message?.includes("endpoint is disabled") ||
    err?.message?.includes("The endpoint has been disabled")
  );
}

export async function warmupDb(retries = 5, delayMs = 3000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      console.log("[DB] Database connection established");
      return;
    } catch (err: any) {
      console.warn(`[DB] Connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i < retries) {
        const wait = isEndpointDisabledError(err) ? delayMs * i : delayMs;
        console.log(`[DB] Retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.warn("[DB] Could not warm up DB at startup — will retry on first request");
      }
    }
  }
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  retries = 4,
  delayMs = 2000,
): Promise<T> {
  for (let i = 1; i <= retries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      if (isEndpointDisabledError(err) && i < retries) {
        console.warn(`[DB] Endpoint disabled on attempt ${i}/${retries}, retrying in ${delayMs * i}ms...`);
        await new Promise((r) => setTimeout(r, delayMs * i));
        continue;
      }
      throw err;
    }
  }
  throw new Error("[DB] All retry attempts exhausted");
}
