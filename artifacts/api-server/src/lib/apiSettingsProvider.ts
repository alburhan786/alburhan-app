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
 * One-time import: if the fast2sms DB row has no usable (non-placeholder) key
 * but a real key is present in process.env, copy it into the DB once so the
 * admin UI/status page reflect reality and future lookups don't depend on env.
 * Never overwrites an existing valid DB key.
 */
async function autoImportFast2SmsFromEnv(): Promise<void> {
  try {
    const existing = cache.get("fast2sms");
    if (existing?.apiKey && !isPlaceholderKey(existing.apiKey)) return; // DB already has a real key

    const envKey = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
    if (isPlaceholderKey(envKey)) return; // nothing usable to import

    console.log("[ApiSettings] fast2sms DB key missing/placeholder — importing real key from env once");
    const encryptedKey = encrypt(envKey!);
    await pool.query(
      `INSERT INTO api_settings (provider, enabled, api_url, api_key_encrypted, updated_at, updated_by)
       VALUES ('fast2sms', true, 'https://www.fast2sms.com/dev/bulkV2', $1, NOW(), 'system-auto-import')
       ON CONFLICT (provider) DO UPDATE SET
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         enabled = true,
         updated_at = NOW(),
         updated_by = 'system-auto-import'`,
      [encryptedKey]
    );
    await loadFromDB();
    console.log("[ApiSettings] fast2sms API key imported from env into database");
  } catch (err) {
    console.error("[ApiSettings] fast2sms auto-import from env failed:", err);
  }
}

export async function initApiSettingsProvider(): Promise<void> {
  await loadFromDB();
  await autoImportFast2SmsFromEnv();
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
    return dbConfig;
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
          notify_template_id: "211277",
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
          template_id: process.env.LEMIN_TEMPLATE_ID || "1473",
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
