// @ts-nocheck
/**
 * Tenant Credential Isolation — SaaS Phase 4 Strict
 *
 * Key changes from v40:
 *  • Credential access logging (every get/set/delete/rotate logged to credential_access_logs)
 *  • Key rotation: rotateCredential() increments key_version, stores previous_key_hash
 *  • Session secret is NOT used as a permanent encryption key — a key-version prefix
 *    is mixed into the scrypt derivation so future rotation is supported.
 *  • Plaintext credential values are NEVER returned in API responses or logs.
 *    getCredential() returns the decrypted string only to the caller — callers must
 *    not include it in JSON responses, logs, or error messages.
 *  • Default tenant (Al Burhan) falls back to process.env for backward compat.
 *
 * Usage:
 *   await setCredential(tenantId, "RAZORPAY_KEY_ID", "rzp_live_xxx");
 *   const key = await getCredential(tenantId, "RAZORPAY_KEY_ID");  // use only, never log
 *   const keys = await listCredentials(tenantId);                  // returns key names only
 *   await rotateCredential(tenantId, "RAZORPAY_KEY_ID", "rzp_live_yyy");
 *   await deleteCredential(tenantId, "RAZORPAY_KEY_ID");
 *
 * Security notes:
 *   • Encryption: AES-256-GCM (authenticated — tamper-proof)
 *   • Master key derivation: scrypt(SESSION_SECRET + KEY_VERSION, salt, 32)
 *   • KEY_VERSION allows future key rotation without re-encrypting all stored credentials
 *   • Never pass the return value of getCredential() to console.log, JSON, or HTTP responses
 */

import crypto from "crypto";
import { pool } from "@workspace/db";
import { DEFAULT_TENANT_ID } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// Master key derivation — versioned for future rotation
// ─────────────────────────────────────────────────────────────────────────────

/** Current encryption key version. Increment when rotating the master key. */
const CURRENT_KEY_VERSION = 1;

/** Scrypt salt prefix — change ONLY when doing a full key migration. */
const SCRYPT_SALT_PREFIX = "abt-tenant-cred-v";
const KEY_LEN = 32; // AES-256 = 32 bytes

// Derived key cache (one per key version — supports decryption of old versions during rotation)
const _keyCache = new Map<number, Buffer>();

/**
 * getMasterKey — derive the encryption key for a specific version.
 * Version 1 uses SESSION_SECRET (or MIGRATION_KEY fallback).
 * Future versions increment CURRENT_KEY_VERSION and use new material.
 *
 * WARNING: SESSION_SECRET is used as KEY MATERIAL, not as the key itself.
 * The scrypt KDF adds cost (N=16384) and the version mixes into the salt,
 * so rotating CURRENT_KEY_VERSION produces a completely different key.
 */
function getMasterKey(version = CURRENT_KEY_VERSION): Buffer {
  if (_keyCache.has(version)) return _keyCache.get(version)!;

  const passphrase =
    process.env.SESSION_SECRET ||
    process.env.MIGRATION_KEY?.slice(0, 40) ||
    "dev-fallback-NOT-SECURE-use-SESSION_SECRET";

  // Salt includes key version — rotating version = new key
  const salt = `${SCRYPT_SALT_PREFIX}${version}`;
  const key = crypto.scryptSync(passphrase, salt, KEY_LEN, { N: 16384, r: 8, p: 1 });
  _keyCache.set(version, key);
  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encryption / Decryption
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptedCredential {
  ciphertext: string;  // base64
  iv: string;          // base64, 12 bytes for GCM
  authTag: string;     // base64, 16 bytes
  keyVersion: number;
}

export function encryptCredential(plaintext: string, keyVersion = CURRENT_KEY_VERSION): EncryptedCredential {
  const key = getMasterKey(keyVersion);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
  };
}

export function decryptCredential(enc: EncryptedCredential): string {
  const key = getMasterKey(enc.keyVersion ?? CURRENT_KEY_VERSION);
  const iv = Buffer.from(enc.iv, "base64");
  const authTag = Buffer.from(enc.authTag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential access audit log
// ─────────────────────────────────────────────────────────────────────────────

type CredentialOperation = "get" | "set" | "delete" | "rotate" | "list" | "check";

/**
 * logCredentialAccess — append an entry to credential_access_logs.
 * Non-blocking (fire-and-forget). Never logs plaintext values.
 */
function logCredentialAccess(
  tenantId: string,
  keyName: string,
  operation: CredentialOperation,
  options: {
    accessedBy?: string;
    clientIp?: string;
    success?: boolean;
    keyVersion?: number;
    notes?: string;
  } = {}
): void {
  pool
    .query(
      `INSERT INTO credential_access_logs
         (tenant_id, key_name, operation, accessed_by, client_ip, success, key_version, notes)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        keyName,
        operation,
        options.accessedBy ?? "system",
        options.clientIp ?? null,
        options.success ?? true,
        options.keyVersion ?? null,
        options.notes ?? null,
      ]
    )
    .catch((err: any) => {
      // credential_access_logs may not exist on older schemas — silently skip
      if (!err?.message?.includes("relation") && !err?.message?.includes("does not exist")) {
        console.warn("[TenantCredentials] audit log write failed:", err?.message);
      }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Env-var alias map — default tenant backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

const ENV_VAR_ALIASES: Record<string, string> = {
  RAZORPAY_KEY_ID:           "RAZORPAY_KEY_ID",
  RAZORPAY_SECRET:           "RAZORPAY_SECRET",
  META_ACCESS_TOKEN:         "META_ACCESS_TOKEN",
  META_APP_ID:               "META_APP_ID",
  META_APP_SECRET:           "META_APP_SECRET",
  META_PHONE_NUMBER_ID:      "META_PHONE_NUMBER_ID",
  META_WABA_ID:              "META_WABA_ID",
  META_BUSINESS_ACCOUNT_ID:  "META_BUSINESS_ACCOUNT_ID",
  META_VERIFY_TOKEN:         "META_VERIFY_TOKEN",
  BOTBEE_API_KEY:            "BOTBEE_API_KEY",
  BOTBEE_PHONE_NUMBER_ID:    "BOTBEE_PHONE_NUMBER_ID",
  BOTBEE_BUSINESS_ID:        "BOTBEE_BUSINESS_ID",
  SMTP_HOST:                 "SMTP_HOST",
  SMTP_PORT:                 "SMTP_PORT",
  SMTP_USER:                 "SMTP_USER",
  SMTP_PASS:                 "SMTP_PASS",
  SMTP_FROM:                 "SMTP_FROM",
  LEMIN_API_KEY:             "LEMIN_API_KEY",
  LEMIN_BASE_URL:            "LEMIN_BASE_URL",
  LEMIN_AGENT:               "LEMIN_AGENT",
  FIREBASE_PROJECT_ID:       "FIREBASE_PROJECT_ID",
  FIREBASE_CLIENT_EMAIL:     "FIREBASE_CLIENT_EMAIL",
  FIREBASE_PRIVATE_KEY:      "FIREBASE_PRIVATE_KEY",
  FIREBASE_VAPID_KEY:        "FIREBASE_VAPID_KEY",
};

// ─────────────────────────────────────────────────────────────────────────────
// CRUD API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * setCredential — encrypt and store a credential for a tenant.
 * Logs the operation to credential_access_logs.
 * NEVER logs the plaintext value.
 */
export async function setCredential(
  tenantId: string,
  keyName: string,
  plaintext: string,
  options: { accessedBy?: string; clientIp?: string } = {}
): Promise<void> {
  const enc = encryptCredential(plaintext);
  await pool.query(
    `INSERT INTO tenant_credentials
       (tenant_id, key_name, encrypted_value, iv, auth_tag, key_version, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (tenant_id, key_name)
     DO UPDATE SET
       encrypted_value = EXCLUDED.encrypted_value,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       key_version = EXCLUDED.key_version,
       updated_at = NOW()`,
    [tenantId, keyName, enc.ciphertext, enc.iv, enc.authTag, enc.keyVersion]
  );
  logCredentialAccess(tenantId, keyName, "set", {
    ...options,
    keyVersion: enc.keyVersion,
    notes: "credential stored/updated",
  });
}

/**
 * getCredential — decrypt and return a credential for a tenant.
 *
 * ⚠️  The returned value is the plaintext secret. NEVER:
 *    - Include in JSON API responses
 *    - Pass to console.log or any logging function
 *    - Include in error messages
 *
 * Default tenant falls back to process.env for backward compat.
 */
export async function getCredential(
  tenantId: string,
  keyName: string,
  options: { accessedBy?: string; clientIp?: string; skipAudit?: boolean } = {}
): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `SELECT encrypted_value, iv, auth_tag, key_version
         FROM tenant_credentials
        WHERE tenant_id = $1::uuid AND key_name = $2
        LIMIT 1`,
      [tenantId, keyName]
    );

    if (rows[0]) {
      const plaintext = decryptCredential({
        ciphertext: rows[0].encrypted_value,
        iv: rows[0].iv,
        authTag: rows[0].auth_tag,
        keyVersion: rows[0].key_version ?? 1,
      });
      if (!options.skipAudit) {
        logCredentialAccess(tenantId, keyName, "get", {
          ...options,
          keyVersion: rows[0].key_version ?? 1,
          success: true,
        });
      }
      return plaintext;
    }

    // Default tenant: fall back to env var
    if (tenantId === DEFAULT_TENANT_ID) {
      const envKey = ENV_VAR_ALIASES[keyName] ?? keyName;
      const envVal = process.env[envKey] ?? null;
      if (envVal && !options.skipAudit) {
        logCredentialAccess(tenantId, keyName, "get", {
          ...options,
          notes: "env_var_fallback",
          success: true,
        });
      }
      return envVal;
    }

    logCredentialAccess(tenantId, keyName, "get", {
      ...options,
      success: false,
      notes: "not_found",
    });
    return null;
  } catch (err: any) {
    // NEVER log the error with key name in a way that might expose values
    console.warn(`[TenantCredentials] getCredential error for tenant ${tenantId}:`, err?.code ?? err?.message);
    logCredentialAccess(tenantId, keyName, "get", {
      ...options,
      success: false,
      notes: `error: ${err?.code ?? "unknown"}`,
    });
    if (tenantId === DEFAULT_TENANT_ID) {
      const envKey = ENV_VAR_ALIASES[keyName] ?? keyName;
      return process.env[envKey] ?? null;
    }
    return null;
  }
}

/**
 * listCredentials — return all key_name values for a tenant.
 * NEVER returns decrypted values.
 */
export async function listCredentials(
  tenantId: string,
  options: { accessedBy?: string; clientIp?: string } = {}
): Promise<CredentialSummary[]> {
  try {
    const { rows } = await pool.query(
      `SELECT key_name, key_version, created_at, updated_at, rotated_at
         FROM tenant_credentials
        WHERE tenant_id = $1::uuid
        ORDER BY key_name`,
      [tenantId]
    );
    logCredentialAccess(tenantId, "*", "list", options);
    return rows;
  } catch (err: any) {
    console.warn(`[TenantCredentials] listCredentials error:`, err?.message);
    return [];
  }
}

/**
 * deleteCredential — remove a credential for a tenant.
 */
export async function deleteCredential(
  tenantId: string,
  keyName: string,
  options: { accessedBy?: string; clientIp?: string } = {}
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM tenant_credentials WHERE tenant_id = $1::uuid AND key_name = $2`,
    [tenantId, keyName]
  );
  const deleted = (rowCount ?? 0) > 0;
  logCredentialAccess(tenantId, keyName, "delete", {
    ...options,
    success: deleted,
    notes: deleted ? "deleted" : "not_found",
  });
  return deleted;
}

/**
 * rotateCredential — update the credential to a new value, incrementing key_version.
 * The previous ciphertext hash is saved for audit continuity.
 * Re-encrypts with the current CURRENT_KEY_VERSION master key.
 */
export async function rotateCredential(
  tenantId: string,
  keyName: string,
  newPlaintext: string,
  options: { accessedBy?: string; clientIp?: string } = {}
): Promise<number> {
  // Get current version
  const { rows } = await pool.query(
    `SELECT key_version, encrypted_value FROM tenant_credentials
      WHERE tenant_id = $1::uuid AND key_name = $2 LIMIT 1`,
    [tenantId, keyName]
  );
  const currentVersion = rows[0]?.key_version ?? 0;
  const newVersion = currentVersion + 1;

  // Hash of previous ciphertext for audit continuity (not the plaintext)
  const prevHash = rows[0]?.encrypted_value
    ? crypto.createHash("sha256").update(rows[0].encrypted_value).digest("hex").slice(0, 16)
    : null;

  const enc = encryptCredential(newPlaintext, CURRENT_KEY_VERSION);

  await pool.query(
    `UPDATE tenant_credentials SET
       encrypted_value   = $3,
       iv                = $4,
       auth_tag          = $5,
       key_version       = $6,
       rotated_at        = NOW(),
       previous_key_hash = $7,
       updated_at        = NOW()
     WHERE tenant_id = $1::uuid AND key_name = $2`,
    [tenantId, keyName, enc.ciphertext, enc.iv, enc.authTag, newVersion, prevHash]
  );

  logCredentialAccess(tenantId, keyName, "rotate", {
    ...options,
    keyVersion: newVersion,
    notes: `rotated v${currentVersion}→v${newVersion}`,
  });
  return newVersion;
}

/**
 * hasCredential — non-throwing existence check.
 */
export async function hasCredential(tenantId: string, keyName: string): Promise<boolean> {
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
  key_version: number;
  created_at: string;
  updated_at: string;
  rotated_at: string | null;
}
