// ── GoogleOAuthTokenManager ────────────────────────────────────────────────────
// Shared token refresh for ALL Google integrations (Business, Calendar, Drive, YouTube).
// Never expose raw tokens in logs or responses.
// @ts-nocheck
import { pool } from "@workspace/db";
import { encrypt, decrypt } from "./encryption.js";

// ── Error types ──────────────────────────────────────────────────────────────
export type GoogleTokenErrorKind =
  | "invalid_grant"       // Refresh token revoked/expired — must reconnect
  | "token_revoked"
  | "missing_refresh"     // No refresh token stored — must reconnect
  | "insufficient_scope"  // User didn't grant required permission
  | "redirect_mismatch"
  | "unauthorized_client" // App credentials not configured
  | "temporary"           // Network/rate-limit — do NOT disconnect
  | "unknown";

export class GoogleOAuthError extends Error {
  constructor(public readonly kind: GoogleTokenErrorKind, message: string) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

function classifyError(err: any): GoogleTokenErrorKind {
  const s = String(err?.error || err?.error_description || err?.message || err || "").toLowerCase();
  if (s.includes("invalid_grant") || s.includes("token has been expired or revoked")) return "invalid_grant";
  if (s.includes("token_revoked") || s.includes("revoked")) return "token_revoked";
  if (s.includes("insufficient_scope") || s.includes("access_denied")) return "insufficient_scope";
  if (s.includes("redirect_uri_mismatch")) return "redirect_mismatch";
  if (s.includes("unauthorized_client")) return "unauthorized_client";
  if (s.includes("quota") || s.includes("rate") || s.includes("429") || s.includes("503") || s.includes("econnreset") || s.includes("timeout")) return "temporary";
  return "unknown";
}

// ── Single-flight refresh guard ───────────────────────────────────────────────
// Prevents parallel requests from triggering simultaneous refreshes for the same platform.
const refreshInFlight = new Map<string, Promise<string>>();

// 5-minute buffer before expiry — refresh proactively
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// ── Load Google OAuth client credentials ─────────────────────────────────────
export async function loadGoogleClientCreds(): Promise<{ clientId: string; clientSecret: string }> {
  let clientId     = process.env.GOOGLE_CLIENT_ID     || "";
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  try {
    const r = await pool.query(
      `SELECT extra_fields_encrypted FROM social_platform_configs WHERE platform='google' LIMIT 1`
    );
    if (r.rows[0]?.extra_fields_encrypted) {
      const dec = JSON.parse(decrypt(r.rows[0].extra_fields_encrypted));
      clientId     = dec.client_id     || clientId;
      clientSecret = dec.client_secret || clientSecret;
    }
  } catch { /* fall through to env vars */ }

  if (!clientId || !clientSecret) {
    throw new GoogleOAuthError(
      "unauthorized_client",
      "Google OAuth credentials not configured — save Client ID and Client Secret in Social Connect settings"
    );
  }
  return { clientId, clientSecret };
}

// ── getValidGoogleToken — the central entry point for ALL Google API calls ────
// Returns a live access token, refreshing automatically if needed.
export async function getValidGoogleToken(platform: string): Promise<string> {
  const flightKey = `google:${platform}`;

  const row = await pool.query(
    `SELECT access_token, refresh_token, token_expiry, connection_status
     FROM oauth_connections WHERE provider='google' AND platform=$1 LIMIT 1`,
    [platform]
  ).then(r => r.rows[0]).catch(() => null);

  if (!row) {
    throw new GoogleOAuthError(
      "missing_refresh",
      `Google/${platform} is not connected — authorize it via Social Connect → OAuth Hub`
    );
  }

  // Decrypt access token
  let accessToken: string | null = null;
  try { if (row.access_token) accessToken = decrypt(row.access_token); } catch {}

  // Check if still valid with >5min buffer
  const expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  const stillValid = expiry > 0 && (expiry - Date.now()) > EXPIRY_BUFFER_MS;

  if (accessToken && stillValid) return accessToken;

  // Need refresh — single-flight to prevent concurrent duplicate refreshes
  if (refreshInFlight.has(flightKey)) return refreshInFlight.get(flightKey)!;

  const promise = doRefresh(platform, row.refresh_token).finally(() => {
    refreshInFlight.delete(flightKey);
  });
  refreshInFlight.set(flightKey, promise);
  return promise;
}

// ── doRefresh — performs the actual token exchange with Google ────────────────
async function doRefresh(platform: string, encryptedRefreshToken: string | null): Promise<string> {
  let refreshToken: string | null = null;
  try { if (encryptedRefreshToken) refreshToken = decrypt(encryptedRefreshToken); } catch {}

  if (!refreshToken) {
    await pool.query(
      `UPDATE oauth_connections
       SET connection_status='reconnect_required',
           last_error='No refresh token stored — reconnect required',
           updated_at=NOW()
       WHERE provider='google' AND platform=$1`,
      [platform]
    ).catch(() => {});
    throw new GoogleOAuthError(
      "missing_refresh",
      `Google/${platform} has no stored refresh token — please reconnect via Social Connect`
    );
  }

  let clientId: string, clientSecret: string;
  try {
    ({ clientId, clientSecret } = await loadGoogleClientCreds());
  } catch (e: any) {
    throw new GoogleOAuthError("unauthorized_client", e.message);
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data: any = await resp.json();

  if (data.error) {
    const kind = classifyError(data);

    if (kind === "temporary") {
      // Transient error — do NOT change connection status; caller can retry later
      throw new GoogleOAuthError(
        "temporary",
        `Google token refresh temporarily failed (${data.error}): ${data.error_description || ""}`.trim()
      );
    }

    // Permanent error — mark reconnect_required
    const errMsg = `${data.error}${data.error_description ? ": " + data.error_description : ""}`;
    await pool.query(
      `UPDATE oauth_connections
       SET connection_status='reconnect_required', last_error=$1, updated_at=NOW()
       WHERE provider='google' AND platform=$2`,
      [errMsg, platform]
    ).catch(() => {});

    const isRevoked = kind === "invalid_grant" || kind === "token_revoked";
    throw new GoogleOAuthError(
      kind,
      isRevoked
        ? `Google authorization has been revoked — please reconnect via Social Connect`
        : `Google token refresh failed: ${errMsg}`
    );
  }

  if (!data.access_token) {
    throw new GoogleOAuthError("unknown", "Google token refresh returned no access_token");
  }

  const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

  // Preserve existing refresh token if Google doesn't return a new one
  // NEVER overwrite a valid stored refresh_token with null/blank
  if (data.refresh_token) {
    await pool.query(
      `UPDATE oauth_connections
       SET access_token=$1, token_expiry=$2, refresh_token=$3,
           last_refresh_at=NOW(), connection_status='connected', last_error=NULL, updated_at=NOW()
       WHERE provider='google' AND platform=$4`,
      [encrypt(data.access_token), newExpiry, encrypt(data.refresh_token), platform]
    ).catch(() => {});
  } else {
    await pool.query(
      `UPDATE oauth_connections
       SET access_token=$1, token_expiry=$2,
           last_refresh_at=NOW(), connection_status='connected', last_error=NULL, updated_at=NOW()
       WHERE provider='google' AND platform=$3`,
      [encrypt(data.access_token), newExpiry, platform]
    ).catch(() => {});
  }

  console.log(`[GoogleOAuth] Token refreshed for google/${platform} — expires ${newExpiry.toISOString()}`);
  return data.access_token;
}

// ── withGoogleApi — auto-refresh + single retry wrapper ──────────────────────
// Usage:
//   const data = await withGoogleApi("google_calendar", token =>
//     fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
//   );
export async function withGoogleApi<T>(
  platform: string,
  fn: (accessToken: string) => Promise<T>
): Promise<T> {
  const token = await getValidGoogleToken(platform);

  let result: T;
  try {
    result = await fn(token);
  } catch (e: any) {
    // 401/403 from a Google API → force refresh once then retry
    const status = e?.status || e?.response?.status;
    const is401  = status === 401 || status === 403 || String(e?.message || "").includes("401");
    if (!is401) throw e;

    console.warn(`[GoogleOAuth] ${status || "auth error"} for google/${platform} — forcing refresh and retrying`);
    // Zero out expiry so getValidGoogleToken triggers a refresh
    await pool.query(
      `UPDATE oauth_connections SET token_expiry=NOW()-INTERVAL '1 hour'
       WHERE provider='google' AND platform=$1`, [platform]
    ).catch(() => {});
    const freshToken = await getValidGoogleToken(platform);
    result = await fn(freshToken);
  }

  // Mark last successful API call (fire-and-forget)
  pool.query(
    `UPDATE oauth_connections
     SET last_api_call_at=NOW(), connection_status='connected', last_error=NULL, updated_at=NOW()
     WHERE provider='google' AND platform=$1`, [platform]
  ).catch(() => {});

  return result;
}

// ── checkGooglePlatformHealth — lightweight health probe ─────────────────────
export async function checkGooglePlatformHealth(platform: string): Promise<{
  ok: boolean;
  status: "connected" | "reconnect_required" | "error" | "not_connected";
  error?: string;
  tokenExpiresAt?: string;
  email?: string;
}> {
  const row = await pool.query(
    `SELECT refresh_token FROM oauth_connections WHERE provider='google' AND platform=$1 LIMIT 1`, [platform]
  ).then(r => r.rows[0]).catch(() => null);

  if (!row) return { ok: false, status: "not_connected" };

  try {
    const token = await getValidGoogleToken(platform);

    // Call Google userinfo — lightweight, works for all Google scopes
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(8000),
    });

    if (r.ok) {
      const u: any = await r.json();
      const updated = await pool.query(
        `UPDATE oauth_connections
         SET last_api_call_at=NOW(), connection_status='connected', last_error=NULL, updated_at=NOW()
         WHERE provider='google' AND platform=$1 RETURNING token_expiry`, [platform]
      ).then(r2 => r2.rows[0]).catch(() => null);
      return {
        ok: true,
        status: "connected",
        tokenExpiresAt: updated?.token_expiry,
        email: u.email,
      };
    }

    const errBody: any = await r.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || `HTTP ${r.status}`;
    await pool.query(
      `UPDATE oauth_connections SET connection_status='error', last_error=$1, updated_at=NOW()
       WHERE provider='google' AND platform=$2`, [errMsg, platform]
    ).catch(() => {});
    return { ok: false, status: "error", error: errMsg };

  } catch (e: any) {
    const kind = (e as GoogleOAuthError)?.kind;
    const needsReconnect = kind === "invalid_grant" || kind === "token_revoked" || kind === "missing_refresh";
    const status: any = needsReconnect ? "reconnect_required" : "error";
    return { ok: false, status, error: e.message };
  }
}
