// @ts-nocheck
/**
 * Tenant Credential Isolation — SaaS Phase 4
 *
 * Stores per-tenant API keys and secrets, encrypted with AES-256-GCM.
 * The master key is derived from SESSION_SECRET (or MIGRATION_KEY as fallback)
 * using scrypt — no additional env var required.
 *
 * Al Burhan default tenant FALLS BACK to global env vars for backward compatibility.
 * All existing functionality is preserved — no existing code paths are changed.
 *
 * Usage:
 *   await setCredential(tenantId, "RAZORPAY_KEY_ID", "rzp_live_xxx");
 *   const key = await getCredential(tenantId, "RAZORPAY_KEY_ID");
 *   const keys = await listCredentials(tenantId);
 *   await deleteCredential(tenantId, "RAZORPAY_KEY_ID");
 *
 * Env var fallback for default tenant:
 *   getCredential(DEFAULT_TENANT_ID, "RAZORPAY_KEY_ID") → process.env.RAZORPAY_KEY_ID
 */

import crypto from "crypto";
import { pool } from "@workspace/db";
import { DEFAULT_TENANT_ID } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// Master key derivation (deterministic from existing secrets)
// ─────────────────────────────────────────────────────────────────────────────

const SCRYPT_SALT = "abt-tenant-credentials-v1";
const KEY_LEN = 32; // AES-256 requires 32 bytes

let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey;
  const passphrase =
    process.env.SESSION_SECRET ||
    process.env.MIGRATION_KEY?.slice(0, 40) ||
    "dev-fallback-phase4-key-NOT-SECURE-use-SESSION_SECRET";
  _masterKey = crypto.scryptSync(passphrase, SCRYPT_SALT, KEY_LEN);
  return _masterKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encryption / Decryption
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptedCredential {
  ciphertext: string; // base64
  iv: string;         // base64, 12 bytes for GCM
  authTag: string;    // base64, 16 bytes
}

export function encryptCredential(plaintext: string): EncryptedCredential {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptCredential(enc: EncryptedCredential): string {
  const key = getMasterKey();
  const iv = Buffer.from(enc.iv, "base64");
  const authTag = Buffer.from(enc.authTag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Env-var alias map — for default tenant backward compatibility
// Maps canonical credential key names to their environment variable equivalents.
// ─────────────────────────────────────────────────────────────────────────────

const ENV_VAR_ALIASES: Record<string, string> = {
  RAZORPAY_KEY_ID: "RAZORPAY_KEY_ID",
  RAZORPAY_SECRET: "RAZORPAY_SECRET",
  META_ACCESS_TOKEN: "META_ACCESS_TOKEN",
  META_APP_ID: "META_APP_ID",
  META_APP_SECRET: "META_APP_SECRET",
  META_PHONE_NUMBER_ID: "META_PHONE_NUMBER_ID",
  META_WABA_ID: "META_WABA_ID",
  BOTBEE_API_KEY: "BOTBEE_API_KEY",
  BOTBEE_PHONE_NUMBER_ID: "BOTBEE_PHONE_NUMBER_ID",
  SMTP_HOST: "SMTP_HOST",
  SMTP_PORT: "SMTP_PORT",
  SMTP_USER: "SMTP_USER",
  SMTP_PASS: "SMTP_PASS",
  SMTP_FROM: "SMTP_FROM",
};

// ─────────────────────────────────────────────────────────────────────────────
// CRUD API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * setCredential — encrypt and store a credential for a tenant.
 */
export async function setCredential(
  tenantId: string,
  keyName: string,
  plaintext: string
): Promise<void> {
  const enc = encryptCredential(plaintext);
  await pool.query(
    `INSERT INTO tenant_credentials (tenant_id, key_name, encrypted_value, iv, auth_tag, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, NOW())
     ON CONFLICT (tenant_id, key_name)
     DO UPDATE SET
       encrypted_value = EXCLUDED.encrypted_value,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       updated_at = NOW()`,
    [tenantId, keyName, enc.ciphertext, enc.iv, enc.authTag]
  );
}

/**
 * getCredential — decrypt and return a credential for a tenant.
 *
 * For DEFAULT_TENANT_ID, falls back to process.env[keyName] for backward compat.
 * Returns null if not found.
 */
export async function getCredential(
  tenantId: string,
  keyName: string
): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `SELECT encrypted_value, iv, auth_tag
         FROM tenant_credentials
        WHERE tenant_id = $1::uuid AND key_name = $2
        LIMIT 1`,
      [tenantId, keyName]
    );

    if (rows[0]) {
      return decryptCredential({
        ciphertext: rows[0].encrypted_value,
        iv: rows[0].iv,
        authTag: rows[0].auth_tag,
      });
    }

    // Default tenant: fall back to env var
    if (tenantId === DEFAULT_TENANT_ID) {
      const envKey = ENV_VAR_ALIASES[keyName] ?? keyName;
      return process.env[envKey] ?? null;
    }

    return null;
  } catch (err: any) {
    console.warn(`[TenantCredentials] getCredential(${tenantId}, ${keyName}) error:`, err?.message);
    // For default tenant, always fall back to env (fail open for backward compat)
    if (tenantId === DEFAULT_TENANT_ID) {
      const envKey = ENV_VAR_ALIASES[keyName] ?? keyName;
      return process.env[envKey] ?? null;
    }
    return null;
  }
}

/**
 * listCredentials — return all key_name values for a tenant (no decrypted values).
 */
export async function listCredentials(tenantId: string): Promise<CredentialSummary[]> {
  try {
    const { rows } = await pool.query(
      `SELECT key_name, created_at, updated_at
         FROM tenant_credentials
        WHERE tenant_id = $1::uuid
        ORDER BY key_name`,
      [tenantId]
    );
    return rows;
  } catch (err: any) {
    console.warn(`[TenantCredentials] listCredentials error:`, err?.message);
    return [];
  }
}

/**
 * deleteCredential — remove a credential for a tenant.
 * Returns true if a row was deleted.
 */
export async function deleteCredential(
  tenantId: string,
  keyName: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM tenant_credentials WHERE tenant_id = $1::uuid AND key_name = $2`,
    [tenantId, keyName]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * hasCredential — non-throwing existence check.
 */
export async function hasCredential(
  tenantId: string,
  keyName: string
): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM tenant_credentials WHERE tenant_id = $1::uuid AND key_name = $2 LIMIT 1`,
      [tenantId, keyName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * isCredentialTableReady — checks if tenant_credentials table exists.
 */
export async function isCredentialTableReady(): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenant_credentials' LIMIT 1`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export interface CredentialSummary {
  key_name: string;
  created_at: string;
  updated_at: string;
}
