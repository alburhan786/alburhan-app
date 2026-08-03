import { pool } from "@workspace/db";
import { decrypt, encrypt } from "./encryption.js";
import { isPlaceholderKey } from "./keyValidation.js";

export interface ProviderConfig {
  enabled: boolean;
  apiUrl?: string;
  apiKey?: string;
  extra: Record<string, string>;
}

type ProviderName = "botbee" | "fast2sms" | "lemin" | "smtp" | "firebase" | "razorpay";

// In-memory cache — populated at startup and refreshed every 5 min + on save
const cache: Map<ProviderName, ProviderConfig> = new Map();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadFromDB(): Promise<void> {
  try {
    const res = await pool.query(`SELECT provider, enabled, api_url, api_key_encrypted, extra_fields_encrypted FROM api_settings`);
    for (const row of res.rows) {
      const decryptedKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : undefined;
      let extra: Record<string, string> = {};
      if (row.extra_fields_encrypted) {
        try { extra = JSON.parse(decrypt(row.extra_fields_encrypted)); } catch {}
      }
      cache.set(row.provider as ProviderName, {
        enabled: row.enabled,
        apiUrl: row.api_url || undefined,
        apiKey: decryptedKey || undefined,
        extra,
      });
    }
    cacheLoadedAt = Date.now();
  } catch (err) {
    console.error("[ApiSettings] Failed to load from DB:", err);
  }
}

/**
 * Permanent sync: every startup, if the bundle's injected env key differs from
 * what is stored in the DB (or DB has no key / stale key), overwrite DB with
 * the env key. This ensures a fresh bundle deploy always wins, without needing
 * manual admin action. Never runs if env has no real key to offer.
 */
async function autoImportFast2SmsFromEnv(): Promise<void> {
  try {
    const envKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
    if (isPlaceholderKey(envKey)) {
      console.log("[ApiSettings] fast2sms: no valid env key to sync");
      return;
    }

    const existing = cache.get("fast2sms");
    const dbKey = existing?.apiKey;

    // Already in sync — skip the write
    if (dbKey && !isPlaceholderKey(dbKey) && dbKey === envKey) {
      console.log("[ApiSettings] fast2sms: DB key matches env key — no sync needed");
      return;
    }

    const reason = !dbKey
      ? "no DB key"
      : isPlaceholderKey(dbKey)
        ? "DB key is placeholder"
        : "DB key is stale/different from bundle";

    console.log(`[ApiSettings] fast2sms: syncing env key → DB (reason: ${reason})`);
    const encryptedKey = encrypt(envKey!);
    await pool.query(
      `INSERT INTO api_settings (provider, enabled, api_url, api_key_encrypted, updated_at, updated_by)
       VALUES ('fast2sms', true, 'https://www.fast2sms.com/dev/bulkV2', $1, NOW(), 'system-auto-sync')
       ON CONFLICT (provider) DO UPDATE SET
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         enabled = true,
         updated_at = NOW(),
         updated_by = 'system-auto-sync'`,
      [encryptedKey]
    );
    await loadFromDB();
    console.log("[ApiSettings] fast2sms: key synced from bundle env → DB ✓");
  } catch (err) {
    console.error("[ApiSettings] fast2sms auto-sync failed:", err);
  }
}

/**
 * Force-resync: called from /api/migrate/resync-fast2sms.
 * Always overwrites DB with current process.env value (bundle-injected key).
 * Returns the masked key written.
 */
export async function forceResyncFast2SmsKey(): Promise<{ ok: boolean; reason: string; maskedKey: string }> {
  const envKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
  if (isPlaceholderKey(envKey)) {
    return { ok: false, reason: "No valid FAST2SMS key found in bundle env (placeholder or missing)", maskedKey: "NOT_FOUND" };
  }
  const maskedKey = `${envKey!.slice(0, 8)}...${envKey!.slice(-4)} (len=${envKey!.length})`;
  try {
    const encryptedKey = encrypt(envKey!);
    await pool.query(
      `INSERT INTO api_settings (provider, enabled, api_url, api_key_encrypted, updated_at, updated_by)
       VALUES ('fast2sms', true, 'https://www.fast2sms.com/dev/bulkV2', $1, NOW(), 'admin-force-resync')
       ON CONFLICT (provider) DO UPDATE SET
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         enabled = true,
         updated_at = NOW(),
         updated_by = 'admin-force-resync'`,
      [encryptedKey]
    );
    await loadFromDB();
    return { ok: true, reason: "Key force-written from bundle env to DB and cache refreshed", maskedKey };
  } catch (err: any) {
    return { ok: false, reason: `DB write failed: ${err.message}`, maskedKey };
  }
}

/**
 * BotBee auto-sync: if the bundle's injected BOTBEE_API_KEY differs from what is
 * stored in the DB (or DB has no key / wrong key), overwrite DB with env key.
 * This ensures a fresh bundle deploy always wins over manually-entered DB keys.
 * Does NOT overwrite extra_fields_encrypted (phone_number_id, business_id) —
 * those are admin-managed and should not be clobbered.
 */
async function autoImportBotBeeFromEnv(): Promise<void> {
  try {
    const envKey = process.env.BOTBEE_API_KEY;
    if (isPlaceholderKey(envKey)) {
      console.log("[ApiSettings] botbee: no valid env key to sync");
      return;
    }

    const existing = cache.get("botbee");
    const dbKey = existing?.apiKey;

    // Already in sync — skip the write
    if (dbKey && !isPlaceholderKey(dbKey) && dbKey === envKey) {
      console.log("[ApiSettings] botbee: DB key matches env key — no sync needed");
      return;
    }

    const reason = !dbKey
      ? "no DB key"
      : isPlaceholderKey(dbKey)
        ? "DB key is placeholder"
        : "DB key differs from bundle env (overwriting with env key)";

    console.log(`[ApiSettings] botbee: syncing env key → DB (reason: ${reason})`);
    const encryptedKey = encrypt(envKey!);
    await pool.query(
      `INSERT INTO api_settings (provider, enabled, api_url, api_key_encrypted, updated_at, updated_by)
       VALUES ('botbee', true, 'https://app.botbee.io/api/v1/whatsapp', $1, NOW(), 'system-auto-sync')
       ON CONFLICT (provider) DO UPDATE SET
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         enabled = true,
         updated_at = NOW(),
         updated_by = 'system-auto-sync'`,
      [encryptedKey]
    );
    await loadFromDB();
    console.log("[ApiSettings] botbee: API key synced from bundle env → DB ✓");
  } catch (err) {
    console.error("[ApiSettings] botbee auto-sync failed:", err);
  }
}

export async function initApiSettingsProvider(): Promise<void> {
  await loadFromDB();
  await autoImportFast2SmsFromEnv();
  await autoImportBotBeeFromEnv();
  // Refresh every 5 minutes
  setInterval(() => { loadFromDB().catch(() => {}); }, CACHE_TTL_MS);
  console.log("[ApiSettings] Provider initialized");
}

export function invalidateCache(): void {
  cacheLoadedAt = 0;
  loadFromDB().catch(() => {});
}

/**
 * Get provider config, falling back to process.env if not in DB.
 * Returns null if provider is explicitly disabled in DB.
 */
export function getCachedConfig(provider: ProviderName): ProviderConfig {
  const dbConfig = cache.get(provider);

  // If DB has a record and it's disabled, return disabled config
  if (dbConfig && dbConfig.enabled === false) {
    return { enabled: false, extra: {} };
  }

  if (dbConfig && dbConfig.apiKey) {
    // Merge env-based defaults into DB extra so that any field the DB left empty
    // still gets a working value (e.g. notify_template_id, otp_template_id, sender_id).
    // DB non-empty values always win; env defaults fill only blank/missing slots.
    const envFallback = buildEnvFallback(provider);
    const merged: Record<string, string> = { ...envFallback.extra };
    for (const [k, v] of Object.entries(dbConfig.extra)) {
      if (v && v.trim() !== "") merged[k] = v;
    }
    return { ...dbConfig, extra: merged };
  }

  // Fall back to process.env
  return buildEnvFallback(provider);
}

function buildEnvFallback(provider: ProviderName): ProviderConfig {
  switch (provider) {
    case "botbee":
      return {
        enabled: true,
        apiUrl: "https://app.botbee.io/api/v1/whatsapp",
        apiKey: process.env.BOTBEE_API_KEY,
        extra: {
          phone_number_id: process.env.BOTBEE_PHONE_NUMBER_ID || "",
          business_id: process.env.BOTBEE_BUSINESS_ID || "",
        },
      };
    case "fast2sms": {
      const envKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
      return {
        enabled: true,
        apiUrl: "https://www.fast2sms.com/dev/bulkV2",
        apiKey: isPlaceholderKey(envKey) ? undefined : envKey,
        extra: {
          sender_id: "ALBURH",
          otp_template_id: "164844",
          notify_template_id: "",
        },
      };
    }
    case "lemin":
      // No hardcoded placeholder user_id — a fake default caused Lemin's
      // "Invalid User ID" error in production. Leave unset unless the real
      // LEMIN_USER_ID/LEMIN_API_KEY secrets are configured; sendRCS() will
      // then correctly report "not configured" instead of failing silently
      // against the provider with bogus credentials.
      return {
        enabled: !!(process.env.LEMIN_API_KEY || process.env.LEMIN_USER_ID),
        apiUrl: process.env.LEMIN_API_URL || "https://rcs.leminai.com/api/send",
        apiKey: process.env.LEMIN_API_KEY,
        extra: {
          user_id: process.env.LEMIN_USER_ID || "",
          template_id: process.env.LEMIN_TEMPLATE_ID || "",  // no hardcoded default — read from rcs_template_mappings
        },
      };
    case "smtp":
      return {
        enabled: true,
        apiUrl: process.env.SMTP_HOST || "smtp.gmail.com",
        apiKey: process.env.SMTP_PASS,
        extra: {
          port: process.env.SMTP_PORT || "587",
          user: process.env.SMTP_USER || "",
          from_email: process.env.SMTP_USER || "",
          from_name: "Al Burhan Tours & Travels",
        },
      };
    case "firebase":
      return {
        enabled: false,
        apiUrl: "https://fcm.googleapis.com/fcm/send",
        apiKey: process.env.FIREBASE_SERVER_KEY,
        extra: {
          project_id: process.env.FIREBASE_PROJECT_ID || "",
          sender_id: process.env.FIREBASE_SENDER_ID || "",
        },
      };
    case "razorpay":
      return {
        enabled: true,
        apiUrl: "https://api.razorpay.com/v1",
        apiKey: process.env.RAZORPAY_KEY_ID,
        extra: {
          key_secret: process.env.RAZORPAY_SECRET || "",
        },
      };
    default:
      return { enabled: false, extra: {} };
  }
}

// ── Email circuit breaker ─────────────────────────────────────────────────────
// Reads key='email_circuit_breaker' from api_settings.
// value='suspended' → email disabled. Any other value (or row missing) → enabled.
// Cache is 30 s so a UI toggle takes effect within half a minute without a restart.
let _emailEnabledCache: boolean | null = null;
let _emailEnabledCachedAt = 0;
const EMAIL_CB_TTL = 30_000;

export async function isEmailEnabled(): Promise<boolean> {
  if (_emailEnabledCache !== null && Date.now() - _emailEnabledCachedAt < EMAIL_CB_TTL) {
    return _emailEnabledCache;
  }
  try {
    const r = await pool.query(
      `SELECT value FROM api_settings WHERE key='email_circuit_breaker' LIMIT 1`
    );
    _emailEnabledCache = r.rows[0]?.value !== "suspended";
    _emailEnabledCachedAt = Date.now();
    return _emailEnabledCache;
  } catch {
    return false; // fail-safe: treat as suspended on DB error
  }
}

export function bustEmailEnabledCache(): void {
  _emailEnabledCache = null;
}
