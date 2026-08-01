// @ts-nocheck
import webPush from "web-push";
import { pool } from "@workspace/db";
import crypto from "crypto";

const VAPID_SUBJECT = "mailto:admin@alburhantravels.com";

let _vapidKeys: { publicKey: string; privateKey: string } | null = null;

async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (_vapidKeys) return _vapidKeys;
  try {
    const res = await pool.query(
      `SELECT value FROM api_settings WHERE key = 'vapid_keys' LIMIT 1`
    );
    if (res.rows[0]?.value) {
      try {
        _vapidKeys = JSON.parse(res.rows[0].value);
        return _vapidKeys!;
      } catch { /* corrupt — regenerate */ }
    }
    // Generate and persist
    const keys = webPush.generateVAPIDKeys();
    await pool.query(
      `INSERT INTO api_settings (key, value, updated_at)
       VALUES ('vapid_keys', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(keys)]
    );
    console.log("[WebPush] Generated new VAPID keys");
    _vapidKeys = keys;
    return keys;
  } catch (err: any) {
    console.error("[WebPush] Failed to get/generate VAPID keys:", err.message);
    // In-memory fallback (not persisted — will regenerate on restart, breaking existing subs)
    _vapidKeys = webPush.generateVAPIDKeys();
    return _vapidKeys;
  }
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await getVapidKeys();
  return keys.publicKey;
}

export async function sendPushToCustomer(
  customerId: string,
  payload: { title: string; body: string; url?: string; icon?: string; tag?: string }
): Promise<{ ok: boolean; sent: number; failed: number; total: number }> {
  try {
    const keys = await getVapidKeys();
    webPush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);

    const res = await pool.query(
      `SELECT id, subscription FROM customer_push_tokens
       WHERE customer_id = $1 AND subscription IS NOT NULL`,
      [customerId]
    );

    if (res.rows.length === 0) {
      return { ok: false, sent: 0, failed: 0, total: 0 };
    }

    const payloadStr = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "https://alburhantravels.com/customer/dashboard",
      icon: payload.icon || "/opengraph.jpg",
      tag: payload.tag || "alburhan-notification",
    });

    let sent = 0; let failed = 0;
    await Promise.allSettled(
      res.rows.map(async (row) => {
        try {
          const sub = typeof row.subscription === "string"
            ? JSON.parse(row.subscription) : row.subscription;
          await webPush.sendNotification(sub, payloadStr);
          sent++;
        } catch (err: any) {
          failed++;
          // 410 Gone = subscription expired/invalid — remove it
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pool.query(`DELETE FROM customer_push_tokens WHERE id = $1`, [row.id])
              .catch(() => {});
            console.log(`[WebPush] Removed stale subscription ${row.id} (HTTP ${err.statusCode})`);
          } else {
            console.warn(`[WebPush] Push failed for token ${row.id}:`, err.message);
          }
        }
      })
    );

    console.log(`[WebPush] sendPushToCustomer: customer=${customerId} sent=${sent}/${res.rows.length}`);
    return { ok: sent > 0, sent, failed, total: res.rows.length };
  } catch (err: any) {
    console.error("[WebPush] sendPushToCustomer error:", err.message);
    return { ok: false, sent: 0, failed: 1, total: 0 };
  }
}

export async function sendPushToAllCustomers(
  payload: { title: string; body: string; url?: string }
): Promise<{ ok: boolean; sent: number; failed: number; total: number }> {
  try {
    const keys = await getVapidKeys();
    webPush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);

    const res = await pool.query(
      `SELECT id, customer_id, subscription FROM customer_push_tokens WHERE subscription IS NOT NULL`
    );
    if (res.rows.length === 0) return { ok: false, sent: 0, failed: 0, total: 0 };

    const payloadStr = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "https://alburhantravels.com/customer/dashboard",
      icon: "/opengraph.jpg",
      tag: "alburhan-broadcast",
    });

    let sent = 0; let failed = 0;
    await Promise.allSettled(
      res.rows.map(async (row) => {
        try {
          const sub = typeof row.subscription === "string"
            ? JSON.parse(row.subscription) : row.subscription;
          await webPush.sendNotification(sub, payloadStr);
          sent++;
        } catch (err: any) {
          failed++;
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pool.query(`DELETE FROM customer_push_tokens WHERE id = $1`, [row.id]).catch(() => {});
          }
        }
      })
    );
    return { ok: sent > 0, sent, failed, total: res.rows.length };
  } catch (err: any) {
    console.error("[WebPush] broadcast error:", err.message);
    return { ok: false, sent: 0, failed: 1, total: 0 };
  }
}

export async function storeSubscription(
  customerId: string,
  subscription: object,
  platform = "web"
): Promise<void> {
  const endpoint = (subscription as any).endpoint || "";
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO customer_push_tokens (id, customer_id, token, subscription, platform, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (customer_id, token) DO UPDATE
       SET subscription = $4, platform = $5`,
    [id, customerId, endpoint, JSON.stringify(subscription), platform]
  );
}

export async function removeSubscription(customerId: string, endpoint: string): Promise<void> {
  await pool.query(
    `DELETE FROM customer_push_tokens WHERE customer_id = $1 AND token = $2`,
    [customerId, endpoint]
  );
}

export async function getSubscriptionCount(customerId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) AS n FROM customer_push_tokens WHERE customer_id = $1 AND subscription IS NOT NULL`,
    [customerId]
  );
  return parseInt(res.rows[0]?.n || "0", 10);
}
