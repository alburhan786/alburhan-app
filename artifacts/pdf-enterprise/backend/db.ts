import pg from "pg";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from .env files if not set
(function loadEnv() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.length > 20) return;
  const candidates = [
    "/var/www/alburhan/.env",
    path.join(__dirname, "../../.env"),
    path.join(__dirname, "../../../.env"),
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
        if (key && val) process.env[key] = val;
      }
      break;
    } catch {}
  }
})();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

export async function setupDb() {
  console.log("[PDF-DB] Running migrations...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdf_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
      totp_secret VARCHAR(200),
      totp_enabled BOOLEAN NOT NULL DEFAULT false,
      totp_pending BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      session_timeout_minutes INTEGER NOT NULL DEFAULT 240,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdf_folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      parent_id UUID REFERENCES pdf_folders(id) ON DELETE CASCADE,
      owner_id UUID REFERENCES pdf_users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdf_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(500) NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      storage_path VARCHAR(1000) NOT NULL,
      size_bytes BIGINT,
      page_count INTEGER,
      folder_id UUID REFERENCES pdf_folders(id) ON DELETE SET NULL,
      owner_id UUID REFERENCES pdf_users(id),
      checksum VARCHAR(64),
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMPTZ,
      deleted_by UUID REFERENCES pdf_users(id),
      erp_source VARCHAR(100),
      erp_id VARCHAR(200),
      has_password BOOLEAN NOT NULL DEFAULT false,
      tags TEXT[] DEFAULT '{}',
      description TEXT,
      current_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdf_file_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      file_id UUID NOT NULL REFERENCES pdf_files(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      storage_path VARCHAR(1000) NOT NULL,
      size_bytes BIGINT,
      checksum VARCHAR(64),
      operation VARCHAR(100),
      created_by UUID REFERENCES pdf_users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdf_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES pdf_users(id),
      username VARCHAR(50),
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50),
      resource_id VARCHAR(200),
      resource_name VARCHAR(500),
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(50),
      user_agent TEXT,
      severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS pdf_audit_created_idx ON pdf_audit_logs(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pdf_audit_user_idx ON pdf_audit_logs(user_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdf_backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename VARCHAR(500) NOT NULL,
      storage_path VARCHAR(1000) NOT NULL,
      size_bytes BIGINT,
      file_count INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      triggered_by VARCHAR(50) DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdf_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES pdf_users(id),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create default admin user if no users exist
  const { rows } = await pool.query(`SELECT COUNT(*) as cnt FROM pdf_users`);
  if (parseInt(rows[0].cnt, 10) === 0) {
    const hash = await bcrypt.hash("Admin@2024!", 12);
    await pool.query(
      `INSERT INTO pdf_users (id, username, email, password_hash, role) VALUES ($1, $2, $3, $4, 'admin')`,
      [uuidv4(), "admin", "admin@alburhantravels.com", hash]
    );
    console.log("[PDF-DB] ✅ Default admin user created: admin / Admin@2024!");
  }

  console.log("[PDF-DB] ✅ All tables ready");
}
