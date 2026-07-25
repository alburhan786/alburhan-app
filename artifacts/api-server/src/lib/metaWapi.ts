// @ts-nocheck
/**
 * Meta WhatsApp Cloud API — direct graph.facebook.com integration
 *
 * Activated when META_ACCESS_TOKEN is set in environment secrets or api_settings.
 * Sends approved template messages outside the 24-hour customer session window.
 * Falls back gracefully to BotBee text API when not configured.
 *
 * Setup: Add META_ACCESS_TOKEN secret in Replit Secrets
 * (obtain from Meta Business Manager → System Users → Generate Token)
 */

import { getCachedConfig } from "./apiSettingsProvider.js";
import { pool } from "@workspace/db";

const META_GRAPH_VERSION = "v20.0";
export const META_PHONE_NUMBER_ID = "965912196611113";

export interface MetaTemplateResult {
  ok: boolean;
  provider: "MetaCloudAPI";
  endpoint: string;
  messageId?: string;
  wamid?: string;
  errorMessage?: string;
  httpStatus?: number;
  responsePayload?: unknown;
}

function getMetaCredentials() {
  const cfg = getCachedConfig("meta_wapi");
  const token = (cfg?.apiKey || process.env.META_ACCESS_TOKEN || "").trim();
  const phoneId = (cfg?.extra?.phone_number_id || process.env.META_PHONE_NUMBER_ID || META_PHONE_NUMBER_ID).trim();
  return { token, phoneId, enabled: !!token };
}

function toE164(mobile: string): string {
  if (!mobile) throw new Error("Missing mobile number");
  const clean = mobile.replace(/\D/g, "");
  if (!clean) throw new Error("Invalid mobile number");
  if (clean.length === 10) return `91${clean}`;
  return clean;
}

export function isMetaWapiConfigured(): boolean {
  return getMetaCredentials().enabled;
}

/**
 * Send a WhatsApp template message via Meta Cloud API.
 * templateName: exact name as approved in Meta Business Manager
 * variables: positional array matching {{1}}, {{2}}, ... in the template body
 */
export async function sendMetaTemplate(
  to: string,
  templateName: string,
  variables: string[],
  opts?: {
    eventType?: string;
    bookingId?: string;
    customerId?: string;
    customerName?: string;
    bookingNumber?: string;
    languageCode?: string;
  }
): Promise<MetaTemplateResult> {
  const { token, phoneId, enabled } = getMetaCredentials();
  const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneId}/messages`;

  if (!enabled) {
    return {
      ok: false,
      provider: "MetaCloudAPI",
      endpoint,
      errorMessage: "META_ACCESS_TOKEN not configured — add it in Replit Secrets",
    };
  }

  let phone: string;
  try {
    phone = toE164(to);
  } catch (err: any) {
    return { ok: false, provider: "MetaCloudAPI", endpoint, errorMessage: err?.message };
  }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: opts?.languageCode || "en" },
      ...(variables.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: variables.map((v) => ({
                  type: "text",
                  text: String(v ?? "-"),
                })),
              },
            ],
          }
        : {}),
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const httpStatus = response.status;
    const data = (await response.json()) as any;
    const messageId = data?.messages?.[0]?.id;
    const ok = response.ok && !!messageId;

    console.log(
      `[MetaWAPI] ${templateName} → ${phone} | HTTP ${httpStatus} | ok=${ok} | msgId=${messageId || "none"}${ok ? "" : " | err=" + (data?.error?.message || "unknown")}`
    );

    if (opts?.eventType) {
      await logMetaResult({
        eventType: opts.eventType,
        bookingId: opts.bookingId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        bookingNumber: opts.bookingNumber,
        recipient: to,
        templateName,
        messageId,
        status: ok ? "sent" : "failed",
        httpStatus,
        errorMessage: ok ? undefined : (data?.error?.message || `HTTP ${httpStatus}`),
        responsePayload: data,
      });
    }

    return {
      ok,
      provider: "MetaCloudAPI",
      endpoint,
      httpStatus,
      messageId,
      wamid: messageId,
      errorMessage: ok ? undefined : (data?.error?.message || `HTTP ${httpStatus}`),
      responsePayload: data,
    };
  } catch (err: any) {
    console.error(`[MetaWAPI] sendTemplate error:`, err?.message);
    return {
      ok: false,
      provider: "MetaCloudAPI",
      endpoint,
      errorMessage: err?.message || "Network error",
    };
  }
}

async function logMetaResult(opts: {
  eventType: string;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
  bookingNumber?: string;
  recipient: string;
  templateName: string;
  messageId?: string;
  status: "sent" | "failed";
  httpStatus?: number;
  errorMessage?: string;
  responsePayload?: unknown;
}) {
  try {
    const id = `nl_meta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, customer_id, booking_id, customer_name, booking_number,
        template, message, status, provider_name, api_endpoint, http_status,
        request_payload, provider_response, error_code, wamid, created_at, updated_at)
       VALUES ($1,$2,'whatsapp',$3,$4,$5,$6,$7,$8,$9,$10,'MetaCloudAPI',$11,$12,$13,$14,$15,$16,NOW(),NOW())`,
      [
        id,
        opts.eventType,
        opts.recipient,
        opts.customerId || null,
        opts.bookingId || null,
        opts.customerName || null,
        opts.bookingNumber || null,
        opts.templateName,
        `[meta:${opts.templateName}]`,
        opts.status,
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/messages`,
        opts.httpStatus || null,
        null,
        opts.responsePayload ? JSON.stringify(opts.responsePayload) : null,
        opts.errorMessage || null,
        opts.messageId || null,
      ]
    );
  } catch (err) {
    console.error("[MetaWAPI] logMetaResult failed:", err);
  }
}

/**
 * Health check — verifies Meta Cloud API credentials are configured
 * and optionally pings the Graph API to confirm the token is valid.
 */
export async function checkMetaWapiHealth(): Promise<{
  status: "ok" | "degraded" | "down";
  detail: string;
  configured: boolean;
}> {
  const { token, phoneId, enabled } = getMetaCredentials();
  if (!enabled) {
    return { status: "degraded", detail: "META_ACCESS_TOKEN not set — WhatsApp using session-based fallback", configured: false };
  }

  try {
    const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneId}?fields=display_phone_number,verified_name`;
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await res.json()) as any;
    if (res.ok && data?.display_phone_number) {
      return {
        status: "ok",
        detail: `Meta Cloud API connected — ${data.display_phone_number} (${data.verified_name || "verified"})`,
        configured: true,
      };
    }
    return {
      status: "down",
      detail: `Meta Cloud API error: ${data?.error?.message || `HTTP ${res.status}`}`,
      configured: true,
    };
  } catch (err: any) {
    return { status: "down", detail: `Meta Cloud API unreachable: ${err?.message}`, configured: true };
  }
}
