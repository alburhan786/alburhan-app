/**
 * NotificationService — Priority-Waterfall Orchestrator
 *
 * Priority: WhatsApp → SMS → RCS → Email → Push
 *
 * sendWaterfall() tries each enabled channel in order; stops on first success.
 * sendToAllChannels() fires all channels simultaneously (for Test All / broadcasts).
 */
import { pool } from "@workspace/db";
import { sendWhatsApp, sendRCS, sendEmail } from "./notifications.js";
import { sendCustomSMS } from "./sms.js";
import {
  buildDefaultMessage,
  applyTemplate,
  trackNotification,
  type Channel,
  type EventType,
  type NotificationContext,
} from "./notificationEngine.js";

export const CHANNEL_PRIORITY: Channel[] = ["whatsapp", "sms", "rcs", "email", "push"];

export interface ChannelAttempt {
  channel: Channel;
  status: "sent" | "failed";
  provider: string;
  httpStatus?: number;
  errorMessage?: string;
  messageId?: string;
  responsePayload?: unknown;
}

export interface WaterfallResult {
  delivered: boolean;
  deliveredChannel?: Channel;
  attempts: ChannelAttempt[];
}

function buildEmailSubjectFromEvent(eventType: EventType, ctx: NotificationContext): string {
  const bn = ctx.bookingNumber ? ` #${ctx.bookingNumber}` : "";
  const map: Partial<Record<EventType, string>> = {
    new_booking: `Booking Received${bn} – Al Burhan`,
    booking_approved: `Booking Approved${bn} – Al Burhan`,
    booking_rejected: `Booking Rejected${bn} – Al Burhan`,
    booking_cancelled: `Booking Cancelled${bn} – Al Burhan`,
    booking_completed: `Journey Complete${bn} – Al Burhan`,
    payment_received: `Payment Received${bn} – Al Burhan`,
    partial_payment: `Partial Payment Received${bn} – Al Burhan`,
    payment_due: `Payment Reminder${bn} – Al Burhan`,
    payment_failed: `Payment Failed${bn} – Al Burhan`,
    balance_reminder: `Balance Due${bn} – Al Burhan`,
    refund: `Refund Processed${bn} – Al Burhan`,
    invoice_generated: `Invoice Ready${bn} – Al Burhan`,
    visa_approved: `Visa Approved${bn} – Al Burhan`,
    visa_ready: `Visa Issued${bn} – Al Burhan`,
    ticket_issued: `Flight Ticket Issued${bn} – Al Burhan`,
    departure_reminder: `Departure Reminder – Al Burhan`,
    arrival_reminder: `Arrival Welcome – Al Burhan`,
    feedback_request: `Share Your Experience – Al Burhan`,
  };
  return map[eventType] || `Update from Al Burhan Tours & Travels`;
}

async function sendOneChannel(
  channel: Channel,
  eventType: EventType,
  ctx: NotificationContext,
  message: string
): Promise<ChannelAttempt> {
  try {
    if (channel === "whatsapp") {
      const r = await sendWhatsApp(ctx.customerMobile, message);
      return { channel, status: r.ok ? "sent" : "failed", provider: "BotBee", httpStatus: r.httpStatus, errorMessage: r.ok ? undefined : (r.errorMessage || "WhatsApp failed"), responsePayload: r.responsePayload };
    }
    if (channel === "sms") {
      // sendCustomSMS routes through DLT validation — Quick/Promotional routes are blocked.
      // Will return ok:false with "SMS BLOCKED" if no DLT template is configured.
      const r = await sendCustomSMS({ mobile: ctx.customerMobile, message }).catch((e: any) => ({ ok: false as const, provider: "Fast2SMS" as const, endpoint: "", errorMessage: e?.message || "SMS error" }));
      return { channel, status: r.ok ? "sent" : "failed", provider: "Fast2SMS", errorMessage: r.ok ? undefined : ((r as any).errorMessage || "SMS failed"), responsePayload: r };
    }
    if (channel === "rcs") {
      const r = await sendRCS(ctx.customerMobile, ctx.customerName, message);
      return { channel, status: r.ok ? "sent" : "failed", provider: "LeminAI", httpStatus: r.httpStatus, errorMessage: r.ok ? undefined : (r.errorMessage || "RCS failed"), responsePayload: r.responsePayload };
    }
    if (channel === "email") {
      if (!ctx.customerEmail) return { channel, status: "failed", provider: "SMTP", errorMessage: "No email address" };
      const subject = buildEmailSubjectFromEvent(eventType, ctx);
      const r = await sendEmail(ctx.customerEmail, subject, message.replace(/\n/g, "<br>"));
      return { channel, status: r.ok ? "sent" : "failed", provider: "SMTP", httpStatus: r.httpStatus, errorMessage: r.ok ? undefined : (r.errorMessage || "Email failed"), responsePayload: r.responsePayload };
    }
    return { channel, status: "failed", provider: "Push", errorMessage: "Push not configured — Firebase credentials required" };
  } catch (err: unknown) {
    return { channel, status: "failed", provider: "unknown", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

async function getCustomTemplate(eventType: string): Promise<string | null> {
  try {
    const res = await pool.query(
      `SELECT t.body FROM notification_templates t
       JOIN notification_settings s ON s.template_id = t.id
       WHERE s.event_type=$1 AND s.enabled=true LIMIT 1`,
      [eventType]
    );
    return res.rows[0]?.body || null;
  } catch {
    return null;
  }
}

async function getEnabledChannels(eventType: string): Promise<Channel[]> {
  try {
    const res = await pool.query(
      `SELECT channel FROM notification_settings WHERE event_type=$1 AND enabled=true`,
      [eventType]
    );
    if (res.rows.length === 0) return ["whatsapp", "sms"];
    return res.rows.map((r: any) => r.channel as Channel);
  } catch {
    return ["whatsapp", "sms"];
  }
}

/**
 * Priority waterfall: tries channels in order (WhatsApp → SMS → RCS → Email → Push).
 * Stops on first successful delivery. Logs every attempt to notification_logs.
 */
export async function sendWaterfall(
  eventType: EventType,
  ctx: NotificationContext,
  enabledChannels?: Channel[]
): Promise<WaterfallResult> {
  const channels = enabledChannels ?? await getEnabledChannels(eventType);
  const orderedChannels = CHANNEL_PRIORITY.filter(c => channels.includes(c));
  const templateBody = await getCustomTemplate(eventType);
  const message = templateBody ? applyTemplate(templateBody, ctx) : buildDefaultMessage(eventType, ctx);
  const attempts: ChannelAttempt[] = [];

  for (const channel of orderedChannels) {
    const attempt = await sendOneChannel(channel, eventType, ctx, message);
    await trackNotification({
      eventType, channel,
      recipient: channel === "email" ? (ctx.customerEmail || ctx.customerMobile) : ctx.customerMobile,
      customerId: ctx.customerId, bookingId: ctx.bookingId,
      message, status: attempt.status,
      provider: attempt.provider,
      providerResponse: attempt.responsePayload ?? { ok: attempt.status === "sent", provider: attempt.provider, errorMessage: attempt.errorMessage },
    });
    attempts.push(attempt);

    if (attempt.status === "sent") {
      return { delivered: true, deliveredChannel: channel, attempts };
    }
    console.log(`[notificationService] ${channel} failed for ${eventType} (${ctx.customerMobile}) — trying next channel`);
  }

  return { delivered: false, attempts };
}

/**
 * Fire all channels simultaneously (Test All / broadcast use-case).
 * Does NOT stop on success — fires every channel regardless.
 */
export async function sendToAllChannels(
  eventType: EventType,
  ctx: NotificationContext,
  channels: Channel[],
  customMessage?: string
): Promise<ChannelAttempt[]> {
  const templateBody = await getCustomTemplate(eventType);
  const message = customMessage ?? (templateBody ? applyTemplate(templateBody, ctx) : buildDefaultMessage(eventType, ctx));

  const results = await Promise.allSettled(
    channels.map(ch => sendOneChannel(ch, eventType, ctx, message))
  );

  const attempts: ChannelAttempt[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { channel: channels[i], status: "failed" as const, provider: "unknown", errorMessage: r.reason?.message || "Unknown error" };
  });

  await Promise.allSettled(
    attempts.map((a) =>
      trackNotification({
        eventType, channel: a.channel,
        recipient: a.channel === "email" ? (ctx.customerEmail || ctx.customerMobile) : ctx.customerMobile,
        customerId: ctx.customerId, bookingId: ctx.bookingId,
        message, status: a.status,
        provider: a.provider,
        providerResponse: a.responsePayload ?? { ok: a.status === "sent", provider: a.provider, errorMessage: a.errorMessage },
      })
    )
  );

  return attempts;
}

/**
 * Convenience: fire event using waterfall for a single customer.
 * Drop-in replacement for fireNotificationEvent() in notificationEngine.
 */
export async function fireEvent(eventType: EventType, ctx: NotificationContext): Promise<WaterfallResult> {
  return sendWaterfall(eventType, ctx);
}
