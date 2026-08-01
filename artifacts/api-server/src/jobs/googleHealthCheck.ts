// ── Google OAuth 6-hour health check cron ────────────────────────────────────
// Proactively refreshes tokens nearing expiry and tests a lightweight Google endpoint.
// Never disconnects providers due to temporary network or rate-limit errors.
// @ts-nocheck
import { pool } from "@workspace/db";
import { checkGooglePlatformHealth } from "../lib/googleOAuth.js";

const GOOGLE_PLATFORMS = [
  "google",
  "google_business",
  "google_calendar",
  "google_drive",
  "youtube",
];

// Refresh any token expiring within 30 minutes
const PROACTIVE_REFRESH_THRESHOLD_MS = 30 * 60 * 1000;

export async function runGoogleHealthCheck(): Promise<void> {
  console.log("[GoogleHealth] Starting 6-hour health check...");

  // 1. Find connected Google platforms (have a refresh_token)
  let rows: { platform: string; token_expiry: string | null }[] = [];
  try {
    const r = await pool.query(
      `SELECT platform, token_expiry
       FROM oauth_connections
       WHERE provider='google'
         AND refresh_token IS NOT NULL AND refresh_token != ''
       ORDER BY platform`
    );
    rows = r.rows;
  } catch (e: any) {
    console.error("[GoogleHealth] Failed to query connections:", e.message);
    return;
  }

  if (rows.length === 0) {
    console.log("[GoogleHealth] No connected Google accounts — nothing to check");
    return;
  }

  for (const row of rows) {
    const { platform, token_expiry } = row;

    // Check if token expires within the proactive refresh window
    const expiry = token_expiry ? new Date(token_expiry).getTime() : 0;
    const needsProactiveRefresh = expiry > 0 && (expiry - Date.now()) < PROACTIVE_REFRESH_THRESHOLD_MS;

    if (!needsProactiveRefresh && expiry > Date.now()) {
      // Token still has >30min remaining — just verify it's still accepted
      // Use a lightweight check but don't force a token exchange
    }

    try {
      const result = await checkGooglePlatformHealth(platform);
      if (result.ok) {
        console.log(`[GoogleHealth] google/${platform} ✓ connected — expires: ${result.tokenExpiresAt || "unknown"}`);
      } else if (result.status === "reconnect_required") {
        // Only log — never auto-disconnect
        console.warn(`[GoogleHealth] google/${platform} ⚠ reconnect_required: ${result.error}`);
      } else {
        // Temporary error — do not change connection status
        console.warn(`[GoogleHealth] google/${platform} ⚠ temporary error: ${result.error}`);
      }
    } catch (e: any) {
      // Catch-all for temporary failures — do NOT mark as disconnected
      console.warn(`[GoogleHealth] google/${platform} temporary failure (ignored): ${e.message}`);
    }

    // Small delay between platform checks to avoid rate-limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("[GoogleHealth] Health check complete");
}

export function startGoogleHealthCheckCron(): void {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  // Initial run after 2 minutes (allow server to fully start)
  setTimeout(() => {
    runGoogleHealthCheck().catch(e =>
      console.error("[GoogleHealth] Initial run error:", e.message)
    );
  }, 2 * 60 * 1000);

  // Recurring every 6 hours
  setInterval(() => {
    runGoogleHealthCheck().catch(e =>
      console.error("[GoogleHealth] Cron error:", e.message)
    );
  }, INTERVAL_MS);

  console.log("[GoogleHealth] Health check cron registered (interval: 6h)");
}
